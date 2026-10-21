// Configuration partagée booking.html / cancel.html / index.html — Firebase Cloud Firestore
const firebaseConfig = {
  apiKey: "AIzaSyB_yGHn9abT4S10iWhC-H_A3-WNbq8yP7s",
  authDomain: "fricaccia.firebaseapp.com",
  projectId: "fricaccia",
  storageBucket: "fricaccia.firebasestorage.app",
  messagingSenderId: "594207735459",
  appId: "1:594207735459:web:c7d31bc4063b2662ef0916",
  measurementId: "G-5QQB5MVZ4J"
};

// Initialisation Firebase
if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
  firebase.initializeApp(firebaseConfig);
}

const fbDb = typeof firebase !== 'undefined' ? firebase.firestore() : null;
// Auth n'est chargé que par le back-office (index.html) ; booking.html et
// cancel.html n'embarquent pas le SDK et n'en ont pas besoin.
const fbAuth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;

const RESTO_SLUGS = { Montpellier: 'montpellier', Perpignan: 'perpignan' };
const SLUG_TO_NAME = { montpellier: 'Montpellier', perpignan: 'Perpignan' };
const DUREE_MOYENNE_MIN = 90;
const STATUTS_FINAUX = ['annulee', 'terminee', 'no_show'];

// API Fricaccia basée sur Firestore
const fricacciaApi = {
  // Statut de pause d'un restaurant (par slug)
  async getPause(slug) {
    if (!fbDb) return { en_pause: false };
    try {
      const doc = await fbDb.collection('restaurants').doc(slug).get();
      if (doc.exists) {
        return { en_pause: !!doc.data().en_pause };
      }
      return { en_pause: false };
    } catch (e) {
      console.warn('[fricacciaApi] Erreur lecture pause', e);
      return { en_pause: false };
    }
  },

  // Création d'une réservation depuis le widget public
  async creerReservation(b) {
    if (!fbDb) throw new Error('Base de données non disponible');
    const restaurant = String(b.restaurant || '').trim().slice(0, 40);
    const slug = RESTO_SLUGS[restaurant];
    if (!slug) throw new Error('Restaurant inconnu');

    const pause = await this.getPause(slug);
    if (pause.en_pause) throw new Error('Réservations temporairement en pause pour ce restaurant');

    const date = String(b.date || '').trim().slice(0, 10);
    const heure = String(b.heure || '').trim().slice(0, 5);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const prenom = String(b.prenom || '').trim().slice(0, 80);
    const nom = String(b.nom || '').trim().slice(0, 80);
    const pax = parseInt(b.pax, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide');
    if (!/^\d{2}:\d{2}$/.test(heure)) throw new Error('Heure invalide');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email invalide');
    if (!prenom || !nom) throw new Error('Nom requis');
    if (!(pax >= 1 && pax <= 30)) throw new Error('Nombre de personnes invalide');

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = '';
    for (let i = 0; i < 10 && !ref; i++) {
      let candidat = '';
      for (let c = 0; c < 6; c++) candidat += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      const snap = await fbDb.collection('reservations').doc(candidat).get();
      if (!snap.exists) ref = candidat;
    }
    if (!ref) throw new Error('Impossible de générer une référence unique');

    const data = {
      id: ref,
      bookingRef: ref,
      restaurant, date, heure,
      pax: String(pax),
      service: String(b.service || '').trim().slice(0, 20),
      civilite: b.civilite ? String(b.civilite).trim().slice(0, 10) : null,
      prenom, nom, email,
      tel: String(b.tel || '').trim().slice(0, 30),
      note: String(b.note || '').trim().slice(0, 1000),
      offresEmail: !!b.offresEmail,
      offresSms: !!b.offresSms,
      source: String(b.source || 'site').trim().slice(0, 40),
      statut: 'nouvelle',
      creeLe: new Date().toISOString()
    };

    await fbDb.collection('reservations').doc(ref).set({
      ref,
      restaurant,
      date,
      heure,
      email,
      statut: 'nouvelle',
      data,
      creeLe: data.creeLe
    });

    return { ref };
  },

  // Consultation pour la page cancel.html (réservation + historique pour cet email)
  async getReservation(ref, email) {
    if (!fbDb) throw new Error('Base de données non disponible');
    ref = String(ref || '').trim().toUpperCase();
    email = String(email || '').trim().toLowerCase();
    if (!ref || !email) throw new Error('Réservation introuvable');

    const doc = await fbDb.collection('reservations').doc(ref).get();
    if (!doc.exists) throw new Error('Réservation introuvable');
    const rec = doc.data();
    if (String(rec.email || '').toLowerCase() !== email) {
      throw new Error('Réservation introuvable');
    }

    const d = rec.data || {};
    const vuePublique = {
      ref: rec.ref,
      restaurant: rec.restaurant,
      date: rec.date,
      heure: rec.heure,
      pax: parseInt(d.pax || rec.pax, 10) || null,
      prenom: d.prenom || '',
      nom: d.nom || '',
      email: rec.email,
      statut: rec.statut
    };

    // Historique du même e-mail : requête sur la collection, donc une opération
    // « list » que les règles Firestore réservent au staff authentifié. Côté
    // client public elle est refusée : on retombe alors sur la seule
    // réservation consultée, sans casser la page.
    let snapHisto = null;
    try {
      snapHisto = await fbDb.collection('reservations')
        .where('email', '==', email)
        .get();
    } catch (e) {
      console.info('[fricacciaApi] Historique non accessible pour un client public', e.code || e.message);
      return { reservation: vuePublique, historique: [vuePublique] };
    }

    const historique = [];
    snapHisto.forEach(s => {
      const h = s.data();
      const hd = h.data || {};
      historique.push({
        ref: h.ref,
        restaurant: h.restaurant,
        date: h.date,
        heure: h.heure,
        pax: parseInt(hd.pax || h.pax, 10) || null,
        prenom: hd.prenom || '',
        nom: hd.nom || '',
        email: h.email,
        statut: h.statut
      });
    });

    historique.sort((a, b) => `${b.date} ${b.heure}`.localeCompare(`${a.date} ${a.heure}`));

    return { reservation: vuePublique, historique };
  },

  // Annulation par le client
  async annulerReservation(ref, email, motif) {
    if (!fbDb) throw new Error('Base de données non disponible');
    ref = String(ref || '').trim().toUpperCase();
    email = String(email || '').trim().toLowerCase();
    motif = String(motif || 'non précisé').trim().slice(0, 200);

    const docRef = fbDb.collection('reservations').doc(ref);
    const doc = await docRef.get();
    if (!doc.exists) throw new Error('Réservation introuvable');
    const rec = doc.data();
    if (String(rec.email || '').toLowerCase() !== email) throw new Error('Réservation introuvable');
    if (STATUTS_FINAUX.includes(rec.statut)) throw new Error('Réservation déjà clôturée');

    const d = rec.data || {};
    d.statut = 'annulee';
    d.noteInterne = (d.noteInterne ? d.noteInterne + ' | ' : '') + 'Annulée par client : ' + motif;

    await docRef.update({
      statut: 'annulee',
      data: d
    });

    return { success: true };
  }
};

// Shims de compatibilité si du code appelle encore pbApi
async function pbApi(path, { method = 'GET', body } = {}) {
  if (path.startsWith('/api/fricaccia/pause/')) {
    const slug = path.split('/').pop();
    return await fricacciaApi.getPause(slug);
  }
  if (path === '/api/fricaccia/reserver') {
    return await fricacciaApi.creerReservation(body);
  }
  if (path.startsWith('/api/fricaccia/reservation')) {
    const params = new URLSearchParams(path.split('?')[1] || '');
    return await fricacciaApi.getReservation(params.get('ref'), params.get('email'));
  }
  if (path === '/api/fricaccia/annuler') {
    return await fricacciaApi.annulerReservation(body.ref, body.email, body.motif);
  }
  throw new Error(`Route non supportée: ${path}`);
}

// Lien "Ajouter à Google Calendar"
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
