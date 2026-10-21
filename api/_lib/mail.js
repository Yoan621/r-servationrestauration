// Envoi d'e-mails transactionnels via Brevo + gabarits partagés.
// La clé API ne sort jamais du serveur (variable d'env Vercel).
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'fricacciamarketing@gmail.com';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Fricaccia';

// Logo servi par une vraie URL HTTPS : Gmail webmail rejette les images en
// data URI, et tout e-mail > 102 Ko est tronqué (piège déjà rencontré).
const LOGO_URL = 'https://fricaccia.fr/wp-content/uploads/2025/07/imgi_1_1750058701749.png';

const CANCEL_BASE_URL = (process.env.CANCEL_BASE_URL || 'http://localhost:8971').replace(/\/$/, '');
const DUREE_MOYENNE_MIN = 90;

// Liens d'avis des deux fiches Google.
const AVIS_URL = {
  Montpellier: 'https://g.page/r/Cd1Ia0YpCNfyEAE/review',
  Perpignan: 'https://g.page/r/CbTiWhN3LrtrEAE/review'
};

function avisUrl(restaurant) {
  return String(restaurant || '').toLowerCase().includes('montpellier') ? AVIS_URL.Montpellier : AVIS_URL.Perpignan;
}

function echapper(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Salutation : prénom si on l'a, sinon nom, sinon rien du tout.
// Une réservation prise au téléphone peut n'avoir qu'un nom de famille.
function salutation(r) {
  const prenom = String(r.prenom || '').trim();
  const nom = String(r.nom || '').trim();
  const qui = prenom || nom;
  return qui ? `Ciao ${echapper(qui)} 👋` : 'Ciao 👋';
}

function googleCalendarUrl(r) {
  const [Y, M, D] = String(r.date).split('-').map(Number);
  const [h, m] = String(r.heure).split(':').map(Number);
  const debut = new Date(Y, M - 1, D, h, m);
  const fin = new Date(debut.getTime() + DUREE_MOYENNE_MIN * 60000);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Fricaccia ${r.restaurant}`,
    dates: `${fmt(debut)}/${fmt(fin)}`,
    details: `Réservation ${r.pax} pers.${r.bookingRef ? ' — réf ' + r.bookingRef : ''}`,
    location: `Fricaccia ${r.restaurant}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function cancelUrl(r) {
  const params = new URLSearchParams({ ref: r.bookingRef || '', email: r.email || '' });
  return `${CANCEL_BASE_URL}/cancel.html?${params.toString()}`;
}

// Enveloppe commune aux deux e-mails : même en-tête noir, même logo, même pied.
function enveloppe(contenu) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#FFF7EF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border:1px solid #EAD9C8;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#262626;padding:28px 24px;text-align:center;">
          <img src="${LOGO_URL}" alt="Fricaccia" width="200" style="display:block;margin:0 auto;">
        </td></tr>
        ${contenu}
        <tr><td style="background:#262626;padding:18px;text-align:center;">
          <p style="font-family:Arial,sans-serif;font-weight:300;font-size:11px;color:#cfc6b8;margin:0;letter-spacing:1px;">
            FRICACCIA · ITALIAN STREET FOOD
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function htmlConfirmation(r) {
  const jourMois = new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const pax = parseInt(r.pax, 10) || 1;
  return enveloppe(`
        <tr><td style="padding:32px 28px 8px;">
          <p style="font-family:Arial,sans-serif;font-weight:700;font-size:22px;color:#C3171F;margin:0 0 4px;">Réservation confirmée</p>
          <p style="font-family:Arial,sans-serif;font-weight:300;font-size:14px;color:#262626;margin:0 0 20px;">${salutation(r)} — à très vite !</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EF;border-radius:10px;">
            <tr><td style="padding:18px 20px;font-family:Arial,sans-serif;font-size:14px;color:#262626;line-height:1.9;">
              <strong style="color:#C3171F;">Fricaccia ${echapper(r.restaurant)}</strong><br>
              📅 ${jourMois.charAt(0).toUpperCase() + jourMois.slice(1)}<br>
              🕒 ${echapper(r.heure)}<br>
              👥 ${pax} personne${pax > 1 ? 's' : ''}
              ${r.note ? `<br>📝 ${echapper(r.note)}` : ''}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 24px;text-align:center;">
          <a href="${googleCalendarUrl(r)}" style="display:inline-block;background:#262626;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;padding:10px 20px;border-radius:20px;">+ Ajouter à mon calendrier</a>
        </td></tr>
        <tr><td style="padding:0 28px 32px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#96866f;">
          Un empêchement ? <a href="${cancelUrl(r)}" style="color:#C3171F;font-weight:bold;text-decoration:none;">Gérer / annuler ma réservation</a>
        </td></tr>`);
}

// E-mail du lendemain : c'est la Nonna qui parle, elle ne vend rien, elle demande.
function htmlAvis(r) {
  // Les 3 variables du message : le nom du client, le restaurant réservé,
  // et le lien d'avis Google correspondant à ce restaurant.
  const lien = avisUrl(r.restaurant);
  const resto = echapper(r.restaurant || '');
  return enveloppe(`
        <tr><td style="padding:32px 28px 8px;">
          <p style="font-family:Arial,sans-serif;font-weight:700;font-size:22px;color:#C3171F;margin:0 0 4px;">La Nonna veut savoir</p>
          <p style="font-family:Arial,sans-serif;font-weight:300;font-size:14px;color:#262626;margin:0 0 18px;">${salutation(r)}</p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;font-family:Arial,sans-serif;font-size:14px;color:#262626;line-height:1.7;">
          Hier tu étais chez nous, à Fricaccia ${resto}.<br><br>
          La Nonna est derrière le four depuis ce matin et elle n'a qu'une question : est-ce que c'était bon ?<br><br>
          Si la réponse est oui, dis-le-lui en public — deux lignes sur Google, 30 secondes, et ça change tout pour nous.
          Si la réponse est non, réponds à cet e-mail : c'est elle qui lira.
        </td></tr>
        <tr><td style="padding:0 28px 24px;text-align:center;">
          <a href="${lien}" style="display:inline-block;background:#C3171F;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:13px 26px;border-radius:24px;">⭐ Laisser un avis à la Nonna</a>
        </td></tr>
        <tr><td style="padding:0 28px 32px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#96866f;">
          Grazie mille 🤌
        </td></tr>`);
}

async function envoyer({ to, nom, sujet, html, replyTo }) {
  if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY manquante');
  const corps = {
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email: to, name: nom || undefined }],
    subject: sujet,
    htmlContent: html
  };
  if (replyTo) corps.replyTo = { email: replyTo };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify(corps)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

module.exports = { envoyer, htmlConfirmation, htmlAvis, avisUrl, cancelUrl, googleCalendarUrl };
