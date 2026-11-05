// Notification WhatsApp de l'équipe à chaque réservation, via CallMeBot.
//
// Pourquoi côté serveur : jusqu'au 2026-10-21, le numéro de l'équipe et la clé
// CallMeBot étaient écrits en clair dans mockup/booking.html, donc publics pour
// quiconque ouvrait le code source de la page en ligne. Ici, ils ne quittent
// jamais les variables d'environnement Vercel.
//
// Un destinataire par restaurant. Variables attendues (toutes optionnelles) :
//   WHATSAPP_PERPIGNAN_PHONE    / WHATSAPP_PERPIGNAN_APIKEY
//   WHATSAPP_MONTPELLIER_PHONE  / WHATSAPP_MONTPELLIER_APIKEY
//   WHATSAPP_PHONE              / WHATSAPP_APIKEY     <- repli commun (v1 : un seul compte)
//
// Le numéro s'écrit au format international SANS le "+" (CallMeBot l'exige).
// Pour obtenir une clé : envoyer "I allow callmebot to send me messages" au
// +34 644 59 71 65 depuis le WhatsApp du téléphone destinataire ; la clé arrive
// en réponse. Une clé est liée à un seul numéro destinataire.

const SLUGS = {
  perpignan: 'PERPIGNAN',
  montpellier: 'MONTPELLIER'
};

