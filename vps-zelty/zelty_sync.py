#!/usr/bin/env python3
"""Pont CRM Fricaccia <-> Zelty, à lancer par cron sur le VPS (sans lien avec Vintex).

Chaque passage :
  1. demande au CRM la liste « annuler » (résas annulées dans le CRM, pas encore en caisse)
     -> annule dans Zelty par la route du back-office, vérifie par l'API, prévient le CRM ;
  2. (toutes les SYNC_EVERY_MIN minutes) relit dans Zelty les résas actives
     -> envoie l'état au CRM, qui le traduit en statut (annulée, arrivée, terminée).

Aucune dépendance : bibliothèque standard Python 3 uniquement.
Config : fichier .env à côté du script (voir env.example). Rien n'est lu ailleurs.
"""
import fcntl, http.cookiejar, json, os, sys, time, urllib.error, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
ETAT = os.path.join(ICI, '.state')
API = 'https://api.zelty.fr/2.7'
BO = 'https://bo.zelty.fr'
RESTO_ID = {'perpignan': '8203', 'montpellier': '9941'}


def charger_env():
    env = {}
    chemin = os.path.join(ICI, '.env')
    if os.path.exists(chemin):
        for ligne in open(chemin, encoding='utf-8'):
            ligne = ligne.strip()
            if ligne and not ligne.startswith('#') and '=' in ligne:
                k, v = ligne.split('=', 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    for k in ('CRM_URL', 'ZELTY_SYNC_SECRET', 'ZELTY_API_KEY', 'ZELTY_BO_LOGIN', 'ZELTY_BO_PASSWORD', 'SYNC_EVERY_MIN'):
        env.setdefault(k, os.environ.get(k, ''))
    return env


ENV = charger_env()
DRY = '--dry-run' in sys.argv


def log(*a):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), *a, flush=True)


def slug(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(s or '')) if unicodedata.category(c) != 'Mn').strip().lower()


