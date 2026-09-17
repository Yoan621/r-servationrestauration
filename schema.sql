-- =====================================================================
-- Fricaccia — CRM Réservation en ligne — schéma Supabase (Postgres)
-- Inspiré du pattern TR Réflexologie (Supabase + Edge Functions + RLS)
-- + concepts OpenResto (github.com/karanshukla/openresto) : table holds,
--   booking pause, floor sections, activity trail, API keys scopées,
--   GDPR hard-delete, booking ref sans compte client.
-- À appliquer sur un projet Supabase réel (non provisionné à ce stade —
-- validation fondateur requise avant tout déploiement, cf CLAUDE.md).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restaurants (multi-établissement : Montpellier / Perpignan)
-- ---------------------------------------------------------------------
create table restaurants (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,                 -- 'Fricaccia Montpellier'
  slug                  text unique not null,           -- 'montpellier' -> URL /montpellier
  timezone              text not null default 'Europe/Paris', -- IANA, pattern OpenResto
  horaires_midi         jsonb,                          -- {ouverture:'11:30', fermeture:'14:30', jours:[...]}
  horaires_soir         jsonb,
  duree_moyenne_min     int not null default 90,        -- durée moyenne réservation
  capacite_max          int,
  taille_max_table      int,
  delai_min_resa_min    int not null default 0,         -- délai mini avant résa (minutes)
  delai_max_resa_jours  int not null default 60,
  temps_tampon_min      int not null default 0,         -- tampon entre 2 résas même table
  jours_fermeture       jsonb,                          -- jours fériés / fermetures ponctuelles
  bookings_paused_until timestamptz,                    -- pattern OpenResto : coupe les résas sans toucher config
  zelty_compte_id       text,                           -- identifiant compte Zelty (si connecté)
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Plan de salle : sections (floor sections, pattern OpenResto)
-- ---------------------------------------------------------------------
create table sections_salle (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  nom            text not null,       -- 'Terrasse', 'Bar', 'Salle principale'
  ordre          int not null default 0
);

create table tables_salle (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  section_id     uuid references sections_salle(id) on delete set null,
  numero         text not null,       -- 'T1', 'T12'
  capacite       int not null,
  regroupable_avec uuid[] default '{}', -- ids d'autres tables_salle pour regroupement
  created_at     timestamptz not null default now(),
  unique(restaurant_id, numero)
);

-- ---------------------------------------------------------------------
-- 3. Clients (fiche client — spec §10)
-- ---------------------------------------------------------------------
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text,
  prenom              text,
  email               text,
  telephone           text,
  anniversaire        date,
  allergies           text,
  vip                 boolean not null default false,
  consentement_marketing boolean not null default false,
  consentement_le     timestamptz,
  notes_internes      text,
  supprime_le         timestamptz,          -- soft marker avant hard-delete GDPR (voir fonction plus bas)
  created_at          timestamptz not null default now(),
  unique(email),
  unique(telephone)
);

