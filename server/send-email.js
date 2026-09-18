// Petit serveur local : reçoit une réservation, envoie l'email de confirmation via Brevo.
// Clé API lue depuis .env (jamais exposée au navigateur). Lancer avec :
//   node --env-file=.env send-email.js
const http = require('http');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Fricaccia';
const PORT = process.env.PORT || 8788;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BREVO_API_KEY || !SENDER_EMAIL) {
  console.error('BREVO_API_KEY ou BREVO_SENDER_EMAIL manquant dans server/.env');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Config Supabase manquante dans server/.env (gestion des accès désactivée)');
}

// Logo hébergé sur fricaccia.fr (WordPress) : Gmail rejette les images en base64
// inline (data URI) côté webmail, contrairement à Apple Mail — besoin d'une vraie
// URL HTTPS publique pour que l'image s'affiche partout.
// ⚠️ Logo générique (pas de variante "PERPIGNAN"/"Montpellier" distincte connue) —
// même logo affiché pour les 2 restos.
const LOGO_URL = 'https://fricaccia.fr/wp-content/uploads/2025/07/imgi_1_1750058701749.png';

// ⚠️ Placeholder tant que le site n'est pas déployé en prod — remplacer par le vrai
// domaine (ex: https://reservation.fricaccia.fr) avant d'envoyer de vrais emails clients.
const CANCEL_BASE_URL = process.env.CANCEL_BASE_URL || 'http://localhost:8642';
const DUREE_MOYENNE_MIN = 90;

function googleCalendarUrl(r) {
  const [Y, M, D] = r.date.split('-').map(Number);
  const [h, m] = r.heure.split(':').map(Number);
  const start = new Date(Y, M - 1, D, h, m);
  const end = new Date(start.getTime() + DUREE_MOYENNE_MIN * 60000);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Fricaccia ${r.restaurant}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Réservation ${r.pax} pers.${r.bookingRef ? ' — réf ' + r.bookingRef : ''}`,
    location: `Fricaccia ${r.restaurant}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function cancelUrl(r) {
  const params = new URLSearchParams({ ref: r.bookingRef || '', email: r.email || '' });
  return `${CANCEL_BASE_URL}/cancel.html?${params.toString()}`;
}

function emailHtml(r) {
  const jourMois = new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background:#FFF7EF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EF;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#FFFFFF;border:1px solid #EAD9C8;border-radius:14px;overflow:hidden;">

        <tr><td style="background:#262626;padding:28px 24px;text-align:center;">
          <img src="${LOGO_URL}" alt="Fricaccia" width="200" style="display:block;margin:0 auto;">
        </td></tr>

        <tr><td style="padding:32px 28px 8px;">
          <p style="font-family:Arial,sans-serif;font-weight:700;font-size:22px;color:#C3171F;margin:0 0 4px;">
            Réservation confirmée
          </p>
          <p style="font-family:Arial,sans-serif;font-weight:300;font-size:14px;color:#262626;margin:0 0 20px;">
            Ciao ${r.prenom} 👋 — à très vite !
          </p>
        </td></tr>

        <tr><td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EF;border-radius:10px;">
            <tr><td style="padding:18px 20px;font-family:Arial,sans-serif;font-size:14px;color:#262626;line-height:1.9;">
              <strong style="color:#C3171F;">Fricaccia ${r.restaurant}</strong><br>
              📅 ${jourMois.charAt(0).toUpperCase() + jourMois.slice(1)}<br>
              🕒 ${r.heure}<br>
              👥 ${r.pax} personne${r.pax > 1 ? 's' : ''}
              ${r.note ? `<br>📝 ${r.note}` : ''}
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 28px 24px;text-align:center;">
          <a href="${googleCalendarUrl(r)}" style="display:inline-block;background:#262626;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;padding:10px 20px;border-radius:20px;">
            + Ajouter à mon calendrier
          </a>
        </td></tr>

        <tr><td style="padding:0 28px 20px;text-align:center;font-family:Arial,sans-serif;font-size:12px;color:#96866f;">
          Un empêchement ? <a href="${cancelUrl(r)}" style="color:#C3171F;font-weight:bold;text-decoration:none;">Gérer / annuler ma réservation</a>
        </td></tr>

        <tr><td style="padding:0 28px 32px;font-family:Arial,sans-serif;font-size:12px;color:#96866f;text-align:center;">
          Ou contacte directement le restaurant.
        </td></tr>

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

async function sendConfirmation(reservation) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: reservation.email, name: `${reservation.prenom} ${reservation.nom}` }],
      subject: `Réservation confirmée — Fricaccia ${reservation.restaurant}`,
      htmlContent: emailHtml(reservation)
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ---------------------------------------------------------------------
// Gestion des accès staff (service_role — jamais exposée au navigateur).
// Chaque appel exige le token de session de l'appelant (son propre
// access_token Supabase, récupéré via supabaseClient.auth.getSession()
// côté front) pour vérifier qu'il est bien admin AVANT toute action.
// ---------------------------------------------------------------------

