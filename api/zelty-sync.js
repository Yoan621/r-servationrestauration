// /api/zelty-sync — pont entre le CRM (Firestore) et le script du VPS (vps-zelty/).
//
// Le VPS parle à Zelty (API à clé + back-office) ; ce endpoint ne fait que lire
// et écrire Firestore, avec la règle de traduction des statuts.
//
//   GET  -> { surveiller: [...], annuler: [...] }
//           surveiller : résas actives à relire dans Zelty (zeltyBookingId présent)
//           annuler    : résas annulées dans le CRM, pas encore annulées dans Zelty
//   POST { ref, zelty: { status, cancel_reason, arrived_at, closed_at } }
//           -> traduit l'état Zelty en statut CRM et l'écrit (jamais de retour arrière)
//   POST { ref, annuleZelty: true }   -> annulation faite dans Zelty : retire de « annuler »
//   POST { ref, erreur: "texte" }     -> échec de l'annulation Zelty : mémorisé pour le BO
//
// Sécurité : secret partagé obligatoire (ZELTY_SYNC_SECRET), en-tête
// `Authorization: Bearer <secret>`. Sans variable d'environnement, le endpoint refuse tout.
const crypto = require('crypto');
const { reservationsDepuis, lireReservation, majStatut, valeur } = require('./_lib/firestore');
const { statutDepuisZelty, FINAUX } = require('./_lib/zelty-etat');

function autorise(req) {
  const secret = process.env.ZELTY_SYNC_SECRET;
  if (!secret) return { ok: false, code: 503, msg: 'ZELTY_SYNC_SECRET non configuré' };
  const recu = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const a = Buffer.from(recu), b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 401, msg: 'Non autorisé' };
  return { ok: true };
}

function jourParis(decalage = 0) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  d.setDate(d.getDate() + decalage);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lire(champs) {
  const data = valeur(champs.data) || {};
  return {
    statut: valeur(champs.statut) || data.statut || 'nouvelle',
    zeltyId: valeur(champs.zeltyBookingId) || '',
    restaurant: valeur(champs.restaurant) || data.restaurant || '',
    date: valeur(champs.date) || data.date || '',
    annuleZeltyLe: valeur(champs.zeltyAnnuleLe) || ''
  };
}

module.exports = async function handler(req, res) {
  const auth = autorise(req);
  if (!auth.ok) { res.status(auth.code).json({ error: auth.msg }); return; }

  try {
    if (req.method === 'GET') {
      // Hier inclus : une table clôturée après minuit doit encore être relue.
      const docs = await reservationsDepuis(jourParis(-1));
      const surveiller = [], annuler = [];
      for (const d of docs) {
        const r = lire(d.champs);
        if (!r.zeltyId) continue;
        if (r.statut === 'annulee') {
          // Annulée dans le CRM : à annuler en caisse, seulement pour aujourd'hui et plus tard
          // (les résas passées n'ont plus de table à libérer).
          if (!r.annuleZeltyLe && r.date >= jourParis(0)) annuler.push({ ref: d.ref, zeltyId: r.zeltyId, restaurant: r.restaurant, date: r.date });
        } else if (!FINAUX.includes(r.statut)) {
          surveiller.push({ ref: d.ref, zeltyId: r.zeltyId, restaurant: r.restaurant, date: r.date, statut: r.statut });
        }
      }
      res.status(200).json({ surveiller, annuler });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const ref = String(body.ref || '').trim();
      if (!/^[A-Z0-9]{4,12}$/i.test(ref)) { res.status(400).json({ error: 'ref invalide' }); return; }
      const maintenant = new Date().toISOString();

      if (body.annuleZelty) {
        await majStatut(ref, null, { zeltyAnnuleLe: maintenant, zeltyErreur: '' });
        res.status(200).json({ ok: true });
        return;
      }
      if (body.erreur) {
        await majStatut(ref, null, { zeltyErreur: String(body.erreur).slice(0, 300), zeltySyncLe: maintenant });
        res.status(200).json({ ok: true });
        return;
      }
      if (body.zelty) {
        const champs = await lireReservation(ref);
        if (!champs) { res.status(404).json({ error: 'réservation introuvable' }); return; }
        const r = lire(champs);
        const z = body.zelty;
        const verdict = statutDepuisZelty(z, r.statut);
        const suivi = { zeltySyncLe: maintenant, zeltyEtat: `${z.status}/${z.cancel_reason || 0}` };
        // Annulée côté Zelty : plus rien à pousser en caisse.
        if (verdict.annuleeZelty) suivi.zeltyAnnuleLe = maintenant;
        await majStatut(ref, verdict.statut, suivi);
        res.status(200).json({ ok: true, ancien: r.statut, nouveau: verdict.statut, raison: verdict.raison });
        return;
      }
      res.status(400).json({ error: 'corps non reconnu' });
      return;
    }

    res.status(405).json({ error: 'GET ou POST' });
  } catch (e) {
    console.error('[zelty-sync]', e.message);
    res.status(500).json({ error: e.message });
  }
};