-- ---------------------------------------------------------------------
-- 4. Liens de réservation (widget/backoffice — tracking source)
-- ---------------------------------------------------------------------
create table liens_reservation (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  source         text not null,       -- 'site' | 'instagram' | 'google' | 'qr' | 'whatsapp' | 'interne'
  label          text,
  clics          int not null default 0,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Réservations
-- ---------------------------------------------------------------------
create type statut_reservation as enum (
  'nouvelle','confirmee','rappelee','en_retard','arrivee','installee',
  'commande_prise','terminee','a_nettoyer','annulee','no_show'
);

create table reservations (
  id               uuid primary key default gen_random_uuid(),
  booking_ref      text not null unique,           -- code court public (pattern OpenResto, pas de compte client)
  restaurant_id    uuid not null references restaurants(id),
  client_id        uuid references clients(id),
  lien_id          uuid references liens_reservation(id),
  table_id         uuid references tables_salle(id),
  date_resa        date not null,
  heure_resa       time not null,
  nb_personnes     int not null,
  statut           statut_reservation not null default 'nouvelle',
  source           text not null default 'site',   -- site/téléphone/Instagram/WhatsApp/Google/spontané/interne
  demande_particuliere text,
  note_interne     text,
  heure_arrivee    timestamptz,
  heure_installation timestamptz,
  heure_fin        timestamptz,
  created_by       uuid,                            -- utilisateur BO si résa manuelle (sinon null = site)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_reservations_resto_date on reservations(restaurant_id, date_resa);
create index idx_reservations_statut on reservations(statut);

-- ---------------------------------------------------------------------
-- 6. Table holds — pattern OpenResto (verrou 5min pendant checkout)
-- ---------------------------------------------------------------------
create table table_holds (
  id             uuid primary key default gen_random_uuid(),
  hold_token     text not null unique,     -- renvoyé au client, doit être ré-échoé au submit
  restaurant_id  uuid not null references restaurants(id),
  table_id       uuid references tables_salle(id),
  date_resa      date not null,
  heure_resa     time not null,
  expires_at     timestamptz not null default (now() + interval '5 minutes'),
  created_at     timestamptz not null default now()
);
-- purge des holds expirés : pg_cron toutes les minutes
-- select cron.schedule('purge-table-holds', '* * * * *', $$ delete from table_holds where expires_at < now() $$);

-- ---------------------------------------------------------------------
-- 7. Indisponibilités (blocage manuel de créneaux — pattern TR)
-- ---------------------------------------------------------------------
create table indisponibilites (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  table_id       uuid references tables_salle(id),   -- null = tout le restaurant
  date_blocage   date not null,
  heure_blocage  time,                                -- null = journée entière
  motif          text,                                -- privé, jamais exposé publiquement
  created_at     timestamptz not null default now(),
  unique(restaurant_id, table_id, date_blocage, heure_blocage)
);

-- ---------------------------------------------------------------------
-- 8. Liste d'attente
-- ---------------------------------------------------------------------
create table liste_attente (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  client_id      uuid references clients(id),
  nb_personnes   int not null,
  heure_arrivee  timestamptz not null default now(),
  preference_zone text,
  attente_estimee_min int,
  statut         text not null default 'attente',   -- attente | confirmee | expiree | placee
  expire_a       timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. Utilisateurs / rôles (équipe BackOffice)
-- ---------------------------------------------------------------------
create type role_utilisateur as enum ('admin','responsable','salle','lecture');

create table utilisateurs_roles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  role           role_utilisateur not null default 'salle',
  restaurant_id  uuid references restaurants(id),   -- null si admin (accès tous restaurants)
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 10. Clés API scopées — pattern OpenResto (intégrations Zelty/marketing)
-- ---------------------------------------------------------------------
create table api_keys (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid references restaurants(id),   -- null = toutes (admin)
  nom            text not null,
  token_hash     text not null,                      -- hash du token, jamais le token en clair
  scopes         text[] not null default '{}',       -- ex: ['bookings','tables'] -- PAS 'guests' pour Zelty
  created_by     uuid references auth.users(id),
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11. Journal Zelty (sync log — spec §16)
-- ---------------------------------------------------------------------
create table zelty_sync_log (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id),
  type_evenement text not null,     -- 'sync_ok' | 'sync_error' | 'reconnect'
  detail         jsonb,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 12. Activity trail — pattern OpenResto (append-only, owner-only, no delete)
-- ---------------------------------------------------------------------
create table activity_log (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid references restaurants(id),
  user_id        uuid references auth.users(id),
  action         text not null,          -- 'reservation.update' | 'auth.signin' | 'auth.signin_failed' | ...
  ip_adresse     inet,
  avant          jsonb,                   -- diff avant (données sensibles masquées)
  apres          jsonb,                   -- diff après
  created_at     timestamptz not null default now()
);
-- rétention 365j : purge cron, jamais de delete manuel/API
-- select cron.schedule('purge-activity-log', '0 3 * * *', $$ delete from activity_log where created_at < now() - interval '365 days' $$);

-- =====================================================================
-- RLS — activé sur toutes les tables sensibles
-- =====================================================================
alter table reservations enable row level security;
alter table clients enable row level security;
alter table indisponibilites enable row level security;
alter table liste_attente enable row level security;
alter table table_holds enable row level security;
alter table activity_log enable row level security;
alter table api_keys enable row level security;
alter table utilisateurs_roles enable row level security;

-- Équipe authentifiée : accès scopé à son restaurant (sauf admin = tous)
create policy "equipe_reservations_select" on reservations for select to authenticated
  using (
    exists (select 1 from utilisateurs_roles ur where ur.user_id = auth.uid()
            and (ur.role = 'admin' or ur.restaurant_id = reservations.restaurant_id))
  );
create policy "equipe_reservations_write" on reservations for all to authenticated
  using (
    exists (select 1 from utilisateurs_roles ur where ur.user_id = auth.uid()
            and ur.role in ('admin','responsable','salle')
            and (ur.role = 'admin' or ur.restaurant_id = reservations.restaurant_id))
  );

-- Rôle lecture : SELECT uniquement, jamais d'écriture (policy write ci-dessus l'exclut déjà)

-- anon (widget public) : peut insérer une réservation, ne peut RIEN lire (pas de fuite client)
create policy "anon_insert_reservation" on reservations for insert to anon
  with check (true);

-- anon : lookup de sa propre résa par booking_ref (pas de liste, un id à la fois côté API)
create policy "anon_select_own_by_ref" on reservations for select to anon
  using (false); -- lookup réel se fait via une fonction sécurisée (RPC), pas un select direct

-- activity_log : lecture réservée aux admin, AUCUNE policy delete (append-only garanti)
create policy "admin_activity_log_select" on activity_log for select to authenticated
  using (exists (select 1 from utilisateurs_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
create policy "system_activity_log_insert" on activity_log for insert to authenticated
  with check (true);

-- =====================================================================
-- Fonction GDPR hard-delete (pattern OpenResto)
-- =====================================================================
create or replace function delete_client_data(p_client_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update reservations
     set client_id = null,
         demande_particuliere = null,
         note_interne = '[anonymisé RGPD]'
   where client_id = p_client_id;

  delete from liste_attente where client_id = p_client_id;
  delete from clients where id = p_client_id;

  insert into activity_log(action, apres) values ('gdpr.hard_delete', jsonb_build_object('client_id', p_client_id));
end;
$$;
