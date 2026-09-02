import { PermissionFlagsBits } from 'discord.js';
import { HttpError } from '../errors.js';

/**
 * Les endpoints d'administration du dashboard.
 *
 * Ils vivent sous `/api/core/`, un espace distinct de `/api/plugins/` que le
 * registre réserve aux routes déclarées par les plugins : aucune collision
 * n'est possible. Le serveur ciblé passe en `?guild=`, le seul paramètre que
 * `resolveAuth` sait lire — le routeur fait de la correspondance exacte et n'a
 * pas de paramètres de chemin.
 *
 * @param {object} options
 * @param {import('../loader.js').LoadedPlugin[]} options.plugins
 * @param {ReturnType<typeof import('../guild-config.js').createGuildConfig>} options.guildConfig
 * @param {ReturnType<typeof import('../plugin-admin.js').createPluginAdmin>} options.admin
 * @param {import('discord.js').Client} options.client
 * @param {string[]} options.alwaysEnabled
 * @returns {import('./router.js').HttpRoute[]}
 */
export const createCoreRoutes = ({ plugins, guildConfig, admin, client, alwaysEnabled }) => [
  {
    method: 'GET',
    path: '/api/core/guilds',
    // Seul endpoint sans serveur ciblé : comme /api/me, il se déclare public
    // et vérifie lui-même la session, faute d'un niveau « connecté, sans
    // serveur ciblé » parmi les quatre que le registre accepte.
    auth: 'public',
    handler: (_params, { session }) => {
      if (!session) throw new HttpError(401, 'Authentification requise');

      // `session.guilds` date du login. C'est le seul usage que la conception
      // lui autorise : peupler un sélecteur. L'autorisation réelle est
      // revérifiée auprès de Discord à chaque requête, donc un administrateur
      // rétrogradé voit peut-être un serveur de trop, mais reçoit un 403 dès
      // qu'il le touche.
      const manageGuild = PermissionFlagsBits.ManageGuild;
      return session.guilds
        .filter((guild) => client.guilds.cache.has(guild.id))
        .filter((guild) => (BigInt(guild.permissions) & manageGuild) === manageGuild)
        .map(({ id, name, icon }) => ({ id, name, icon }));
    },
  },

  {
    method: 'GET',
    path: '/api/core/plugins',
    auth: 'guild-admin',
    handler: async ({ guildId }) => {
      const id = /** @type {string} */ (guildId);
      const enabled = await guildConfig.enabledPlugins(id);

      // Tout en un seul appel : une interface a besoin de l'ensemble pour
      // dessiner ses formulaires, et un endpoint de détail par plugin serait
      // du travail pour personne.
      return Promise.all(
        plugins.map(async ({ name, manifest }) => ({
          name,
          version: manifest.version,
          description: manifest.description ?? null,
          dependsOn: manifest.dependsOn ?? [],
          alwaysEnabled: alwaysEnabled.includes(name),
          enabled: alwaysEnabled.includes(name) || enabled.includes(name),
          schema: manifest.config ?? {},
          config: await guildConfig.getConfig(id, name, manifest.config),
        })),
      );
    },
  },
];
