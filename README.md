# CRM Réservation en ligne — Fricaccia (Montpellier / Perpignan)

BackOffice temps réel pour gérer flux client (arrivées, statuts, plan de salle, liste d'attente) + réservations manuelles + intégration Zelty. Spec fonctionnelle complète : voir `spec-fonctionnelle.md`.

## Stack proposée — inspirée TR Réflexologie ([[project_tr_reflexologie]])

TR = référence car même besoin : booking widget public + backoffice temps réel + notifs auto, sans stack lourde.

| Brique | Choix | Pourquoi (retour TR) |
|---|---|---|
| Backend | **Supabase** (Postgres + Auth + RLS + Realtime + Edge Functions) | API externe, marche même si front reste statique. Compte unique, multi-restaurant géré par `restaurant_id` + RLS scoping (pas 2 projets Supabase séparés). |
| Temps réel dashboard | **Supabase Realtime** (subscribe sur table `reservations`/`tables_statut`) | Remplace polling. TR n'avait pas ce besoin (pas de dashboard live) mais Realtime = natif Supabase, même compte.|
| Front public (widget résa) | HTML/CSS/JS vanilla, pas de framework | TR = "site statique pur, pas de React/build" — choix validé, réutilisable ici pour widget résa embarqué. |
| BackOffice | HTML/JS vanilla + `supabase-js` CDN, session partagée `localStorage` | Pattern TR : login → sidebar → pages (dashboard.html, planning.html, salle.html, clients.html...). Évite un vrai front build pour un MVP. |
| Auth équipe | Comptes Supabase Auth, email technique par user (`xxx@fricaccia.local`) si pas d'email réel | Pattern TR validé (pgcrypto insert direct `auth.users`). Rôles (admin/responsable/salle/lecture) = colonne `role` + RLS. |
| Notifs auto | Edge Function trigger (`pg_net` sur insert/update) → Brevo (email), + WhatsApp Meta / SMS fournisseur à ajouter | Pattern `notify-booking` de TR, dupliqué par canal. ⚠️ ne PAS activer "Authorised IPs" côté Brevo (a cassé les notifs chez TR, IP Edge Functions variable). |
| Hébergement | **Vercel** (repo GitHub, push `main` = deploy auto) | Identique TR. Si besoin de routes dynamiques (ex: export API, webhook Zelty) → fonctions Vercel Node comme `api/sitemap-blog.js` chez TR. |
| Intégration Zelty | Edge Function dédiée (webhook entrant + poll API sortant), table `zelty_sync_log` (journal erreurs/dernière sync) | Nouveau — pas de précédent TR. Prévoir retry + reconnexion auto (spec §16). |
| Multi-restaurant | Toutes tables avec `restaurant_id` (Montpellier/Perpignan), RLS filtre par restaurant assigné à l'utilisateur, vue globale = rôle admin sans filtre | Évite dupliquer schéma/instance comme ferait un "2 projets Supabase". |

## Concepts empruntés à OpenResto ([karanshukla/openresto](https://github.com/karanshukla/openresto))

Projet MIT, self-hosted (.NET/React Native, zéro dépendance externe) — stack différente de la nôtre (on reste Supabase + vanilla JS + Vercel, plus léger pour ce contexte), mais plusieurs *concepts fonctionnels* solides à reprendre tels quels dans notre schéma Supabase :

| Concept OpenResto | Adaptation Supabase |
|---|---|
| Hold de table temps réel (`ConcurrentDictionary`, 5min, `holdId` renvoyé au checkout) | Table `table_holds` (restaurant_id, table_id, expires_at, hold_token) + policy RLS anon insert/select son propre `hold_token`. Nettoyage via `pg_cron` (delete expired). |
| Popular-times : créneaux tagués Lunch/Dinner/Off-Peak, groupés en pills | Colonne calculée `periode` sur génération des créneaux (fonction SQL ou côté widget JS), pills UI au lieu de liste plate — déjà amorcé dans le mockup, à généraliser. |
| Booking pause (admin coupe les résas jusqu'à une date, sans toucher la config) | Colonne `restaurants.bookings_paused_until timestamptz`. Widget vérifie cette valeur avant d'afficher les créneaux. |
| Floor sections (tables groupées par zone) | Colonne `tables_salle.section` (ex: Terrasse/Bar/Salle) — le plan de salle du mockup filtre/groupe par section. |
| Activity trail append-only (qui/quand/IP/diff), owner-only, aucun delete, rétention 365j | Table `activity_log` (insert-only via trigger sur `reservations`/`utilisateurs_roles`/`api_keys`), RLS `SELECT` réservé rôle admin, pas de policy `DELETE`. Purge par job cron > 365j uniquement. |
| Clés API scopées (bookings/locations/tables/brand/users/guests), clé sans scope `guests` = data client redacted | Table `api_keys` (restaurant_id, scopes text[], token_hash). Utile pour l'intégration Zelty : clé scope `bookings`+`tables` seulement, jamais `guests` → Zelty ne voit jamais coordonnées clients. |
| GDPR hard-delete + bandeau consentement | Fonction `delete_client_data(client_id)` (anonymise `clients`+`reservations` liées), bandeau consentement déjà ajouté au widget (`booking.html`). |
| Pas de compte client, juste un `BookingRef` + cookie chiffré HttpOnly | `reservations.booking_ref` (code court, ex: 6 caractères), lookup public par `booking_ref`+email/tel sans compte. Évite de gérer Auth côté client public (seule l'équipe a un compte Supabase Auth, comme chez TR). |

## Points de vigilance (retenus de TR)

- Piège fuseau horaire : ne jamais faire `date.toISOString()` sur une date locale (widget résa TR a enregistré J-1 pendant des semaines). Construire les dates via `getFullYear/getMonth/getDate` locaux.
- Si booking widget dupliqué en plusieurs endroits (page publique + backoffice), risque de divergence — centraliser en un seul fichier JS partagé, pas de copie inline.
- RLS : `anon` ne doit voir que le strict nécessaire (ex: créneaux dispo futurs), jamais les données client complètes.

## Prochaines étapes

1. Schéma Postgres (tables : `reservations`, `tables_salle`, `indisponibilites`, `clients`, `liste_attente`, `zelty_sync_log`, `utilisateurs_roles`).
2. RLS policies par rôle × restaurant.
3. Edge Functions : `notify-reservation`, `zelty-webhook`, `zelty-sync`.
4. BackOffice MVP (priorités spec §"Fonctionnalités prioritaires MVP" — dashboard temps réel, planning, statuts, plan de salle, arrivées, liste d'attente).
