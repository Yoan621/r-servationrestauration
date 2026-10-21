// Config partagée booking.html / cancel.html / index.html — backend PocketBase
// (remplace supabase-config.js). Serveur lancé par pocketbase/start.sh.
const PB_URL = 'http://127.0.0.1:8095';

const RESTO_SLUGS = { Montpellier: 'montpellier', Perpignan: 'perpignan' };
const DUREE_MOYENNE_MIN = 90;

// Appel JSON vers PocketBase. Lève une Error (message du serveur) si statut non 2xx.
async function pbApi(path, { method = 'GET', body } = {}) {
  const res = await fetch(PB_URL + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.message) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Lien "Ajouter à Google Calendar" — pas de conversion UTC (piège TR déjà documenté :
// jamais toISOString() sur une date locale). Heure laissée "flottante" (sans Z) :
// Google Calendar l'interprète dans le fuseau du compte de l'utilisateur, correct
// pour une clientèle très majoritairement France/Europe.
function googleCalendarUrl({ restaurant, date, heure, pax, bookingRef }) {
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = heure.split(':').map(Number);
  const start = new Date(Y, M - 1, D, h, m);
  const end = new Date(start.getTime() + DUREE_MOYENNE_MIN * 60000);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Fricaccia ${restaurant}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Réservation ${pax} pers.${bookingRef ? ' — réf ' + bookingRef : ''}`,
    location: `Fricaccia ${restaurant}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
