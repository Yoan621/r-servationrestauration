// Config partagée booking.html / cancel.html.
// Clé publishable = safe côté client (RLS + RPC security definer gèrent les accès,
// jamais d'écriture/lecture directe sur les tables sensibles depuis le navigateur).
const SUPABASE_URL = 'https://swcjciuytfrifvohjidh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_CqZKB3KDshVqDdM4n5Sivw_zJe5I-zS';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const RESTO_SLUGS = { Montpellier: 'montpellier', Perpignan: 'perpignan' };
const DUREE_MOYENNE_MIN = 90;

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
