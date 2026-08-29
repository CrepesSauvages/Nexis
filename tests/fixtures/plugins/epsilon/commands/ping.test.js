// Prouve que le filtre `.test.js` d'applyConventions fonctionne réellement :
// sans lui, ce module casserait le chargement (export par défaut qui n'est
// pas une fabrique valide pour une commande).
export default 'not a factory';
