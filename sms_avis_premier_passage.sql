-- =====================================================================
-- SMS avis Google après 1er passage — Montpellier
-- Doc : 04_CRM/sms-campagne-avis-premier-passage.md
-- STATUT : brouillon, NON appliqué. Tester sur une branche Supabase d'abord.
-- =====================================================================

alter table clients
  add column if not exists sms_avis_envoye_le  timestamptz,
  add column if not exists sms_avis_relance_le timestamptz,
  add column if not exists sms_avis_variante   text;          -- 'A' | 'B' | 'C'

-- Prochain créneau d'envoi autorisé : fin + 2 h si <= 19h30 (heure Paris),
-- sinon lendemain 11h00 ; dimanche / jour férié -> jour ouvré suivant 11h00.
-- Jours fériés lus dans restaurants.jours_fermeture (tableau de dates ISO).
create or replace function sms_avis_prochain_envoi(p_fin timestamptz, p_feries jsonb)
returns timestamptz
language plpgsql stable as $$
declare
  t timestamp := (p_fin at time zone 'Europe/Paris') + interval '2 hours';
begin
  if t::time > time '19:30' or t::time < time '08:00' then
    t := (t::date + case when t::time < time '08:00' then 0 else 1 end) + time '11:00';
  end if;
  while extract(isodow from t) = 7
     or coalesce(p_feries, '[]'::jsonb) ? to_char(t::date, 'YYYY-MM-DD') loop
    t := (t::date + 1) + time '11:00';
  end loop;
  return t at time zone 'Europe/Paris';
end $$;

create or replace view v_sms_avis_eligibles as
with premiere_visite as (
  select distinct on (r.client_id)
         r.client_id, r.id as reservation_id, r.restaurant_id, r.heure_fin
  from reservations r
  where r.statut = 'terminee' and r.heure_fin is not null and r.client_id is not null
  order by r.client_id, r.heure_fin
)
select c.id as client_id,
       c.prenom,
       c.telephone,
       pv.reservation_id,
       sms_avis_prochain_envoi(pv.heure_fin, rs.jours_fermeture) as envoi_prevu_a
from premiere_visite pv
join clients c      on c.id = pv.client_id
join restaurants rs on rs.id = pv.restaurant_id
where rs.slug = 'montpellier'
  and c.consentement_marketing
  and c.supprime_le is null
  and c.sms_avis_envoye_le is null
  and c.telephone ~ '^(\+33|0)[67]'            -- mobiles FR uniquement
  and pv.heure_fin > now() - interval '7 days'; -- pas de rattrapage massif au 1er run

-- Le cron (Edge Function send-sms-avis, toutes les 15 min) sélectionne
--   select * from v_sms_avis_eligibles where envoi_prevu_a <= now();
-- envoie via Brevo, puis :
--   update clients set sms_avis_envoye_le = now(), sms_avis_variante = $v where id = $id;
-- Relance R1 : sms_avis_envoye_le <= now() - interval '4 days', sms_avis_relance_le is null,
-- aucun clic sur la redirection, consentement toujours actif -> 18h00 heure Paris.
