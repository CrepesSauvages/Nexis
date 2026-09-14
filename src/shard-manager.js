import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ShardingManager } from 'discord.js';
import { loadConfig } from './config.js';
import { createLogger } from './core/logger.js';
import { installProcessGuards } from './core/process-guards.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Lance le bot réparti sur plusieurs shards.
 *
 * Chaque shard est un process à part, exécutant `src/index.js` sur une
 * tranche des serveurs. Discord l'impose au-delà de 2 500 serveurs, et le
 * rend souhaitable bien avant : un seul process finit par passer son temps
 * à traiter la passerelle.
 *
 * Trois conséquences, toutes tenues par le core plutôt que par l'auteur du
 * déploiement :
 *
 * - le storage doit être partageable entre process (`postgres` ou
 *   `mongo`) ; `loadConfig` refuse les autres et c'est vérifié ici, avant
 *   de lancer quoi que ce soit, plutôt que dans chaque shard ;
 * - le dashboard ne démarre que sur le shard 0, sans quoi les autres se
 *   heurteraient au port déjà pris. Il interroge les autres shards au
 *   besoin, il n'est donc pas limité aux serveurs qu'il sert lui-même ;
 * - une écriture de configuration est annoncée à tous les shards, dont
 *   les caches sont indépendants.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {(file: string, options: object) => ShardingManager} [options.managerFactory]
 * @param {typeof installProcessGuards} [options.installGuards] - injectable pour que les tests ne posent pas d'écouteurs sur le vrai process
 * @returns {Promise<ShardingManager>}
 */
export const startShardManager = async ({
  env = process.env,
  managerFactory = (file, options) => new ShardingManager(file, options),
  installGuards = installProcessGuards,
} = {}) => {
  // Validé avec le drapeau que porteront les shards : le refus d'un driver
  // mono-process tombe ici, pas une fois les process lancés.
  const config = loadConfig({ ...env, SHARDING_MANAGER: 'true' });
  const logger = createLogger({ level: config.logLevel });

  const manager = managerFactory(join(here, 'index.js'), {
    token: config.token,
    // `auto` demande à Discord le nombre de shards qu'il recommande pour
    // cette application — la seule réponse qui reste juste quand le bot
    // grandit.
    totalShards: env.TOTAL_SHARDS === undefined ? 'auto' : Number(env.TOTAL_SHARDS),
    respawn: true,
  });

  manager.on('shardCreate', (shard) => {
    logger.info('Shard lancé', { shard: shard.id });
    shard.on('death', () => logger.error('Shard mort', { shard: shard.id }));
  });

  installGuards({
    logger,
    shutdown: async () => {
      // Les shards sont des process enfants : sans cela, un arrêt du
      // gestionnaire les laisserait orphelins et connectés.
      for (const shard of manager.shards.values()) shard.kill();
    },
  });

  await manager.spawn();
  logger.info('Tous les shards sont lancés', { shards: manager.shards.size });
  return manager;
};

// Ne lance les shards que si ce fichier est le point d'entrée du processus.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotenv();
  startShardManager().catch((error) => {
    console.error(`Lancement impossible : ${error.message}`);
    process.exit(1);
  });
}