# ---------- CRM (Vercel) ----------
def crm(methode, corps=None):
    req = urllib.request.Request(
        ENV['CRM_URL'].rstrip('/') + '/api/zelty-sync', method=methode,
        data=json.dumps(corps).encode() if corps is not None else None,
        headers={'Authorization': 'Bearer ' + ENV['ZELTY_SYNC_SECRET'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


# ---------- Zelty : API à clé (lecture) ----------
def lire_booking(zelty_id, restaurant):
    rid = RESTO_ID.get(slug(restaurant))
    if not rid:
        raise RuntimeError(f'restaurant inconnu: {restaurant!r}')
    for essai in range(3):
        req = urllib.request.Request(f'{API}/bookings/{zelty_id}?id_restaurant={rid}',
                                     headers={'Authorization': 'Bearer ' + ENV['ZELTY_API_KEY']})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                b = json.loads(r.read().decode(), strict=False).get('booking', {})
            return {k: b.get(k) for k in ('status', 'cancel_reason', 'arrived_at', 'closed_at')}
        except urllib.error.HTTPError as e:
            if e.code == 429:  # rate limit : on patiente
                time.sleep(5 * (essai + 1)); continue
            raise
    raise RuntimeError('Zelty 429 persistant')


# ---------- Zelty : back-office (annulation) ----------
class BackOffice:
    def __init__(self):
        os.makedirs(ETAT, exist_ok=True)
        self.fichier = os.path.join(ETAT, 'cookies.txt')
        self.jar = http.cookiejar.MozillaCookieJar(self.fichier)
        if os.path.exists(self.fichier):
            try: self.jar.load(ignore_discard=True, ignore_expires=True)
            except Exception: pass
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.opener.addheaders = [('User-Agent', 'Mozilla/5.0 (fricaccia-zelty-sync)')]

    def _sauver(self):
        self.jar.save(ignore_discard=True, ignore_expires=True)
        os.chmod(self.fichier, 0o600)

    def connecte(self):
        return any(c.name == 'auth_token' for c in self.jar)

    def login(self):
        if not ENV['ZELTY_BO_LOGIN'] or not ENV['ZELTY_BO_PASSWORD']:
            raise RuntimeError('ZELTY_BO_LOGIN / ZELTY_BO_PASSWORD manquants dans .env')
        data = urllib.parse.urlencode({'login': ENV['ZELTY_BO_LOGIN'], 'password': ENV['ZELTY_BO_PASSWORD'],
                                       'redirectURL': '/app?path=/home'}).encode()
        with self.opener.open(urllib.request.Request(BO + '/', data=data, method='POST'), timeout=30) as r:
            url_finale = r.geturl()
        if not self.connecte() or '/app' not in url_finale:
            raise RuntimeError('connexion BO Zelty refusée (identifiants, 2FA ou captcha ajouté ?)')
        self._sauver()
        log('BO : connecté')

    def statut(self, booking_id, action, reason=None):
        """action: 'cancel' | 'confirm'. Renvoie le JSON du BO. Se reconnecte si besoin."""
        for essai in range(2):
            if not self.connecte() or essai == 1:
                self.login()
            champs = {'status': action}
            if reason:
                champs['reason'] = reason
            req = urllib.request.Request(f'{BO}/ajax/bookings_status/{booking_id}',
                                         data=urllib.parse.urlencode(champs).encode(), method='POST',
                                         headers={'X-Requested-With': 'XMLHttpRequest'})
            try:
                with self.opener.open(req, timeout=30) as r:
                    texte = r.read().decode(errors='replace')
                    url_finale = r.geturl()
            except urllib.error.HTTPError as e:
                if e.code in (401, 403) and essai == 0:
                    self.jar.clear(); continue
                raise
            if url_finale.rstrip('/') == BO or '<form' in texte[:2000].lower() and 'password' in texte.lower():
                self.jar.clear(); continue  # session expirée -> page de login renvoyée
            self._sauver()
            try:
                return json.loads(texte)
            except ValueError:
                return {'raw': texte[:200]}
        raise RuntimeError('BO : impossible de rester connecté')


# ---------- logique ----------
def deja_annulee(z):
    return bool(z and (z.get('cancel_reason') or 0) != 0)


def traiter_annulations(bo, liste):
    for r in liste:
        ref, zid, resto = r['ref'], r['zeltyId'], r['restaurant']
        try:
            avant = lire_booking(zid, resto)
            if deja_annulee(avant):
                log(f'{ref} (Zelty {zid}) : déjà annulée en caisse');
                if not DRY: crm('POST', {'ref': ref, 'annuleZelty': True})
                continue
            if DRY:
                log(f'{ref} (Zelty {zid}) : [dry-run] annulerait en caisse'); continue
            rep = bo.statut(zid, 'cancel', 'restaurant')
            time.sleep(1.5)
            apres = lire_booking(zid, resto)
            if deja_annulee(apres):
                log(f'{ref} (Zelty {zid}) : annulée en caisse OK, BO a répondu {str(rep)[:80]}')
                crm('POST', {'ref': ref, 'annuleZelty': True})
            else:
                msg = f'BO a répondu {str(rep)[:120]} mais Zelty n\'est pas passée en annulée'
                log(f'{ref} (Zelty {zid}) : ÉCHEC {msg}'); crm('POST', {'ref': ref, 'erreur': msg})
        except Exception as e:
            log(f'{ref} (Zelty {zid}) : ERREUR {e}')
            try: crm('POST', {'ref': ref, 'erreur': str(e)[:250]})
            except Exception: pass
        time.sleep(1.5)


def doit_synchroniser():
    fichier = os.path.join(ETAT, 'derniere_synchro')
    delai = int(ENV.get('SYNC_EVERY_MIN') or 5) * 60
    try:
        if time.time() - os.path.getmtime(fichier) < delai: return False
    except OSError:
        pass
    os.makedirs(ETAT, exist_ok=True)
    open(fichier, 'w').close()
    return True


def traiter_synchro(liste):
    for r in liste[:40]:
        ref, zid = r['ref'], r['zeltyId']
        try:
            z = lire_booking(zid, r['restaurant'])
            if DRY:
                log(f'{ref} (Zelty {zid}) : [dry-run] état {z}'); continue
            rep = crm('POST', {'ref': ref, 'zelty': z})
            if rep.get('nouveau'):
                log(f'{ref} : {rep["ancien"]} -> {rep["nouveau"]} ({rep["raison"]})')
        except Exception as e:
            log(f'{ref} (Zelty {zid}) : ERREUR {e}')
        time.sleep(1.5)


def main():
    for cle in ('CRM_URL', 'ZELTY_SYNC_SECRET', 'ZELTY_API_KEY'):
        if not ENV[cle]:
            sys.exit(f'{cle} manquant dans .env')
    os.makedirs(ETAT, exist_ok=True)
    verrou = open(os.path.join(ETAT, 'verrou'), 'w')
    try: fcntl.flock(verrou, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError: sys.exit(0)  # un autre passage tourne encore

    etat = crm('GET')
    if etat['annuler']:
        traiter_annulations(BackOffice(), etat['annuler'])
    if etat['surveiller'] and doit_synchroniser():
        traiter_synchro(etat['surveiller'])


if __name__ == '__main__':
    try: main()
    except Exception as e:
        log('ERREUR FATALE', e); sys.exit(1)
