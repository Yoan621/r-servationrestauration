# Spec fonctionnelle — BackOffice réservation Fricaccia

### Fonctionnalités BackOffice pour gérer le flux client en temps réel

Le BackOffice doit permettre à l'équipe de voir immédiatement **qui arrive, qui attend, qui est installé et quelles tables sont disponibles**.

## 1. Tableau de bord en temps réel

- Nombre de réservations du jour ;
- clients attendus ;
- clients arrivés ;
- clients installés ;
- tables disponibles ;
- tables bientôt libérées ;
- retards ;
- annulations ;
- no-shows ;
- liste d'attente ;
- taux de remplissage ;
- prévision du nombre de couverts par heure.

### Exemple d'affichage

```text
19h00 — 32 couverts prévus
19h30 — 18 couverts prévus
20h00 — 46 couverts prévus
Tables disponibles : 4
Clients en attente : 3
Retards : 2
```

---

## 2. Planning des réservations

- Vue par jour ;
- vue par service : midi / soir ;
- filtres par horaire, nombre de personnes ou statut ;
- recherche par nom ou téléphone ;
- affichage sous forme de liste ou de calendrier ;
- déplacement d'une réservation ;
- modification de l'heure ;
- modification du nombre de personnes ;
- changement de restaurant ;
- ajout d'une note interne ;
- historique des modifications.

---

## 3. Gestion des statuts clients

Chaque réservation devrait pouvoir passer rapidement par plusieurs statuts :

- **Nouvelle réservation** ;
- confirmée ;
- client rappelé ;
- client en retard ;
- arrivé ;
- installé ;
- commande prise ;
- repas terminé ;
- table à nettoyer ;
- table disponible ;
- annulée ;
- no-show.

Les boutons doivent être accessibles en un clic depuis une tablette ou un téléphone.

---

## 4. Plan de salle interactif

Le personnel doit pouvoir visualiser :

- tables libres ;
- tables occupées ;
- tables réservées ;
- tables en nettoyage ;
- tables bloquées ;
- nombre de places par table ;
- regroupement de tables ;
- séparation de tables ;
- placement manuel d'un client ;
- changement de table ;
- durée estimée d'occupation ;
- temps depuis l'arrivée du client.

### Code couleur possible

- 🟢 libre ;
- 🔵 réservée ;
- 🟠 client arrivé ;
- 🔴 occupée ;
- 🟣 en nettoyage ;
- ⚫ indisponible.

---

## 5. Gestion des arrivées

Pour chaque client arrivé :

- bouton **« Client arrivé »** ;
- heure d'arrivée automatique ;
- attribution d'une table ;
- indication du nombre de personnes ;
- affichage des demandes particulières ;
- gestion des retards ;
- indication des clients VIP ;
- possibilité de noter les absents ;
- estimation de l'attente.

Un mode **check-in rapide** pourrait être utilisé depuis une tablette à l'entrée.

---

## 6. Gestion de la liste d'attente

- ajout manuel d'un client ;
- ajout automatique lorsqu'il n'y a plus de disponibilité ;
- nom et téléphone ;
- nombre de personnes ;
- heure d'arrivée ;
- préférence de zone ou de table ;
- temps d'attente estimé ;
- notification lorsqu'une table se libère ;
- confirmation de présence ;
- suppression automatique après expiration ;
- classement par priorité ou par heure d'arrivée.

---

## 7. Gestion des retards et no-shows

Le système peut détecter automatiquement :

- un client en retard de 10 minutes ;
- un client en retard de 20 minutes ;
- une réservation non honorée ;
- une réservation à confirmer.

Actions possibles :

- envoyer un SMS, email ou WhatsApp ;
- appeler le client ;
- libérer la table ;
- conserver la table pendant une durée définie ;
- marquer le client comme no-show ;
- ajouter une note dans son profil.

---

## 8. Gestion des réservations manuelles

Le personnel doit pouvoir créer une réservation depuis le BackOffice avec :

- nom ;
- prénom ;
- téléphone ;
- email ;
- date ;
- heure ;
- nombre de personnes ;
- restaurant ;
- table ;
- demandes particulières ;
- source de réservation ;
- confirmation automatique ou non.

Sources possibles :

- site internet ;
- téléphone ;
- Instagram ;
- WhatsApp ;
- Google ;
- passage spontané ;
- réservation interne.

---

## 9. Gestion des appels téléphoniques

Pour chaque appel entrant, l'équipe doit pouvoir :

- rechercher rapidement un client ;
- voir ses anciennes réservations ;
- voir ses préférences ;
- créer une réservation ;
- modifier une réservation existante ;
- annuler ;
- ajouter une note ;
- envoyer une confirmation immédiatement.

---

## 10. Fiche client accessible en salle

La fiche client peut contenir :

- coordonnées ;
- historique des visites ;
- nombre de réservations ;
- no-shows ;
- préférences ;
- allergies signalées ;
- anniversaire ;
- demandes particulières ;
- restaurant habituellement fréquenté ;
- dernière visite ;
- consentement marketing ;
- notes internes.

