// POST /api/send-confirmation — e-mail de confirmation après une réservation.
// Remplace le serveur local server/send-email.js (port 8788), qui ne tournait
// que sur la machine de Yoan : en ligne, booking.html appelait une adresse
// localhost côté client, donc aucun e-mail ne partait.
const { envoyer, htmlConfirmation } = require('./_lib/mail');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  try {
    const r = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const email = String(r.email || '').trim().toLowerCase();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ error: 'E-mail invalide' });
      return;
    }
    if (!r.date || !r.heure || !r.restaurant) {
      res.status(400).json({ error: 'Réservation incomplète' });
      return;
    }

    await envoyer({
      to: email,
      nom: `${r.prenom || ''} ${r.nom || ''}`.trim(),
      sujet: `Réservation confirmée — Fricaccia ${r.restaurant}`,
      html: htmlConfirmation({ ...r, email })
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-confirmation]', e);
    res.status(500).json({ error: 'Envoi impossible' });
  }
};