async function getCallerFromToken(token) {
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  return res.json();
}

async function isAdmin(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/utilisateurs_roles?user_id=eq.${userId}&select=role`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return rows[0]?.role === 'admin';
}

async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const caller = await getCallerFromToken(token);
  if (!caller || !(await isAdmin(caller.id))) {
    const err = new Error('Accès refusé — réservé aux admins');
    err.status = 403;
    throw err;
  }
  return caller;
}

async function listStaff() {
  const [usersRes, rolesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    }),
    fetch(`${SUPABASE_URL}/rest/v1/utilisateurs_roles?select=user_id,role,restaurant_id,restaurants(nom,slug)`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    })
  ]);
  const { users } = await usersRes.json();
  const roles = await rolesRes.json();
  const roleByUserId = Object.fromEntries(roles.map(r => [r.user_id, r]));
  return users.map(u => ({
    id: u.id,
    email: u.email,
    role: roleByUserId[u.id]?.role || null,
    restaurant: roleByUserId[u.id]?.restaurants?.nom || null,
    created_at: u.created_at
  }));
}

async function restaurantIdBySlug(slug) {
  if (!slug) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/restaurants?slug=eq.${slug}&select=id`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  const rows = await res.json();
  return rows[0]?.id || null;
}

async function createStaff({ email, password, role, restaurant_slug }) {
  if (!email || !password || !role) throw Object.assign(new Error('email, password et role requis'), { status: 400 });

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  const created = await createRes.json();
  if (!createRes.ok) throw Object.assign(new Error(created.msg || created.error_description || 'Création compte échouée'), { status: 400 });

  const restaurant_id = await restaurantIdBySlug(restaurant_slug);
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/utilisateurs_roles`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    },
    body: JSON.stringify({ user_id: created.id, role, restaurant_id })
  });
  if (!roleRes.ok) throw Object.assign(new Error('Compte créé mais assignation du rôle échouée'), { status: 500 });

  return { id: created.id, email: created.email, role, restaurant_slug: restaurant_slug || null };
}

async function updateStaff({ user_id, role, restaurant_slug }) {
  if (!user_id || !role) throw Object.assign(new Error('user_id et role requis'), { status: 400 });
  const restaurant_id = await restaurantIdBySlug(restaurant_slug);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/utilisateurs_roles?user_id=eq.${user_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    },
    body: JSON.stringify({ role, restaurant_id })
  });
  if (!res.ok) throw Object.assign(new Error('Mise à jour échouée'), { status: 500 });
  return res.json();
}

async function deleteStaff(user_id) {
  if (!user_id) throw Object.assign(new Error('user_id requis'), { status: 400 });
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!res.ok && res.status !== 404) throw Object.assign(new Error('Suppression échouée'), { status: 500 });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  const url = new URL(req.url, 'http://internal');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/api/send-confirmation') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const reservation = JSON.parse(body);
        if (!reservation.email) throw new Error('email manquant');
        const result = await sendConfirmation(reservation);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (e) {
        console.error('Erreur envoi email:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/admin/staff') {
    try {
      if (req.method === 'GET') {
        await requireAdmin(req);
        const staff = await listStaff();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, staff }));
      }
      if (req.method === 'POST') {
        await requireAdmin(req);
        const body = await readBody(req);
        const created = await createStaff(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, staff: created }));
      }
      if (req.method === 'PATCH') {
        await requireAdmin(req);
        const body = await readBody(req);
        await updateStaff(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.method === 'DELETE') {
        await requireAdmin(req);
        await deleteStaff(url.searchParams.get('user_id'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }
    } catch (e) {
      console.error('Erreur admin/staff:', e.message);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Serveur email confirmation sur http://localhost:${PORT}`));
