// POST /api/send-confirmation — appelé par booking.html juste après l'enregistrement
// d'une réservation. Fait deux choses, côté serveur uniquement :
//   1. e-mail de confirmation au client (si une adresse a été laissée)
//   2. notification WhatsApp de l'équipe du restaurant concerné
//
// Remplace le serveur local server/send-email.js (port 8788), qui ne tournait que
// sur la machine de Yoan : en ligne, booking.html appelait une adresse localhost
// côté client, donc aucun e-mail ne partait.
//
// La notif WhatsApp était auparavant déclenchée par le navigateur, numéro et clé
// CallMeBot en clair dans la page (donc publics). Elle part maintenant d'ici.
const { envoyer, htmlConfirmation } = require('./_lib/mail');
const { notifierEquipe } = require('./_lib/whatsapp');

const EMAIL_VALIDE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const r = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  // Une réservation sans date, heure ou restaurant ne veut rien dire : on refuse.
  // L'e-mail, lui, reste optionnel (réservation prise au comptoir, par exemple).
  if (!r.date || !r.heure || !r.restaurant) {
    res.status(400).json({ error: 'Réservation incomplète' });
    return;
  }

  const email = String(r.email || '').trim().toLowerCase();
  const resultat = { ok: true, email: null, whatsapp: null };

  // Les deux envois sont indépendants : un e-mail en échec ne doit pas priver
  // l'équipe de sa notification, et inversement.
  if (EMAIL_VALIDE.test(email)) {
    try {
      await envoyer({
        to: email,
        nom: `${r.prenom || ''} ${r.nom || ''}`.trim(),
        sujet: `Réservation confirmée — Fricaccia ${r.restaurant}`,
        html: htmlConfirmation({ ...r, email })
      });
      resultat.email = { envoye: true };
    } catch (e) {
      console.error('[send-confirmation] e-mail', e.message);
      resultat.email = { envoye: false, raison: e.message };
    }
  } else {
    resultat.email = { envoye: false, raison: email ? 'adresse invalide' : 'aucune adresse' };
  }

  resultat.whatsapp = await notifierEquipe({ ...r, email });

  res.status(200).json(resultat);
};
