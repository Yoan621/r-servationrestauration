// Traduit l'état d'une réservation Zelty en statut CRM.
//
// Codes Zelty observés (voir ZELTY_API.md) :
//   status 80                         : réservée, à venir
//   status 255 + arrived_at + closed_at : client venu, table clôturée
//   status 192 + cancel_reason == 0    : clôturée sans arrivée enregistrée (NE PAS en déduire « venu »)
//   status 192, sans arrived_at ni closed_at (cancel_reason 0) : annulée côté restaurant, sans code
//                                        (observé le 2026-11-05 sur la résa 4427630)
//   status 192 + cancel_reason != 0    : annulée (16 = « Annulée par le client »,
//                                        32 = annulation faite depuis la caisse ; autres codes possibles,
//                                        ex. no-show : on les traite comme annulation et on les journalise)
//
// Règle d'or : le CRM ne reçoit de Zelty que des changements « vers l'avant »
// (jamais de retour en arrière), et ne passe en 'terminee' (qui déclenche l'e-mail
// d'avis du lendemain) que si le client est réellement venu (arrived_at rempli).

const ORDRE = ['nouvelle', 'confirmee', 'arrivee', 'installee', 'commande_prise', 'terminee', 'a_nettoyer'];
const FINAUX = ['annulee', 'terminee', 'no_show', 'a_nettoyer'];

const rang = s => ORDRE.indexOf(s);

// zelty = { status, cancel_reason, arrived_at, closed_at }
// Renvoie { statut, annuleeZelty, raison } ; statut === null => ne rien changer.
function statutDepuisZelty(zelty, statutCrm) {
  const cancel = Number(zelty && zelty.cancel_reason) || 0;
  const sansPassage = !(zelty && (zelty.arrived_at || zelty.closed_at));
  // 192 sans code ni arrivée ni clôture = annulée (un 192 « clôturé sans arrivée » a un closed_at).
  const annuleeZelty = cancel !== 0 || (Number(zelty && zelty.status) === 192 && sansPassage);

  if (annuleeZelty) {
    // Une résa déjà terminée / no-show dans le CRM ne repasse pas en annulée.
    if (statutCrm === 'annulee' || FINAUX.includes(statutCrm)) {
      return { statut: null, annuleeZelty, raison: `annulée Zelty (code ${cancel || 'aucun'}), CRM déjà ${statutCrm}` };
    }
    return { statut: 'annulee', annuleeZelty, raison: `annulée côté Zelty (code ${cancel || 'aucun'})` };
  }

  const arrive = !!(zelty && zelty.arrived_at);
  const clos = !!(zelty && zelty.closed_at);

  if (arrive && clos) {
    if (rang(statutCrm) >= rang('terminee') || FINAUX.includes(statutCrm)) return { statut: null, annuleeZelty, raison: 'déjà terminée' };
    return { statut: 'terminee', annuleeZelty, raison: 'venue et clôturée côté Zelty' };
  }
  if (arrive) {
    if (rang(statutCrm) >= rang('arrivee') || FINAUX.includes(statutCrm)) return { statut: null, annuleeZelty, raison: 'arrivée déjà connue' };
    return { statut: 'arrivee', annuleeZelty, raison: 'arrivée enregistrée côté Zelty' };
  }
  if (clos) return { statut: null, annuleeZelty, raison: 'clôturée sans arrivée : ambigu, rien changé' };
  return { statut: null, annuleeZelty, raison: 'aucun changement' };
}

module.exports = { statutDepuisZelty, ORDRE, FINAUX };
