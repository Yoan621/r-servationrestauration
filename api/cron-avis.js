// GET /api/cron-avis — e-mail de satisfaction / demande d'avis à J+1.
// Déclenché par Vercel Cron (voir vercel.json). Sélectionne les réservations
// de la VEILLE au statut 'terminee' qui n'ont pas encore été sollicitées,
// envoie l'e-mail de la Nonna avec le lien Google du bon restaurant, puis
// marque le document pour ne jamais renvoyer deux fois.
//
// Prérequis métier : la salle doit réellement passer les réservations à
// « Terminée ». Sans ce statut, le cron ne trouve rien et n'envoie rien.
const { reservationsDuJour, marquerAvisEnvoye, valeur } = require('./_lib/firestore');
const { envoyer, htmlAvis } = require('./_lib/mail');

// Date de la veille en heure de Paris (le cron Vercel tourne en UTC).
function veilleParis() {
  const maintenantParis = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  maintenantParis.setDate(maintenantParis.getDate() - 1);
  const p = n => String(n).padStart(2, '0');
  return `${maintenantParis.getFullYear()}-${p(maintenantParis.getMonth() + 1)}-${p(maintenantParis.getDate())}`;
}

module.exports = async function handler(req, res) {
  // Vercel ajoute cet en-tête à ses appels de cron dès que CRON_SECRET existe.
  // Sans ce contrôle, n'importe qui pourrait déclencher la campagne en boucle.
  const attendu = process.env.CRON_SECRET;
  if (attendu && req.headers.authorization !== `Bearer ${attendu}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const jour = req.query && req.query.date ? String(req.query.date) : veilleParis();
  const simulation = !!(req.query && req.query.dryRun);
  const rapport = { jour, simulation, examinees: 0, envoyes: 0, ignorees: [], erreurs: [] };

  try {
    const docs = await reservationsDuJour(jour);
    rapport.examinees = docs.length;

    for (const d of docs) {
      const ref = d.nom.split('/').pop();
      const statut = valeur(d.champs.statut);
      const dejaEnvoye = valeur(d.champs.avisEnvoyeLe);
      const data = valeur(d.champs.data) || {};
      const email = String(valeur(d.champs.email) || data.email || '').trim().toLowerCase();
      const restaurant = valeur(d.champs.restaurant) || data.restaurant || '';

      if (statut !== 'terminee') { rapport.ignorees.push(`${ref}: statut ${statut}`); continue; }
      if (dejaEnvoye) { rapport.ignorees.push(`${ref}: déjà sollicité le ${dejaEnvoye}`); continue; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { rapport.ignorees.push(`${ref}: pas d'e-mail`); continue; }

      if (simulation) { rapport.envoyes++; continue; }

      try {
        await envoyer({
          to: email,
          nom: `${data.prenom || ''} ${data.nom || ''}`.trim(),
          sujet: 'Alors, la Nonna a bien travaillé ?',
          html: htmlAvis({ prenom: data.prenom || '', nom: data.nom || '', restaurant }),
          replyTo: process.env.BREVO_SENDER_EMAIL || undefined
        });
        await marquerAvisEnvoye(ref, new Date().toISOString());
        rapport.envoyes++;
      } catch (e) {
        console.error('[cron-avis]', ref, e);
        rapport.erreurs.push(`${ref}: ${e.message}`);
      }
    }

    res.status(rapport.erreurs.length ? 207 : 200).json(rapport);
  } catch (e) {
    console.error('[cron-avis] échec global', e);
    res.status(500).json({ error: e.message, ...rapport });
  }
};
