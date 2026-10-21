# Mise en ligne — CRM réservation Fricaccia

Stack : **Vercel** (pages + fonctions + horloge) et **Firebase Firestore** (données). Les deux restent gratuits au volume actuel (~1 réservation/jour).

| Besoin | Qui le fait | État |
|---|---|---|
| Pages publiques + back-office | Vercel, statique (`outputDirectory: mockup`) | ✅ |
| Données, règles de sécurité | Firestore (projet `fricaccia`) | ✅ déployées |
| Connexion de l'équipe | Firebase Auth | ⏳ 1 clic console |
| E-mail de confirmation | `api/send-confirmation.js` → Brevo | ✅ écrit |
| E-mail d'avis à J+1 | Vercel Cron → `api/cron-avis.js` → Brevo | ✅ écrit |
| Notif WhatsApp de l'équipe | `api/_lib/whatsapp.js` → CallMeBot | ✅ écrit, côté serveur |

Plafonds gratuits, pour mémoire : Brevo 300 e-mails/jour, Firestore 50 000 lectures et 20 000 écritures/jour, Vercel Hobby 1 passage de cron par jour.

---

## 1. Activer Firebase Auth (console, une seule fois)

Impossible par API sur le plan Spark : `identityPlatform:initializeAuth` répond `BILLING_NOT_ENABLED` (fonction Identity Platform, payante).

1. console.firebase.google.com → projet **Fricaccia** → **Authentication** → **Commencer**
2. **Sign-in method** → **E-mail/Mot de passe** → **Activer** → Enregistrer
3. **Users** → **Ajouter un utilisateur** → `fricacciamarketing@gmail.com` + un mot de passe au choix
4. ouvrir le back-office et se connecter : la fiche `staff` admin se crée automatiquement

Ensuite, tous les autres comptes (Montpellier, Perpignan…) se créent depuis **Utilisateurs & permissions**, avec un mot de passe choisi par l'admin. Plus besoin de la console.

## 2. Clé de compte de service Firebase

La fonction cron lit Firestore côté serveur, sans session Firebase Auth : il lui faut un compte de service.

**Le plus simple (console, aucun droit IAM à manipuler)** : console.firebase.google.com → ⚙️ **Paramètres du projet** → onglet **Comptes de service** → **Générer une nouvelle clé privée**. Un fichier JSON se télécharge. Déplacer ce fichier dans `server/firebase-sa.json` (déjà gitignoré).

**Variante en ligne de commande** (compte de service dédié, droits minimaux) :

```bash
gcloud iam service-accounts create crm-reservation-cron \
  --project fricaccia --display-name "CRM réservation — cron avis J+1"

gcloud projects add-iam-policy-binding fricaccia \
  --member "serviceAccount:crm-reservation-cron@fricaccia.iam.gserviceaccount.com" \
  --role roles/datastore.user --condition=None

gcloud iam service-accounts keys create server/firebase-sa.json \
  --iam-account crm-reservation-cron@fricaccia.iam.gserviceaccount.com
```

Ce compte de service **contourne les règles Firestore** (c'est voulu : le cron doit lire des réservations qu'aucun client n'a le droit de lister). La clé ne doit donc jamais sortir de `server/` ni des variables d'env Vercel.

## 3. Variables d'environnement Vercel

Dashboard Vercel → projet → Settings → Environment Variables (Production **et** Preview) :

| Variable | Valeur | Où la trouver |
|---|---|---|
| `BREVO_API_KEY` | `xkeysib-…` | `server/.env` |
| `BREVO_SENDER_EMAIL` | `fricacciamarketing@gmail.com` | expéditeur validé Brevo |
| `BREVO_SENDER_NAME` | `Fricaccia` | — |
| `CANCEL_BASE_URL` | l'URL publique du site, **sans slash final** | Vercel |
| `FIREBASE_PROJECT_ID` | `fricaccia` | — |
| `FIREBASE_SA_CLIENT_EMAIL` | champ `client_email` du JSON | `server/firebase-sa.json` |
| `FIREBASE_SA_PRIVATE_KEY` | champ `private_key` du JSON, tel quel (sauts de ligne `\n` acceptés) | `server/firebase-sa.json` |
| `CRON_SECRET` | une chaîne aléatoire que tu génères | toi |
| `WHATSAPP_PHONE` | numéro destinataire, international **sans `+`** | `server/.env` |
| `WHATSAPP_APIKEY` | clé CallMeBot de ce numéro | `server/.env` |
| `ZELTY_API_KEY` | jeton API Zelty | `server/.env` (même clé que `10_Reporting`) |

### Notif WhatsApp : un destinataire par restaurant

`WHATSAPP_PHONE` / `WHATSAPP_APIKEY` sont le **repli commun** : un seul compte WhatsApp
pour les deux restaurants (état v1). Dès que les deux comptes existent, ajouter :

| Variable | Restaurant |
|---|---|
| `WHATSAPP_PERPIGNAN_PHONE` / `WHATSAPP_PERPIGNAN_APIKEY` | Perpignan |
| `WHATSAPP_MONTPELLIER_PHONE` / `WHATSAPP_MONTPELLIER_APIKEY` | Montpellier |

Elles prennent le dessus sur le repli, **sans aucune modification de code**. Si la paire
du restaurant est absente ou incomplète, le repli commun s'applique ; s'il manque aussi,
la notif est simplement ignorée (la réservation est enregistrée quand même).

Obtenir une clé : envoyer `I allow callmebot to send me messages` au **+34 644 59 71 65**
depuis le WhatsApp du téléphone destinataire ; la clé arrive en réponse. Une clé est liée
à un seul numéro.

⚠️ La clé utilisée jusqu'au 2026-10-21 était écrite en clair dans `mockup/booking.html`,
donc publique sur le dépôt GitHub **et** dans le code source de la page en ligne pendant
environ un mois. Elle est à considérer comme compromise : à régénérer.

`CRON_SECRET` n'est pas décoratif : dès qu'il existe, Vercel l'envoie en en-tête `Authorization` sur ses appels de cron, et `api/cron-avis.js` refuse tout appel sans lui. Sans ce secret, n'importe qui pourrait déclencher la campagne en boucle depuis l'URL publique.

## 4. Vérifier avant de laisser tourner

Le cron est déclaré dans `vercel.json` : `0 9 * * *`. **L'heure est en UTC** → 11h à Paris en été, 10h en hiver. À ajuster si tu veux une heure fixe toute l'année.

Test à blanc, sans envoyer un seul e-mail :

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  "https://<ton-domaine>/api/cron-avis?dryRun=1&date=2026-10-20"
```

La réponse liste les réservations examinées, celles qui seraient sollicitées et celles ignorées (avec la raison : mauvais statut, pas d'e-mail, déjà sollicitée). Retirer `dryRun=1` envoie pour de vrai.

## 5. La dépendance métier à ne pas oublier

Le cron ne sélectionne que les réservations au statut **`terminee`**. Si la salle ne clôture pas les tables en fin de service, aucun e-mail ne partira — le cron tournera et ne trouvera rien. C'est le seul point qui dépend d'une habitude de l'équipe, pas du code.

## 6. Anti-doublon

Après chaque envoi, le document de la réservation reçoit `avisEnvoyeLe` (horodatage ISO). Un client ne peut donc pas être sollicité deux fois, même si le cron repasse ou qu'on le déclenche à la main. Le champ `avisRelanceLe` est déjà autorisé par les règles pour une éventuelle relance à J+4.
