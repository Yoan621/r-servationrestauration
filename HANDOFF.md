Tu reprends le CRM de réservation de Fricaccia (street food italienne, restaurants à Perpignan et Montpellier). Dossier : `~/Desktop/001_PROJETS/010_Fricaccia/07_CRM_RESERVATION`. Dépôt GitHub **public** `Yoan621/r-servationrestauration`, branche `main`, publié automatiquement sur Vercel (`vercel.json` → `outputDirectory: mockup`).

Commence par lire `README.md`, `spec-fonctionnelle.md`, `schema.sql` et la section « Session 2026-10-20 » de `../000_SESSIONS.md`. Réponds en français.

---

## Stack
HTML/CSS/JS vanilla, sans build, dans `mockup/` :
- `index.html` : back-office équipe (planning du jour, fiches clients, plan de salle, liste d'attente, liens de réservation, configuration, intégration Zelty) ;
- `booking.html` : formulaire public de réservation (étape 1 = créneaux, étape 2 = infos client) ;
- `cancel.html` : page d'annulation client (lien reçu par e-mail).

---

## Backend actuel : Firebase Cloud Firestore (Spark — gratuit)
Le projet Supabase d'origine (`swcjciuytfrifvohjidh`) est injoignable depuis le 15/10/2026.
PocketBase local (`:8095`) avait remplacé Supabase le 15/10, et a été à son tour remplacé par **Firebase Cloud Firestore** le 20/10.

### Projet Firebase
- **ID projet** : `fricaccia`
- **Région base de données** : `europe-west9` (Paris)
- **Plan** : Spark (gratuit)
- **Règles de sécurité** : `firestore.rules` — **déployées le 2026-10-21 09:33 UTC** (ruleset `3c29f5a3-f347-4040-b851-b88d90e49509`). Avant ça, la base était en mode test ouvert (`allow read, write: if request.time < 2026-11-19`).
- `firebase.json` + `.firebaserc` ajoutés : `firebase deploy --only firestore:rules` fonctionne une fois le CLI installé et connecté. Sans CLI, le déploiement passe par l'API Firebase Rules avec un jeton `gcloud auth print-access-token` et l'en-tête `x-goog-user-project: fricaccia` (compte `fricacciamarketing@gmail.com`).
- **4e collection : `staff`** — 1 doc par compte autorisé (ID = uid Firebase Auth), champs `uid`, `email`, `role` (`admin`/`responsable`/`salle`/`lecture`), `restaurant_slug`, `creeLe`, `creePar`. C'est la seule source de vérité de l'accès : supprimer le doc coupe l'accès immédiatement, même si le compte Firebase Auth existe encore.

### 3 collections Firestore
| Collection | Docs | Champs clés |
|---|---|---|
| `reservations` | 1 doc par résa (ID = ref 6 car. alphanumérique) | `ref`, `restaurant`, `date` (YYYY-MM-DD), `heure` (HH:MM), `email`, `statut`, `data` (objet complet), `creeLe` |
| `restaurants` | `perpignan` et `montpellier` | `slug`, `nom`, `en_pause` |
| `reglages` | 1 doc par clé | `cle` (ex: `fricaccia_tables_config`), `valeur` (JSON) |

### Fichiers JS clés
- `mockup/assets/js/firebase-config.js` : config SDK Firebase (v10 CDN compat), objet `fricacciaApi` (`getPause`, `creerReservation`, `getReservation`, `annulerReservation`), shim `pbApi()` pour la rétrocompatibilité, `googleCalendarUrl()`.
- `mockup/assets/js/bo-sync.js` : sync temps réel (`onSnapshot`) sur les 3 collections → met à jour `localStorage` (cache) + appelle `renderAll()` ; bandeau rouge si Firestore injoignable.

### Pages HTML — chargement des scripts
Les 3 pages chargent maintenant le SDK Firebase avant `firebase-config.js` :
```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
<script src="assets/js/firebase-config.js"></script>
<!-- index.html uniquement : -->
<script src="assets/js/bo-sync.js"></script>
```

---

## Lancer en local
```bash
# Terminal 1 — Base de données Firestore (cloud, pas de process local à lancer)
# rien à faire, Firestore est hébergé par Google 24h/24

# Terminal 2 — Serveur de développement + proxy API
cd ~/Desktop/001_PROJETS/010_Fricaccia/07_CRM_RESERVATION
python3 dev-server.py
# → http://localhost:8971/index.html     (back-office)
# → http://localhost:8971/booking.html   (formulaire client)
# → http://localhost:8971/cancel.html    (annulation)

# Terminal 3 (optionnel) — Envoi d'e-mails de confirmation (Brevo)
cd server && node --env-file=.env send-email.js   # port 8788
```

### Routes proxy exposées par dev-server.py (port 8971)
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/zelty/status` | Zelty connecté ? (`{"active": true}`) |
| GET | `/api/zelty/check?phone=...&email=...` | Recherche un client dans la caisse Zelty |
| POST | `/api/zelty/create` | Crée un client dans Zelty (body JSON : nom, prenom, tel, email, consentement) |
| GET | `/api/brevo/status` | Brevo connecté ? |
| POST | `/api/brevo/sms-avis` | Envoie un SMS de demande d'avis Google via Brevo (body JSON : tel, prenom, restaurant) |

Les clés d'API sont lues automatiquement depuis :
- `server/.env` → `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- `../10_Reporting/.env` → `ZELTY_API_KEY`

---

## Fonctionnalités ajoutées le 2026-10-20

### 1. Formulaire client `booking.html`
- **Tags rapides de spécificités** : 6 puces cliquables (`🎂 Anniversaire`, `👶 Poussette / Chaise haute`, `🥗 Végétarien`, `☀️ Terrasse`, `🐶 Chien`, `🤫 Table calme`) s'insèrent dans le champ `note`.
- **Liens d'acquisition enrichis** : supporte `?link=<id>` (lien tracé généré depuis le back-office) ET `?restaurant=Montpellier&source=tiktok` (lien direct paramétré).

### 2. Planning back-office `index.html`
- **Affichage de la note client** sous le nom (badge `📝`) pour que la salle prépare la table en amont.
- **Bouton `⭐ Avis`** visible dès qu'une réservation est aux statuts `arrivee`, `installee`, `commande_prise` ou `terminee` → ouvre WhatsApp avec message pré-rédigé (bon lien selon le restaurant).

### 3. Fiches clients `index.html`
- **Badges de fidélité automatiques** calculés sur l'historique :
  - `🆕 Nouveau` (1re réservation)
  - `⭐ Habitué` (2 à 4 réservations)
  - `👑 VIP` (5+ réservations)
- **Export CSV Zelty** : bouton « 📥 Exporter format Zelty » en haut de la liste, génère un CSV UTF-8 avec BOM (colonnes : Nom, Prenom, Telephone, Email, Optin_SMS, Optin_Mail, Nb_Reservations, Dernier_Restaurant).
- **Sur chaque fiche client (modale)** :
  - `⭐ Avis Google (WhatsApp)` : ouvre WhatsApp avec message personnalisé + lien Google Review du restaurant.
  - `✉️ Avis Google (SMS Brevo)` : appelle `POST /api/brevo/sms-avis` → envoie le SMS via l'API Brevo transactionnelle.
  - `📋 Copier format Zelty` : copie `Nom;Prenom;Tel;Email;Restaurant` dans le presse-papier.
  - `🔍 Vérifier sur Zelty` : interroge l'API Zelty, affiche le profil caisse du client ou propose de le créer.

### 4. Liens d'acquisition
Sources disponibles dans le générateur de liens :
`site`, `instagram_bio`, `instagram_story`, `tiktok`, `facebook`, `google`, `qr_table`, `flyer`, `influenceur`, `whatsapp`, `interne`.

### 5. Liens Avis Google (hardcodés dans `firebase-config.js` et `index.html`)
```
Montpellier : https://g.page/r/Cd1Ia0YpCNfyEAE/review
Perpignan   : https://g.page/r/CbTiWhN3LrtrEAE/review
```

---

## Ce qui n'est PAS encore fait (proposer l'ordre à Yoan, ne pas tout enchaîner sans accord)
1. ~~**Login back-office**~~ — **fait le 2026-10-21** : `AUTH_ENABLED = true`, Firebase Auth e-mail/mot de passe, plus aucune route `localhost:8788` dans `index.html`. **Reste UN geste manuel** : activer le fournisseur dans la console Firebase → Authentication → Commencer → E-mail/Mot de passe → Activer (impossible par API sur le plan Spark : `initializeAuth` répond `BILLING_NOT_ENABLED`, c'est une fonction Identity Platform payante). Puis créer le 1er compte avec l'adresse `fricacciamarketing@gmail.com` : au premier login, le back-office crée tout seul sa fiche `staff` en rôle admin (liste d'amorçage dans `BOOTSTRAP_ADMINS` côté `index.html` et `isBootstrapAdminEmail()` côté `firestore.rules` — garder les deux synchronisés). Ensuite, tous les autres comptes se créent depuis la page « Utilisateurs & permissions ».
2. ~~**E-mail de confirmation post-réservation**~~ — **fait le 2026-10-21** : fonction serverless `api/send-confirmation.js` (Brevo), `CANCEL_BASE_URL` renseigné avec le domaine de production. Le serveur local `server/send-email.js` reste utilisable pour le développement.
3. **Hébergement** : Firestore est cloud (✅) et les règles sont déployées (✅). Reste : supprimer `mockup/assets/js/pb-config.js` et `supabase-config.js` (résidus), et vérifier les CORS Firestore (normalement gérés par le SDK).
4. **Ménage** : archiver `schema.sql` (Supabase), `server/migration-rpc.sql`, `mockup/dashboard-before.html`, `mockup/assets/js/supabase-config.js` et `sms_avis_premier_passage.sql` (à adapter en hook Firebase/Cloud Function si besoin).
5. ~~**E-mail de demande d'avis Google**~~ — **fait le 2026-10-21** : `api/cron-avis.js` + cron Vercel. HTML écrit en dur dans `api/_lib/mail.js` (pas de template Brevo : Brevo n'en contient aucun). Testé en envoi réel, délivré. **Aucun SMS dans le workflow automatisé** — décision de Yoan, e-mail uniquement.
6. **Temps réel complet** : `onSnapshot` est en place sur Firestore (✅ — remplace le polling PocketBase des 15 s).

---

## Règles impératives
1. **Ne jamais commiter, pousser ni déployer sans l'accord explicite de Yoan.** Le dépôt GitHub est **public** et Vercel publie automatiquement tout ce qui arrive sur `main` : un push est une mise en production immédiate et visible de tous. Demande à chaque fois, même pour une correction d'une ligne. (Le back-office est désormais protégé — `AUTH_ENABLED = true` et règles Firestore déployées — mais la règle d'accord préalable reste entière.)
2. **Ne pas soumettre le vrai formulaire `booking.html` pour tester.** Il déclenche une vraie notification WhatsApp à l'équipe (CallMeBot, désormais côté serveur) et un vrai e-mail (Brevo). Teste via la console avec `fricacciaApi.creerReservation({...})`, puis supprime les données de test.
3. **Secrets.** `server/.env`, `server/.env.vercel`, `server/firebase-sa.json`, `../10_Reporting/.env` : jamais dans le code client, jamais dans le chat, jamais dans git (tous couverts par `.gitignore`). Avant tout push, vérifier qu'aucune valeur de `server/.env` n'apparaît dans un fichier suivi.
4. **Pas d'`alert()` ni de `confirm()`.** Utilise des messages inline dans la page.
5. **Pas d'asset payant.** L'ancien thème ThemeForest `assets/css/app.css` est ignoré par git — ne pas le réintroduire.
6. **Convention des vues** : `view-<nom>` + `data-view="<nom>"` + `render<Nom>()` appelée depuis `renderAll()`.
7. **Dates.** Ne jamais utiliser `toISOString()` sur une date locale. Utiliser `todayLocal()` et `dateLocaleStr()`.

---

En fin de session, ajoute un résumé daté dans `../000_SESSIONS.md`.

---

## Authentification du back-office (2026-10-21)

Deux niveaux volontairement distincts :
1. un compte **Firebase Auth** (e-mail / mot de passe) ;
2. une fiche dans la collection Firestore **`staff`**, créée par un admin.

Un compte sans fiche staff est authentifié mais n'a accès à **rien** : les règles refusent toute lecture et toute écriture, et `index.html` le déconnecte avec le message « Ce compte n'a pas encore d'accès au back-office ». L'inscription publique Firebase Auth reste donc inoffensive.

Création d'un compte **sans serveur** : la page « Utilisateurs & permissions » instancie une **deuxième app Firebase** (`firebase.initializeApp(firebaseConfig, 'staff-admin')`) pour appeler `createUserWithEmailAndPassword` sans déconnecter l'admin en cours, puis écrit la fiche `staff`. Conséquences assumées : les rôles vivent dans Firestore (pas en custom claims, qui exigeraient l'Admin SDK donc un serveur), et « Retirer » supprime la fiche staff mais pas le compte Firebase Auth — à supprimer depuis la console si besoin.

Deux limites connues, à traiter plus tard si tu veux durcir :
- l'inscription Firebase Auth reste ouverte (un inconnu peut créer un compte sans aucun accès) ; pour la fermer il faut `client.permissions.disabledUserSignup` sur Identity Platform **et** un endpoint serveur pour créer les comptes staff ;
- le rôle `lecture` est stocké mais le back-office ne masque pas encore les boutons d'écriture : seules les règles Firestore distinguent admin et staff, pas l'interface.

### Ce que les règles autorisent, vérifié en direct (API Firestore, clé publique du site)
| Action | Anonyme | Staff | Admin |
|---|---|---|---|
| Lire l'état de pause d'un resto | ✅ | ✅ | ✅ |
| Créer une réservation valide (widget) | ✅ | ✅ | ✅ |
| Lire une réservation par sa référence | ✅ | ✅ | ✅ |
| Annuler sa réservation (statut → `annulee`) | ✅ | ✅ | ✅ |
| **Lister** la collection `reservations` | ❌ | ✅ | ✅ |
| Passer une réservation à `terminee` | ❌ | ✅ | ✅ |
| Supprimer une réservation | ❌ | ❌ | ✅ (via staff) |
| Lire / écrire `reglages` | ❌ | ✅ | ✅ |
| Lire le roster `staff` | ❌ | ✅ | ✅ |
| Créer / modifier / retirer un compte staff | ❌ | ❌ | ✅ |
| Mettre un resto en pause | ❌ | ✅ | ✅ |

29 cas de test passent via l'API `firebaserules.googleapis.com/v1/projects/fricaccia:test` (banc de test rejouable : voir le journal de session du 2026-10-21).

### Trois défauts corrigés dans `firestore.rules` au passage
1. **Le fichier ne compilait pas** (3 erreurs de syntaxe) : `service` est un mot réservé du langage des règles, `d.service` est illisible → remplacé par `d.get('service', '')`. Les règles n'avaient donc jamais pu être déployées.
2. **`isStaff()` donnait l'accès à n'importe qui** : la clause `request.auth.token.firebase.sign_in_provider != 'anonymous'` faisait de tout compte authentifié un membre du staff, et la clause sur les adresses `@fricaccia.*` suffisait à quiconque s'inscrivait avec une adresse de ce domaine (jamais vérifiée). Les deux ont été supprimées : il faut désormais une fiche `staff` ou un custom claim.
3. **Les réservations prises au comptoir étaient refusées** : elles n'ont pas d'e-mail et portent un id `r_<timestamp>`, que la validation stricte du widget public rejetait. D'où deux validations distinctes — `isValidPublicCreate` (stricte, widget) et `isValidStaffReservation` (allégée, back-office authentifié).

### Effet de bord accepté sur `cancel.html`
L'historique « vos autres réservations » reposait sur une requête `where('email', '==', …)` sur toute la collection, c'est-à-dire une opération `list` désormais réservée au staff (impossible à autoriser proprement : les règles ne peuvent pas vérifier le filtre d'une requête). `fricacciaApi.getReservation()` attrape le refus et n'affiche que la réservation consultée. Pour retrouver l'historique côté client, il faudrait passer par une fonction serveur.

---

## 2026-10-21 (après-midi) — e-mails serverless, notif WhatsApp côté serveur, Zelty, mise en ligne

Session menée jusqu'au déploiement. **Le site est en production** sur
`https://r-servationrestauration.vercel.app` (commits `b5be158` puis `fe92570`).

### E-mails serverless (faits, testés en envoi réel)

Zéro dépendance npm, tout en Node natif.

| Fichier | Rôle |
|---|---|
| `api/_lib/firestore.js` | JWT RS256 signé avec `crypto` + OAuth (scope datastore), `reservationsDuJour()`, `marquerAvisEnvoye()` |
| `api/_lib/mail.js` | Brevo, gabarits HTML, `avisUrl()`, `salutation()`, `cancelUrl()`, `googleCalendarUrl()` |
| `api/send-confirmation.js` | POST — e-mail client **et** notif WhatsApp équipe |
| `api/cron-avis.js` | résas de la veille, statut `terminee`, sans `avisEnvoyeLe` → e-mail d'avis + marquage |
| `vercel.json` | cron `0 9 * * *` — **UTC**, donc 11h Paris en été, 10h en hiver |

`api/cron-avis.js` accepte `?dryRun=1&date=AAAA-MM-JJ` et est protégé par `CRON_SECRET`.
Ton des e-mails : **on parle de la Nonna, pas du plat** (« La Nonna veut savoir »,
« ⭐ Laisser un avis à la Nonna »). `replyTo` pour récupérer les mécontents hors Google.

Le logo passe par une **URL HTTPS**, jamais en data URI : Gmail tronque au-delà de 102 Ko.

### Notif WhatsApp déplacée côté serveur (`api/_lib/whatsapp.js`)

Le numéro de l'équipe et la clé CallMeBot étaient **en clair dans `mockup/booking.html`**,
donc publics dans le code source de la page en ligne et sur le dépôt public, pendant
environ un mois. Ils vivent maintenant en variables d'environnement.

Résolution du destinataire, dans l'ordre :
1. `WHATSAPP_PERPIGNAN_PHONE` / `_APIKEY` (ou `MONTPELLIER`) si la paire est complète
2. sinon le repli commun `WHATSAPP_PHONE` / `WHATSAPP_APIKEY` ← **état v1**
3. sinon notif ignorée — une notif ratée ne fait jamais échouer la réservation

Yoan créera **2 comptes WhatsApp avec 2 clés distinctes** : il n'y aura que 4 variables
à ajouter, **aucun code à toucher**.

⚠️ **La clé CallMeBot d'origine est dans l'historique git (commit `1b0916d`)** : la retirer
du code présent ne l'efface pas du passé. Elle est compromise, à régénérer.

### API Zelty — réservations (voir `ZELTY_API.md`, 78 lignes)

Relevé par sondage, la doc Zelty n'est pas publique. **La création de réservation
fonctionne** (`POST /2.7/bookings?id_restaurant=<id>`, validée en réel puis nettoyée).

**Bloquant : aucune annulation programmatique trouvée.** `DELETE` et `PATCH` sur
`/bookings/<id>` répondent 404 dans toutes les formes essayées, alors que `GET` sur la
même URL répond 200. Sans ce endpoint, une annulation client dans le CRM laisserait la
table bloquée en caisse → **ne pas activer la synchro CRM → Zelty en production.**
Décision de Yoan : pour l'instant, **l'annulation se fera à la main**.

Codes de statut : `cancel_reason != 0` est le marqueur d'annulation, **pas** `status 192`
(qui signifie aussi « table fermée sans pointage d'arrivée »). Détail dans `ZELTY_API.md`.

La clé Zelty fournie est **la même que celle de `10_Reporting/.env`** — pas de clé dédiée.
Elle a été collée en clair dans le chat : à régénérer.

### Variables d'environnement Vercel — 11 au total

Fichier prêt à importer : `server/.env.vercel` (gitignoré, chmod 600).

`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `CANCEL_BASE_URL`,
`FIREBASE_PROJECT_ID`, `FIREBASE_SA_CLIENT_EMAIL`, `FIREBASE_SA_PRIVATE_KEY`,
`CRON_SECRET`, `WHATSAPP_PHONE`, `WHATSAPP_APIKEY`, `ZELTY_API_KEY`

⚠️ **Les poser toutes en une fois.** Si les variables Firebase sont posées sans
`CRON_SECRET`, le garde du cron reste inactif et n'importe qui peut déclencher des envois
d'e-mails aux clients en appelant `/api/cron-avis`.

### État vérifié en production après le push

| URL | Code |
|---|---|
| `/`, `/booking.html`, `/index.html` | 200 — `index.html` sert bien la version Firebase |
| `/api/send-confirmation` | fonctionne (POST vide → `Réservation incomplète`) |
| `/api/cron-avis` | répond `FIREBASE_SA_* manquants` — attend les variables |
| `api.callmebot.com` dans `booking.html` | plus aucune trace |

### Ce qui reste

1. **Poser les 11 variables** dans Vercel (Production **et** Preview), puis vérifier que
   `/api/cron-avis` sans jeton renvoie bien **401**.
2. **Activer Firebase Auth** — console → Authentication → Commencer → E-mail/Mot de passe
   → Activer, puis créer `fricacciamarketing@gmail.com`. Impossible par API sur le plan
   Spark (`BILLING_NOT_ENABLED`). Yoan n'avait pas encore l'accès au dashboard.
   Sans ce geste, la page de login s'affiche mais refuse tout le monde.
3. **Régénérer** la clé CallMeBot et la clé Zelty (toutes deux exposées).
4. **Vue verrouillée par restaurant** : `restaurant_slug` est enregistré mais pas appliqué
   — un compte Montpellier peut basculer sur Perpignan. Verrouiller le sélecteur, filtrer
   les requêtes avec `where('restaurant','==',…)`, ajouter la règle `allow list`.
5. **Dépendance métier** : le cron ne traite que le statut `terminee`. Si la salle ne
   clôture pas les tables, aucun e-mail d'avis ne part. Piste : se baser plutôt sur
   `closed_at` / `cancel_reason` lus dans Zelty.
6. Broutilles dans `index.html` : un commentaire CSS mentionne encore « Supabase Auth »,
   et une note affirme « Aucune connexion cloud active encore » alors que c'est Firestore.
7. Question laissée en suspens : retirer le **bouton SMS manuel** du back-office ?
8. `/api/zelty/check` n'existe que dans `dev-server.py` : le bouton « Vérifier sur Zelty »
   du back-office est **cassé en production** tant que le proxy n'est pas porté en
   fonction Vercel (`ZELTY_API_KEY` est déjà prévue dans les variables).
