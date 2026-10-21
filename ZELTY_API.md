# API Zelty — réservations (`/bookings`)

> Relevé par sondage le 2026-10-21. La doc Zelty n'est pas publique : tout ce qui suit
> a été observé sur l'API de production, pas lu dans une spécification.
> Clé : `ZELTY_API_KEY` dans `server/.env` (jamais dans le code client, jamais commitée).
> C'est la même clé que `10_Reporting/.env` — Zelty n'a pas fourni de clé dédiée réservations.

Base : `https://api.zelty.fr/2.7` · en-tête `Authorization: Bearer <ZELTY_API_KEY>`
Restaurants : Perpignan `8203`, Montpellier `9941`.

`id_restaurant` est **obligatoire en query string** sur toutes les routes testées.
Sans lui : `400 {"errno":59,"errmsg":"ID Restaurant manquant ou invalide"}`

## Ce qui fonctionne

| Appel | Résultat |
|---|---|
| `GET /bookings?id_restaurant=<id>` | réservations **du jour courant** |
| `GET /bookings/<id>?id_restaurant=<id_resto>` | une réservation, **même annulée** |
| `POST /bookings?id_restaurant=<id>` | crée une réservation |

### Créer (validé en réel)

```http
POST /2.7/bookings?id_restaurant=9941
Content-Type: application/json

{
  "booking_for": "2026-10-21T15:45:00+02:00",
  "places": 1,
  "customer": { "name": "Nom", "fname": "Prenom", "phone": "+33...", "mail": "..." },
  "comment": "libre"
}
```

Réponse `200 {"booking": {...}}`. La réservation naît en `status: 80`, `src: "web"`.
Crée aussi une **fiche client** dans la base clients Zelty si elle n'existe pas.

## Ce qui ne fonctionne pas

`DELETE` et `PATCH` sur `/bookings/<id>` répondent `404` dans toutes les formes essayées :
`id_restaurant` en query, `id_restaurant` dans le corps, avec et sans `cancel_reason`,
et `/bookings?id=<id>`. Pourtant `GET` sur la même URL répond `200`, donc la route existe.

`OPTIONS` renvoie `405 Method not allowed. Must be one of: GET, POST, PATCH, DELETE, PUT`,
mais c'est le message global de l'API, pas la liste des méthodes de cette route.

**Conséquence** : aucune annulation programmatique connue à ce jour. Une annulation
client dans le CRM ne peut pas être propagée en caisse → la table resterait bloquée.
C'est bloquant pour une mise en production de la synchro CRM → Zelty.

## Codes de statut observés

| `status` | `cancel_reason` | `arrived_at` | `closed_at` | Sens |
|---|---|---|---|---|
| 80 | 0 | ∅ | ∅ | réservée, à venir |
| 255 | 0 | rempli | rempli | client venu, table servie et clôturée |
| 192 | 0 | ∅ | rempli | clôturée sans arrivée enregistrée |
| 192 | **32** | ∅ | ∅ | **annulée** (annulation faite depuis Zelty) |

⚠️ `status: 192` **ne signifie pas « annulée »**. Le discriminant de l'annulation est
`cancel_reason != 0`. Une table fermée sans pointer l'arrivée porte aussi 192.

Pour « le client est bien venu » : `cancel_reason == 0` **et** (`arrived_at` ou `closed_at` rempli).

## Limites restantes

- **Aucun filtre de date** sur `GET /bookings` : `from`/`to`, `date`, `min_date`/`max_date`,
  `date_min`/`date_max`, `day`, `booking_for`, `start`/`end`, `ts_min` sont tous ignorés,
  la réponse reste le jour courant. `limit`/`offset`/`all`/`status` sans effet non plus.
- Rate limit vite atteint : `429 Too many requests` après ~8 appels rapprochés.

## À demander à Zelty

1. **Comment annuler une réservation par API** — route exacte, et valeur de `status` /
   `cancel_reason` à écrire. Bloquant.
2. Le paramètre de **plage de dates** sur `GET /bookings`.
3. La signification officielle des codes `status` et `cancel_reason`.
