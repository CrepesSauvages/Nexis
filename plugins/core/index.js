export const manifest = {
  name: 'core',
  version: '1.0.0',
  description: 'Administration de Nexis. Toujours actif, non désactivable.',
};

/**
 * La commande `/nexis` est chargée automatiquement via la convention
 * (fichier `commands/nexis.js` exporte une fabrique).
 * @param {import('../../src/core/context.js').PluginContext} _ctx
 */
export const setup = (_ctx) => {
  // La convention gère l'enregistrement de la commande
};
