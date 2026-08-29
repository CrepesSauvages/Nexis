import { config as loadDotenv } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { bootstrap } from './index.js';

/**
 * Pousse vers Discord les commandes globales — celles du plugin interne.
 * Les commandes des autres plugins sont poussées par serveur, au moment
 * de leur activation, et n'ont donc rien à faire ici.
 *
 * À relancer après toute modification de la commande /nexis.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(token: string) => { put: (route: string, options: { body: unknown }) => Promise<unknown> }} [options.restFactory]
 * @returns {Promise<void>}
 */
export const deployCommands = async ({ env = process.env, restFactory } = {}) => {
  const app = await bootstrap({
    env,
    /**
     * Faux client qui ne se connecte pas réellement à Discord.
     * @param {object} _opts
     * @returns {import('discord.js').Client}
     */
    clientFactory: (_opts) =>
      /** @type {import('discord.js').Client} */ (
        /** @type {unknown} */ ({
          on: () => {},
          guilds: { cache: new Map() },
          destroy: async () => {},
        })
      ),
    ...(restFactory ? { restFactory } : {}),
  });

  await app.commandSync.syncGlobal();
  await app.shutdown();
};

// Ne déploie les commandes que si ce fichier est le point d'entrée du processus.
// `pathToFileURL` gère correctement les caractères spéciaux (#, ?) d'un
// chemin, contrairement à une concaténation manuelle en `file://${...}`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotenv();
  deployCommands().catch((error) => {
    console.error(`Déploiement impossible : ${error.message}`);
    process.exit(1);
  });
}
