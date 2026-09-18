-- =====================================================================
-- Migration 2 : seed restaurants + fonctions RPC sécurisées
-- (widget public écrit désormais dans Supabase au lieu de localStorage,
-- passe uniquement par ces fonctions — jamais d'accès direct table
-- depuis la clé publishable, donc pas besoin de policies RLS anon
-- supplémentaires sur clients/restaurants).
-- =====================================================================

insert into restaurants (nom, slug, delai_min_resa_min)
values
  ('Fricaccia Montpellier', 'montpellier', 120),
  ('Fricaccia Perpignan', 'perpignan', 120)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
create or replace function public.restaurant_id_by_slug(p_slug text)
returns uuid
language sql
security definer
stable
as $$
  select id from restaurants where slug = p_slug limit 1;
$$;
grant execute on function public.restaurant_id_by_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------
create or replace function public.generer_booking_ref()
returns text
language plpgsql
security definer
as $$
declare
  v_ref text;
  v_exists boolean;
begin
  loop
    v_ref := upper(substr(md5(random()::text), 1, 6));
    select exists(select 1 from reservations where booking_ref = v_ref) into v_exists;
    exit when not v_exists;
  end loop;
  return v_ref;
end;
$$;

-- ---------------------------------------------------------------------
-- Création réservation (upsert client par email + insert réservation)
create or replace function public.creer_reservation(
  p_restaurant_slug text,
  p_date date,
  p_heure time,
  p_pax int,
  p_prenom text,
  p_nom text,
  p_email text,
  p_tel text,
  p_note text,
  p_offres_email boolean,
  p_offres_sms boolean,
  p_source text default 'site'
)
returns text
language plpgsql
security definer
as $$
declare
  v_restaurant_id uuid;
  v_client_id uuid;
  v_booking_ref text;
begin
  select id into v_restaurant_id from restaurants where slug = p_restaurant_slug;
  if v_restaurant_id is null then
    raise exception 'restaurant inconnu: %', p_restaurant_slug;
  end if;

  insert into clients (nom, prenom, email, telephone, consentement_marketing, consentement_le)
  values (p_nom, p_prenom, p_email, p_tel, (p_offres_email or p_offres_sms),
          case when (p_offres_email or p_offres_sms) then now() else null end)
  on conflict (email) do update
    set nom = excluded.nom, prenom = excluded.prenom, telephone = excluded.telephone,
        consentement_marketing = excluded.consentement_marketing,
        consentement_le = case when excluded.consentement_marketing then now() else clients.consentement_le end
  returning id into v_client_id;

  v_booking_ref := generer_booking_ref();

  insert into reservations (booking_ref, restaurant_id, client_id, date_resa, heure_resa, nb_personnes, demande_particuliere, source)
  values (v_booking_ref, v_restaurant_id, v_client_id, p_date, p_heure, p_pax, nullif(p_note, ''), p_source);

  return v_booking_ref;
end;
$$;
grant execute on function public.creer_reservation(text,date,time,int,text,text,text,text,text,boolean,boolean,text) to anon;

-- ---------------------------------------------------------------------
-- Lookup pour page annulation (preuve de possession = booking_ref + email)
create or replace function public.chercher_reservation(p_booking_ref text, p_email text)
returns table(
  id uuid, booking_ref text, restaurant_nom text, date_resa date, heure_resa time,
  nb_personnes int, statut statut_reservation, prenom text, nom text, email text, telephone text
)
language sql
security definer
stable
as $$
  select r.id, r.booking_ref, res.nom, r.date_resa, r.heure_resa, r.nb_personnes, r.statut,
         c.prenom, c.nom, c.email, c.telephone
  from reservations r
  join clients c on c.id = r.client_id
  join restaurants res on res.id = r.restaurant_id
  where r.booking_ref = upper(p_booking_ref) and lower(c.email) = lower(p_email);
$$;
grant execute on function public.chercher_reservation(text,text) to anon;

-- ---------------------------------------------------------------------
-- Historique (même client, réservations passées + à venir)
create or replace function public.mes_reservations(p_booking_ref text, p_email text)
returns table(
  id uuid, booking_ref text, restaurant_nom text, date_resa date, heure_resa time,
  nb_personnes int, statut statut_reservation
)
language sql
security definer
stable
as $$
  select r2.id, r2.booking_ref, res.nom, r2.date_resa, r2.heure_resa, r2.nb_personnes, r2.statut
  from reservations r1
  join clients c on c.id = r1.client_id
  join reservations r2 on r2.client_id = c.id
  join restaurants res on res.id = r2.restaurant_id
  where r1.booking_ref = upper(p_booking_ref) and lower(c.email) = lower(p_email)
  order by r2.date_resa desc;
$$;
grant execute on function public.mes_reservations(text,text) to anon;

-- ---------------------------------------------------------------------
-- Annulation (même preuve de possession)
create or replace function public.annuler_reservation(p_booking_ref text, p_email text, p_motif text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_id uuid;
  v_restaurant_id uuid;
begin
  select r.id, r.restaurant_id into v_id, v_restaurant_id
  from reservations r join clients c on c.id = r.client_id
  where r.booking_ref = upper(p_booking_ref) and lower(c.email) = lower(p_email)
    and r.statut not in ('annulee','terminee','no_show');

  if v_id is null then
    return false;
  end if;

  update reservations
     set statut = 'annulee',
         note_interne = coalesce(note_interne || ' | ', '') || 'Annulée par client : ' || coalesce(p_motif, 'non précisé'),
         updated_at = now()
   where id = v_id;

  insert into activity_log(restaurant_id, action, apres)
  values (v_restaurant_id, 'reservation.cancel_by_client', jsonb_build_object('booking_ref', p_booking_ref, 'motif', p_motif));

  return true;
end;
$$;
grant execute on function public.annuler_reservation(text,text,text) to anon;