// Enlève les accents et la casse pour que "Montpellier" et "montpellier" tombent
// sur la même variable d'environnement.
function slug(restaurant) {
  return String(restaurant || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Cherche d'abord le destinataire propre au restaurant, sinon le repli commun.
function destinataire(restaurant) {
  const cle = SLUGS[slug(restaurant)];
  if (cle) {
    const phone = (process.env[`WHATSAPP_${cle}_PHONE`] || '').replace(/[^\d]/g, '');
    const apikey = (process.env[`WHATSAPP_${cle}_APIKEY`] || '').trim();
    if (phone && apikey) return { phone, apikey, source: cle.toLowerCase() };
  }
  const phone = (process.env.WHATSAPP_PHONE || '').replace(/[^\d]/g, '');
  const apikey = (process.env.WHATSAPP_APIKEY || '').trim();
  if (phone && apikey) return { phone, apikey, source: 'commun' };
  return null;
}

function texteNotif(r) {
  const lignes = [
    'Nouvelle réservation Fricaccia',
    `${r.prenom || ''} ${r.nom || ''}`.trim() + ` - ${r.pax || '?'} pers.`,
    `${r.date || '?'} à ${r.heure || '?'}`,
    String(r.restaurant || '?')
  ];
  if (r.tel) lignes.push(`Tél: ${r.tel}`);
  if (r.email) lignes.push(`Email: ${r.email}`);
  if (r.bookingRef) lignes.push(`Réf: ${r.bookingRef}`);
  if (r.notes) lignes.push(`Note: ${r.notes}`);
  return lignes.join('\n');
}

// N'échoue jamais : une notif ratée ne doit pas faire échouer la réservation.
// Renvoie un état, que l'appelant peut remonter dans sa réponse JSON.
async function notifierEquipe(r) {
  const cible = destinataire(r.restaurant);
  if (!cible) return { envoye: false, raison: 'aucun destinataire configuré' };

  const url = 'https://api.callmebot.com/whatsapp.php'
    + `?phone=${encodeURIComponent(cible.phone)}`
    + `&text=${encodeURIComponent(texteNotif(r))}`
    + `&apikey=${encodeURIComponent(cible.apikey)}`;

  try {
    const rep = await fetch(url, { method: 'GET' });
    if (!rep.ok) {
      // Pas de texte de réponse dans le log : CallMeBot y répète parfois l'apikey.
      return { envoye: false, raison: `CallMeBot a répondu ${rep.status}`, destinataire: cible.source };
    }
    return { envoye: true, destinataire: cible.source };
  } catch (e) {
    return { envoye: false, raison: `réseau : ${e.message}`, destinataire: cible.source };
  }
}

function texteAnnulation(r) {
  const lignes = [
    '❌ Annulation Fricaccia — le client ne vient pas',
    `${r.prenom || ''} ${r.nom || ''}`.trim() + ` - ${r.pax || '?'} pers.`,
    `${r.date || '?'} à ${r.heure || '?'}`,
    String(r.restaurant || '?')
  ];
  if (r.tel) lignes.push(`Tél: ${r.tel}`);
  if (r.bookingRef) lignes.push(`Réf: ${r.bookingRef}`);
  if (r.motif) lignes.push(`Motif: ${r.motif}`);
  return lignes.join('\n');
}

// Même mécanique que notifierEquipe, mais message d'annulation. N'échoue jamais.
async function notifierAnnulation(r) {
  const cible = destinataire(r.restaurant);
  if (!cible) return { envoye: false, raison: 'aucun destinataire configuré' };

  const url = 'https://api.callmebot.com/whatsapp.php'
    + `?phone=${encodeURIComponent(cible.phone)}`
    + `&text=${encodeURIComponent(texteAnnulation(r))}`
    + `&apikey=${encodeURIComponent(cible.apikey)}`;

  try {
    const rep = await fetch(url, { method: 'GET' });
    if (!rep.ok) return { envoye: false, raison: `CallMeBot a répondu ${rep.status}`, destinataire: cible.source };
    return { envoye: true, destinataire: cible.source };
  } catch (e) {
    return { envoye: false, raison: `réseau : ${e.message}`, destinataire: cible.source };
  }
}

// ---- Alerte « grande table » ----
// Règle : une réservation de PLUS de N personnes (N = GRANDE_TABLE_SEUIL, 6 par
// défaut, donc 7 et +) déclenche une alerte WhatsApp à une personne dédiée.
//   WHATSAPP_GRANDE_TABLE_PHONE   numéro international sans "+" (ex. 33785570869)
//   WHATSAPP_GRANDE_TABLE_APIKEY  clé CallMeBot de CE numéro (chaque destinataire
//                                 doit envoyer « I allow callmebot to send me messages »
//                                 au +34 644 59 71 65 pour recevoir sa propre clé)
//   GRANDE_TABLE_SEUIL            optionnel
function seuilGrandeTable() {
  const n = parseInt(process.env.GRANDE_TABLE_SEUIL || '6', 10);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

function estGrandeTable(pax) {
  const n = parseInt(String(pax).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) && n > seuilGrandeTable();
}

function texteGrandeTable(r) {
  const lignes = [
    `⚠️ Grande table : ${r.pax} personnes`,
    String(r.restaurant || '?'),
    `${r.date || '?'} à ${r.heure || '?'}`,
    `${r.prenom || ''} ${r.nom || ''}`.trim()
  ];
  if (r.tel) lignes.push(`Tél: ${r.tel}`);
  if (r.bookingRef) lignes.push(`Réf: ${r.bookingRef}`);
  if (r.notes) lignes.push(`Note: ${r.notes}`);
  return lignes.join('\n');
}

// N'échoue jamais. Sans clé configurée : ne fait rien et le dit.
async function notifierGrandeTable(r) {
  if (!estGrandeTable(r.pax)) return { envoye: false, raison: 'pas une grande table' };
  const phone = (process.env.WHATSAPP_GRANDE_TABLE_PHONE || '').replace(/[^\d]/g, '');
  const apikey = (process.env.WHATSAPP_GRANDE_TABLE_APIKEY || '').trim();
  if (!phone || !apikey) return { envoye: false, raison: 'destinataire grande table non configuré', destinataire: 'grande_table' };

  const url = 'https://api.callmebot.com/whatsapp.php'
    + `?phone=${encodeURIComponent(phone)}`
    + `&text=${encodeURIComponent(texteGrandeTable(r))}`
    + `&apikey=${encodeURIComponent(apikey)}`;
  try {
    const rep = await fetch(url, { method: 'GET' });
    if (!rep.ok) return { envoye: false, raison: `CallMeBot a répondu ${rep.status}`, destinataire: 'grande_table' };
    return { envoye: true, destinataire: 'grande_table' };
  } catch (e) {
    return { envoye: false, raison: `réseau : ${e.message}`, destinataire: 'grande_table' };
  }
}

module.exports = { notifierEquipe, notifierAnnulation, notifierGrandeTable, estGrandeTable, texteGrandeTable, texteNotif, texteAnnulation, destinataire };