Les informations sensibles doivent être contrôlées et limitées aux utilisateurs autorisés.

---

## 11. Communication automatique

Depuis le BackOffice, l'équipe pourrait envoyer :

- confirmation de réservation ;
- rappel avant réservation ;
- message de retard ;
- confirmation d'annulation ;
- message de liste d'attente ;
- message de table disponible ;
- demande de confirmation ;
- message après visite ;
- demande d'avis.

Canaux possibles :

- Brevo pour les emails ;
- WhatsApp via Meta ;
- SMS via un fournisseur spécialisé.

---

## 12. Gestion des services et capacités

Le responsable doit pouvoir configurer :

- horaires du midi ;
- horaires du soir ;
- durée moyenne d'une réservation ;
- capacité maximale ;
- nombre maximal de réservations par créneau ;
- taille maximale d'une table ;
- délai minimum de réservation ;
- délai maximum de réservation ;
- temps tampon entre deux réservations ;
- jours de fermeture ;
- jours fériés ;
- événements spéciaux ;
- réservation bloquée ou limitée sur certains créneaux.

---

## 13. Gestion multi-restaurants

Pour Montpellier et Perpignan :

- séparation des réservations ;
- séparation des équipes ;
- horaires propres à chaque établissement ;
- plan de salle propre à chaque établissement ;
- paramètres Zelty distincts ;
- statistiques par restaurant ;
- possibilité d'avoir une vue globale ;
- URL de réservation dédiée ;
- menus et coordonnées propres à chaque site.

```text
Fricaccia
├── Montpellier
└── Perpignan
```

---

## 14. Notifications internes

Le BackOffice doit prévenir l'équipe lorsqu'il y a :

- nouvelle réservation ;
- annulation ;
- modification importante ;
- grande table ;
- client VIP ;
- demande spéciale ;
- retard important ;
- table libérée ;
- client en attente ;
- problème de synchronisation avec Zelty.

Les notifications peuvent apparaître :

- dans l'application ;
- par email ;
- par notification mobile ;
- éventuellement dans un canal interne.

---

## 15. Gestion des utilisateurs et permissions

### Administrateur

- accès à tous les restaurants ;
- configuration générale ;
- gestion des utilisateurs ;
- statistiques ;
- intégrations.

### Responsable de restaurant

- accès à son établissement ;
- gestion du planning ;
- gestion des tables ;
- gestion des clients ;
- rapports locaux.

### Équipe en salle

- voir les réservations ;
- enregistrer les arrivées ;
- attribuer une table ;
- gérer la liste d'attente ;
- ajouter des notes.

### Lecture seule

- consultation du planning ;
- aucune modification.

---

## 16. Intégration Zelty

Le BackOffice devra prévoir :

- connexion à un compte Zelty par restaurant ;
- synchronisation des données utiles ;
- association réservation/client avec ticket ou passage ;
- récupération éventuelle des informations de fréquentation ;
- gestion des erreurs de synchronisation ;
- affichage de la dernière synchronisation ;
- reconnexion automatique ;
- journal des échanges API.

Il faudra prévoir une architecture permettant de modifier ou compléter cette intégration si l'API Zelty évolue.

---

## 17. Statistiques et rapports

Par restaurant ou globalement :

- réservations par jour ;
- couverts par service ;
- taux d'occupation ;
- chiffre d'affaires associé si disponible via Zelty ;
- taux d'annulation ;
- taux de no-show ;
- durée moyenne d'occupation ;
- nombre de clients récurrents ;
- origine des réservations ;
- performance Instagram, Google, QR code ou site ;
- créneaux les plus demandés ;
- taille moyenne des groupes.

Exports :

- Excel ;
- CSV ;
- PDF ;
- rapports envoyés automatiquement par email.

---

## 18. Historique et traçabilité

Le système doit conserver :

- qui a créé une réservation ;
- qui l'a modifiée ;
- ancienne et nouvelle valeur ;
- heure de l'action ;
- changement de table ;
- annulation ;
- suppression ;
- message envoyé ;
- erreur d'intégration.

C'est indispensable pour comprendre les problèmes en salle.

---

## 19. Mode mobile et mode tablette

L'interface doit être utilisable :

- sur ordinateur ;
- sur tablette à l'accueil ;
- sur téléphone du responsable ;
- avec de gros boutons ;
- avec peu d'informations inutiles ;
- rapidement, même pendant le service.

La priorité doit être la rapidité : **identifier le client, changer son statut et gérer sa table en quelques secondes**.

## Fonctionnalités prioritaires pour le MVP

1. Tableau de bord en temps réel ;
2. planning des réservations ;
3. statuts client ;
4. plan de salle ;
5. arrivées et départs ;
6. liste d'attente ;
7. gestion des retards ;
8. réservations manuelles ;
9. fiches clients ;
10. notifications email et WhatsApp ;
11. séparation Montpellier / Perpignan ;
12. utilisateurs et permissions ;
13. export Excel ;
14. journal des modifications ;
15. connecteur Zelty évolutif.
