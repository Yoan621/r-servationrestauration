// POST /api/cancel-notification — appelé par cancel.html juste après qu'un client
// a annulé sa réservation. Envoie une notification WhatsApp à l'équipe du
// restaurant concerné : « le client ne vient pas ».
//
// Pourquoi côté serveur : la clé CallMeBot vit dans les variables d'environnement
// Vercel, jamais dans le code client.
//
// Anti-spam : on ne notifie que si la réservation existe VRAIMENT, que l'e-mail
// correspond, et qu'elle est réellement au statut `annulee`. On relit l'état en
// base (compte de service, hors règles) plutôt que de faire confiance au client.
const { notifierAnnulation } = require('./_lib/whatsapp');
const { lireReservation, valeur } = require('./_lib/firestore');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const ref = String(b.ref || '').trim().toUpperCase();
  const email = String(b.email || '').trim().toLowerCase();
  const motif = String(b.motif || '').trim().slice(0, 200);

  if (!ref || !email) {
    res.status(400).json({ error: 'ref et email requis' });
    return;
  }

  try {
    const champs = await lireReservation(ref);
    if (!champs) {
      res.status(404).json({ error: 'Réservation introuvable' });
      return;
    }

    const emailDoc = String(valeur(champs.email) || '').toLowerCase();
    const statut = valeur(champs.statut);
    if (emailDoc !== email) {
      res.status(403).json({ error: 'Non autorisé' });
      return;
    }
    if (statut !== 'annulee') {
      res.status(409).json({ error: 'Réservation non annulée', statut });
      return;
    }

    const data = valeur(champs.data) || {};
    const wa = await notifierAnnulation({
      restaurant: data.restaurant || valeur(champs.restaurant),
      date: data.date || valeur(champs.date),
      heure: data.heure || valeur(champs.heure),
      prenom: data.prenom,
      nom: data.nom,
      pax: data.pax,
      tel: data.tel,
      bookingRef: ref,
      motif
    });

    res.status(200).json({ ok: true, whatsapp: wa });
  } catch (e) {
    console.error('[cancel-notification]', e.message);
    // Jamais bloquant pour le client : l'annulation a déjà réussi côté base.
    res.status(200).json({ ok: false, raison: e.message });
  }
};
