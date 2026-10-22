// Synchro back-office ↔ Firebase Cloud Firestore.
//
// Le back-office garde son fonctionnement synchrone (loadX()/saveX() sur localStorage) ;
// localStorage sert de cache local, Cloud Firestore est la source de vérité partagée en temps réel :
// - chaque save pousse le diff vers Firestore ;
// - les listeners Firestore (onSnapshot) mettent à jour le cache et déclenchent renderAll() en temps réel.
// Les réservations sont stockées une par document (collection `reservations`),
// les réglages (liste d'attente, intégrations…) en document par clé (collection `reglages`),
// et le statut de pause dans la collection `restaurants`.

const boSync = (() => {
  const KNOWN_KEY = 'fricaccia_fb_refs_connues';
  let storeKey, pauseKey, reglageKeys = [], onChange = () => {};
  let pending = 0;
  let enLigne = null;
  let unsubscribeListeners = [];

  const readLS = (k, def) => {
    try {
      const v = localStorage.getItem(k);
      return v !== null ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  };
  const writeLS = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function bandeau(ok, msg) {
    if (ok === enLigne) return;
    enLigne = ok;
    let el = document.getElementById('pbStatus');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pbStatus';
      el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:10000;background:#C3171F;color:#fff;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.15);max-width:340px;';
      document.body.appendChild(el);
    }
    el.textContent = msg || 'Base de données Firestore injoignable : les données restent sauvegardées en local sur cet ordinateur.';
    el.style.display = ok ? 'none' : 'block';
  }

  async function ecrire(fn) {
    pending++;
    try {
      if (!fbDb) throw new Error('Firestore non initialisé');
      await fn();
      bandeau(true);
    } catch (e) {
      console.error('[boSync] Erreur écriture Firestore', e);
      bandeau(false);
    } finally {
      pending--;
    }
  }

  const champsResa = r => ({
    ref: String(r.id || r.bookingRef),
    restaurant: r.restaurant || '',
    date: r.date || '',
    heure: r.heure || '',
    email: (r.email || '').toLowerCase(),
    statut: r.statut || '',
    data: r,
    updatedAt: (typeof firebase !== 'undefined' && firebase.firestore)
      ? firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString()
  });

  // Diff ancien/nouveau tableau de réservations -> create / update / delete dans Firestore
  function pushReservations(avant, apres) {
    if (!fbDb) return;
    const prev = new Map((avant || []).map(r => [String(r.id || r.bookingRef), JSON.stringify(r)]));
    const next = new Set((apres || []).map(r => String(r.id || r.bookingRef)));

    for (const r of (apres || [])) {
      const ref = String(r.id || r.bookingRef);
      if (!prev.has(ref)) {
        ecrire(() => fbDb.collection('reservations').doc(ref).set(champsResa(r), { merge: true }));
      } else if (prev.get(ref) !== JSON.stringify(r)) {
        ecrire(() => fbDb.collection('reservations').doc(ref).set(champsResa(r), { merge: true }));
      }
    }

    for (const ref of prev.keys()) {
      if (!next.has(ref)) {
        ecrire(() => fbDb.collection('reservations').doc(ref).delete());
      }
    }
  }

  function pushReglage(cle, valeur) {
    if (!fbDb) return;
    ecrire(() => fbDb.collection('reglages').doc(cle).set({
      cle,
      valeur,
      updatedAt: (typeof firebase !== 'undefined' && firebase.firestore)
        ? firebase.firestore.FieldValue.serverTimestamp()
        : new Date().toISOString()
    }, { merge: true }));
  }

  async function setPause(nom, enPause) {
    if (!fbDb) return;
    const slug = RESTO_SLUGS[nom];
    if (!slug) return;
    await ecrire(() => fbDb.collection('restaurants').doc(slug).set({
      slug,
      nom,
      en_pause: !!enPause
    }, { merge: true }));
  }

  // Initialisation et écoute temps réel Firestore
  async function demarrerEcoute() {
    if (!fbDb) {
      bandeau(false, 'Firebase non connecté');
      return;
    }

    try {
      // 1. Initialiser les restaurants par défaut si manquants
      const snapRestos = await fbDb.collection('restaurants').get();
      if (snapRestos.empty) {
        await fbDb.collection('restaurants').doc('perpignan').set({ slug: 'perpignan', nom: 'Perpignan', en_pause: false });
        await fbDb.collection('restaurants').doc('montpellier').set({ slug: 'montpellier', nom: 'Montpellier', en_pause: false });
      }

      // 2. Synchroniser les réglages locaux initiaux si manquants sur Firestore
      for (const k of reglageKeys) {
        const valLocale = readLS(k, null);
        if (valLocale !== null) {
          const doc = await fbDb.collection('reglages').doc(k).get();
          if (!doc.exists) {
            await fbDb.collection('reglages').doc(k).set({ cle: k, valeur: valLocale });
          }
        }
      }

      // 3. Listener temps réel sur les réservations
      const unsubResas = fbDb.collection('reservations').onSnapshot(snapshot => {
        if (pending > 0) return;
        const distantes = [];
        const remoteRefs = new Set();
        snapshot.forEach(doc => {
          const d = doc.data();
          const r = d.data || {
            id: d.ref,
            bookingRef: d.ref,
            restaurant: d.restaurant,
            date: d.date,
            heure: d.heure,
            email: d.email,
            statut: d.statut
          };
          distantes.push(r);
          remoteRefs.add(String(r.id || r.bookingRef));
        });

        // Conserver les résas locales créées hors ligne qui ne sont pas encore sur le serveur
        const connues = new Set(readLS(KNOWN_KEY, []));
        const locales = readLS(storeKey, []).filter(r => !remoteRefs.has(String(r.id || r.bookingRef)) && !connues.has(String(r.id || r.bookingRef)));
        writeLS(KNOWN_KEY, Array.from(remoteRefs));

        const fusion = distantes.concat(locales);
        const avant = JSON.stringify(readLS(storeKey, []));
        writeLS(storeKey, fusion);

        // Si des résas locales n'étaient pas sur Firestore, on les pousse
        if (locales.length > 0) {
          pushReservations([], locales);
        }

        bandeau(true);
        if (JSON.stringify(fusion) !== avant) {
          onChange();
        }
      }, err => {
        console.error('[boSync] Erreur listener réservations', err);
        bandeau(false);
      });
      unsubscribeListeners.push(unsubResas);

      // 4. Listener temps réel sur les réglages (waitlist, zelty)
      const unsubReglages = fbDb.collection('reglages').onSnapshot(snapshot => {
        if (pending > 0) return;
        let change = false;
        snapshot.forEach(doc => {
          const d = doc.data();
          if (reglageKeys.includes(d.cle)) {
            const avant = JSON.stringify(readLS(d.cle, null));
            const apres = JSON.stringify(d.valeur);
            if (avant !== apres) {
              writeLS(d.cle, d.valeur);
              change = true;
            }
          }
        });
        if (change) onChange();
      }, err => {
        console.error('[boSync] Erreur listener réglages', err);
      });
      unsubscribeListeners.push(unsubReglages);

      // 5. Listener temps réel sur les restaurants (statut pause)
      const unsubRestos = fbDb.collection('restaurants').onSnapshot(snapshot => {
        const pauses = {};
        snapshot.forEach(doc => {
          const d = doc.data();
          if (d.nom) pauses[d.nom] = !!d.en_pause;
        });
        const avant = JSON.stringify(readLS(pauseKey, {}));
        const apres = JSON.stringify(pauses);
        writeLS(pauseKey, pauses);
        if (avant !== apres) onChange();
      }, err => {
        console.error('[boSync] Erreur listener restaurants', err);
      });
      unsubscribeListeners.push(unsubRestos);

      bandeau(true);
    } catch (e) {
      console.error('[boSync] Erreur initialisation Firestore', e);
      bandeau(false);
    }
  }

  function init(opts) {
    ({ storeKey, pauseKey, reglageKeys, onChange } = opts);
    demarrerEcoute();
  }

  return { init, pushReservations, pushReglage, setPause, poll: demarrerEcoute };
})();
