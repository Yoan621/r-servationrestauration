// Accès Firestore côté serveur, sans dépendance npm (comme server/send-email.js).
//
// Les fonctions serverless n'ont pas de session Firebase Auth : elles
// s'authentifient avec un compte de service, qui contourne les règles de
// sécurité (c'est voulu : le cron doit lire des réservations qu'aucun client
// n'a le droit de lister). Les deux variables d'environnement attendues :
//   FIREBASE_SA_CLIENT_EMAIL  -> ...@fricaccia.iam.gserviceaccount.com
//   FIREBASE_SA_PRIVATE_KEY   -> la clé privée PEM (les \n peuvent être échappés)
const crypto = require('crypto');

const PROJET = process.env.FIREBASE_PROJECT_ID || 'fricaccia';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJET}/databases/(default)/documents`;

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let cacheJeton = { valeur: null, expire: 0 };

async function jetonAcces() {
  if (cacheJeton.valeur && Date.now() < cacheJeton.expire - 60000) return cacheJeton.valeur;

  const email = process.env.FIREBASE_SA_CLIENT_EMAIL;
  const cle = (process.env.FIREBASE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !cle) throw new Error('FIREBASE_SA_CLIENT_EMAIL / FIREBASE_SA_PRIVATE_KEY manquants');

  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600
  }));
  const signature = b64url(crypto.createSign('RSA-SHA256').update(`${entete}.${charge}`).sign(cle));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${entete}.${charge}.${signature}`
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${JSON.stringify(data)}`);

  cacheJeton = { valeur: data.access_token, expire: Date.now() + (data.expires_in || 3600) * 1000 };
  return cacheJeton.valeur;
}

async function appel(chemin, options = {}) {
  const jeton = await jetonAcces();
  const res = await fetch(`${BASE}${chemin}`, {
    ...options,
    headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Firestore ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// Réservations d'un jour donné (filtre sur un seul champ : pas d'index composite
// à créer ; le tri sur le statut se fait ensuite en JavaScript).
async function reservationsDuJour(date) {
  const data = await appel(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'reservations' }],
        where: {
          fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } }
        }
      }
    })
  });
  return (Array.isArray(data) ? data : [])
    .filter(l => l.document)
    .map(l => ({ nom: l.document.name, champs: l.document.fields || {} }));
}

async function marquerAvisEnvoye(ref, horodatage) {
  return appel(
    `/reservations/${encodeURIComponent(ref)}?updateMask.fieldPaths=avisEnvoyeLe`,
    { method: 'PATCH', body: JSON.stringify({ fields: { avisEnvoyeLe: { stringValue: horodatage } } }) }
  );
}

// Lit une réservation par sa référence (= id du document). Renvoie ses champs
// Firestore typés, ou null si elle n'existe pas. Sert à vérifier côté serveur
// (anti-doublon) avant de pousser quoi que ce soit en caisse.
async function lireReservation(ref) {
  try {
    const doc = await appel(`/reservations/${encodeURIComponent(ref)}`);
    return (doc && doc.fields) || null;
  } catch (e) {
    // 404 Firestore -> réservation absente : on renvoie null plutôt que throw.
    if (/Firestore 404/.test(e.message)) return null;
    throw e;
  }
}

// Mémorise l'identifiant de la réservation créée en caisse Zelty, pour pouvoir
// la retrouver plus tard (réconciliation, annulation manuelle). Best-effort.
async function enregistrerBookingZelty(ref, zeltyId) {
  return appel(
    `/reservations/${encodeURIComponent(ref)}?updateMask.fieldPaths=zeltyBookingId`,
    { method: 'PATCH', body: JSON.stringify({ fields: { zeltyBookingId: { stringValue: String(zeltyId) } } }) }
  );
}

// Aplatit une valeur Firestore typée en valeur JS simple.
function valeur(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) {
    const out = {};
    for (const [k, vv] of Object.entries(v.mapValue.fields || {})) out[k] = valeur(vv);
    return out;
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valeur);
  return undefined;
}

module.exports = { reservationsDuJour, marquerAvisEnvoye, lireReservation, enregistrerBookingZelty, valeur };
