import { createServer } from 'node:http';

/**
 * Cycle de vie du serveur HTTP.
 *
 * Le listener d'erreur est indispensable : sans lui, node:http ré-émet
 * toute erreur du serveur en exception non capturée, ce qui tuerait le
 * bot pour un simple port déjà occupé.
 *
 * @param {object} options
 * @param {import('node:http').RequestListener} options.router
 * @param {string} options.host
 * @param {number} options.port
 * @param {import('../logger.js').Logger} options.logger
 */
export const createHttpServer = ({ router, host, port, logger }) => {
  const server = createServer(router);

  server.on('error', (error) => {
    logger.warn(`Serveur HTTP en erreur : ${error.message}`, {
      code: /** @type {NodeJS.ErrnoException} */ (error).code,
    });
  });

  return {
    /**
     * @returns {Promise<boolean>} vrai si le serveur écoute effectivement
     */
    listen() {
      return new Promise((resolve) => {
        server.once('error', () => resolve(false));
        server.listen(port, host, () => resolve(true));
      });
    },

    /**
     * `closeAllConnections` est nécessaire avant `close` : les connexions
     * keep-alive laissées ouvertes par un client feraient sinon attendre
     * la fermeture jusqu'à leur expiration.
     * @returns {Promise<void>}
     */
    close() {
      return new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.closeAllConnections();
        server.close(() => resolve());
      });
    },

    /**
     * @returns {number | undefined} port réellement attribué
     */
    port() {
      const address = server.address();
      return address !== null && typeof address === 'object' ? address.port : undefined;
    },
  };
};
