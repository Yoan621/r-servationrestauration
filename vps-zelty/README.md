# vps-zelty — pont CRM Fricaccia ↔ Zelty

Script **indépendant de Vintex** : dossier à part sur le VPS (`~/fricaccia-zelty/`), son propre `.env`,
sa propre ligne de cron, aucun conteneur, aucune dépendance. Il n'est jamais touché par
`sync-vers-vps.sh` (déploiement Vintex).

## Ce qu'il fait
- **CRM → Zelty** : résa annulée dans le CRM → annulée en caisse via le back-office Zelty
  (`POST /ajax/bookings_status/<id>`, `status=cancel&reason=restaurant`), puis vérifiée par l'API.
- **Zelty → CRM** : relit l'état des résas actives (API à clé) et le CRM le traduit
  (annulée par le client / par la caisse, arrivée, terminée). Règles : `api/_lib/zelty-etat.js`.

## Installation sur le VPS (utilisateur `vintex`, sans root)
```bash
ssh vintex 'mkdir -p ~/fricaccia-zelty && chmod 700 ~/fricaccia-zelty'
scp vps-zelty/zelty_sync.py vps-zelty/env.example vintex:~/fricaccia-zelty/
ssh vintex 'cd ~/fricaccia-zelty && cp env.example .env && chmod 600 .env && nano .env'   # remplir
ssh vintex 'cd ~/fricaccia-zelty && python3 zelty_sync.py --dry-run'                      # essai à blanc
```
Cron (toutes les minutes ; un verrou évite les chevauchements) :
```
* * * * * cd $HOME/fricaccia-zelty && /usr/bin/python3 zelty_sync.py >> sync.log 2>&1
```

## Variables (.env)
Voir `env.example`. Les identifiants du back-office ne sont **jamais** à coller dans un chat.

## Limites connues
- La route `ajax/bookings_status` est interne à Zelty (non documentée) : elle peut changer.
  En cas d'échec, le CRM mémorise `zeltyErreur` et la résa reste « à annuler en caisse ».
- À valider au 1er essai : l'annulation par id fonctionne-t-elle quel que soit le restaurant
  affiché dans la session BO ? (Perpignan / Montpellier)
