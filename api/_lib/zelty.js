// Création d'une réservation dans la caisse Zelty, côté serveur uniquement.
//
// La clé ZELTY_API_KEY vit dans les variables d'environnement Vercel : elle ne
// doit JAMAIS apparaître dans le code client (mockup/). Elle est la même que
// celle de 10_Reporting (accès lecture + écriture aux 2 caisses).
//
// Limites connues de l'API Zelty (voir ZELTY_API.md) :
//   - POST /bookings fonctionne (création). id_restaurant obligatoire en query.
//   - AUCUNE annulation programmatique : DELETE/PATCH /bookings/<id> -> 404.
//     Une résa annulée dans le CRM ne peut donc pas être retirée de la caisse
//     par API -> l'annulation se gère à la main / par notif WhatsApp à l'équipe.
//   - Rate limit : 429 après ~8 appels rapprochés (sans effet au volume réel).

const BASE = 'https://api.zelty.fr/2.7';

// Perpignan 8203, Montpellier 9941.
const RESTO_ID = { perpignan: '8203', montpellier: '9941' };

function slug(restaurant) {
  return String(restaurant || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Téléphone au format international attendu par Zelty (exemple : +33...).
function telInternational(t) {
  t = String(t || '').replace(/[^\d+]/g, '');
  if (!t) return '';
  if (t.startsWith('+')) return t;
  if (t.startsWith('0')) return '+33' + t.slice(1);
  if (t.startsWith('33')) return '+' + t;
  return '+33' + t;
}

// Décalage horaire de Paris pour une date donnée (ex: "+02:00" en été,
// "+01:00" en hiver). On évite toISOString() sur une date locale (règle du
// projet) : on calcule le décalage réel via Intl, à midi UTC pour esquiver
// les bords de changement d'heure.
function decalageParis(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      timeZoneName: 'longOffset'
    }).formatToParts(d);
    const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
    const off = tz.replace('GMT', '').trim();
    return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+01:00';
  } catch (e) {
    return '+01:00';
  }
}

// N'échoue jamais côté appelant : renvoie un état. La réservation est déjà
// enregistrée dans le CRM avant cet appel, donc une panne Zelty ne fait jamais
// perdre la réservation.
async function creerBookingZelty(r) {
  const id = RESTO_ID[slug(r.restaurant)];
  if (!id) return { ok: false, raison: `restaurant inconnu : ${r.restaurant}` };

  const cle = (process.env.ZELTY_API_KEY || '').trim();
  if (!cle) return { ok: false, raison: 'ZELTY_API_KEY manquante' };

  if (!r.date || !r.heure) return { ok: false, raison: 'date/heure manquantes' };

  const payload = {
    booking_for: `${r.date}T${r.heure}:00${decalageParis(r.date)}`,
    places: Number(r.pax) || 1,
    customer: {
      name: String(r.nom || '').trim(),
      fname: String(r.prenom || '').trim(),
      phone: telInternational(r.tel),
      mail: String(r.email || '').trim()
    },
    comment: String(r.note || r.notes || '').trim()
  };

  try {
    const rep = await fetch(`${BASE}/bookings?id_restaurant=${id}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await rep.json().catch(() => ({}));
    if (!rep.ok) {
      return { ok: false, raison: `Zelty ${rep.status}`, detail: data && data.errmsg };
    }
    const bookingId = data && data.booking && data.booking.id;
    return { ok: true, bookingId: bookingId != null ? String(bookingId) : null, restaurant: id };
  } catch (e) {
    return { ok: false, raison: `réseau : ${e.message}` };
  }
}

module.exports = { creerBookingZelty, telInternational, decalageParis };
