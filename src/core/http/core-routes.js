import { HttpError } from '../errors.js';
import { sendJson } from './request.js';
import { validateConfigValues } from '../config-schema.js';
import { SUPPORTED_LOCALES } from '../i18n/index.js';
import { checkRoles } from '../command-perms.js';
import {
  ROLE_ERRORS,
  canManageGuild,
  localizeSchema,
  localizeText,
  parseErrorLogLimit,
  pluginNameFrom,
  positionOf,
  sendPermsRefusal,
  sendRefusal,
} from './core-routes-helpers.js';

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
 * @param {ReturnType<typeof import('../command-perms.js').createCommandPerms>} options.perms
 * @param {import('discord.js').Client} options.client
 * @param {string[]} options.alwaysEnabled
 * @param {{ getRecent: (count?: number) => Promise<import('../reporting/driver.js').ReportEntry[]>, clear: () => Promise<void> }} options.errorReporting
 * @returns {import('./router.js').HttpRoute[]}
 */
export const createCoreRoutes = ({
  plugins,
  guildConfig,
  admin,
  perms,
  client,
  alwaysEnabled,
  errorReporting,
}) => [
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
      return session.guilds
        .filter((guild) => client.guilds.cache.has(guild.id))
        .filter((guild) => canManageGuild(guild.permissions))
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
      const locale = (await guildConfig.getLocale(id)) ?? 'fr';

      // Tout en un seul appel : une interface a besoin de l'ensemble pour
      // dessiner ses formulaires, et un endpoint de détail par plugin serait
      // du travail pour personne.
      return Promise.all(
        plugins.map(async ({ name, manifest }) => ({
          name,
          version: manifest.version,
          description: manifest.description
            ? localizeText(locale, name, manifest.description)
            : null,
          dependsOn: manifest.dependsOn ?? [],
          alwaysEnabled: alwaysEnabled.includes(name),
          enabled: alwaysEnabled.includes(name) || enabled.includes(name),
          schema: localizeSchema(locale, name, manifest.config),
          config: await guildConfig.getConfig(id, name, manifest.config),
        })),
      );
    },
  },

  {
    method: 'GET',
    path: '/api/core/guild-resources',
    auth: 'guild-admin',
    handler: ({ guildId }) => {
      const guild = client.guilds.cache.get(/** @type {string} */ (guildId));
      if (!guild) throw new HttpError(404, "Le bot n'est pas présent sur ce serveur");

      // Tout est déjà en cache : aucun appel réseau à Discord. Les salons ne
      // sont pas filtrés par type — `validateConfigValues` accepte n'importe
      // quel identifiant présent dans `channels.cache`, la liste rendue doit
      // donc couvrir exactement le même ensemble.
      const channels = [...guild.channels.cache.values()]
        // Un fil n'a pas de `rawPosition` : il compte pour 0.
        .sort((a, b) => positionOf(a) - positionOf(b))
        .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type }));

      // Hiérarchie Discord : le rôle le plus haut d'abord.
      const roles = [...guild.roles.cache.values()]
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }));

      return { channels, roles };
    },
  },

  {
    method: 'POST',
    path: '/api/core/plugins/enable',
    auth: 'guild-admin',
    handler: async ({ guildId, body }, { res }) => {
      const result = await admin.enable(/** @type {string} */ (guildId), pluginNameFrom(body));
      return result.ok ? { ok: true } : sendRefusal(res, result);
    },
  },

  {
    method: 'POST',
    path: '/api/core/plugins/disable',
    auth: 'guild-admin',
    handler: async ({ guildId, body }, { res }) => {
      const result = await admin.disable(/** @type {string} */ (guildId), pluginNameFrom(body));
      return result.ok ? { ok: true } : sendRefusal(res, result);
    },
  },

  {
    method: 'PATCH',
    path: '/api/core/config',
    auth: 'guild-admin',
    handler: async ({ guildId, body }, { res }) => {
      const name = pluginNameFrom(body);
      const { values } = /** @type {{ values?: unknown }} */ (body ?? {});
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        throw new HttpError(400, 'Champ `values` manquant ou invalide');
      }

      const plugin = plugins.find((entry) => entry.name === name);
      if (!plugin) throw new HttpError(404, 'Plugin introuvable');

      const id = /** @type {string} */ (guildId);
      const guild = client.guilds.cache.get(id);
      if (!guild) throw new HttpError(404, "Le bot n'est pas présent sur ce serveur");

      // La validation des champs obligatoires raisonne sur le résultat de la
      // fusion, pas sur le corps seul : un champ déjà stocké et non mentionné
      // reste renseigné.
      const current = await guildConfig.getConfig(id, name, plugin.manifest.config);
      const result = await validateConfigValues({
        schema: plugin.manifest.config,
        values: /** @type {Record<string, unknown>} */ (values),
        guild,
        current,
      });
      if (!result.ok) {
        sendJson(res, 400, {
          error: 'Valeurs de configuration invalides',
          fields: result.fields,
        });
        return undefined;
      }

      // Fusion partielle : `setConfig` conserve ce que la requête ne mentionne
      // pas. La validation ayant tout contrôlé avant d'arriver ici, l'écriture
      // est soit complète, soit inexistante.
      await guildConfig.setConfig(id, name, result.values);
      return { ok: true, config: await guildConfig.getConfig(id, name, plugin.manifest.config) };
    },
  },

  {
    method: 'GET',
    path: '/api/core/locale',
    auth: 'guild-admin',
    handler: async ({ guildId }) => {
      // `null`, pas `undefined` : la sérialisation JSON supprimerait une clé
      // à `undefined`, et l'appelant ne pourrait plus distinguer « aucune
      // langue choisie » d'un champ manquant.
      const locale = await guildConfig.getLocale(/** @type {string} */ (guildId));
      return { locale: locale ?? null };
    },
  },

  {
    method: 'PUT',
    path: '/api/core/locale',
    auth: 'guild-admin',
    handler: async ({ guildId, body }, { res }) => {
      const { locale } = /** @type {{ locale?: unknown }} */ (body ?? {});
      if (typeof locale !== 'string' || !SUPPORTED_LOCALES.includes(locale)) {
        sendJson(res, 400, {
          error: `Langue non supportée. Attendu : ${SUPPORTED_LOCALES.join(', ')}`,
          reason: 'unknown_locale',
        });
        return undefined;
      }
      await guildConfig.setLocale(/** @type {string} */ (guildId), locale);
      return { ok: true, locale };
    },
  },

  {
    method: 'GET',
    path: '/api/core/permissions',
    auth: 'guild-admin',
    handler: async ({ guildId }) => ({
      commands: await perms.list(/** @type {string} */ (guildId)),
    }),
  },

  {
    method: 'PUT',
    path: '/api/core/permissions',
    auth: 'guild-admin',
    handler: async ({ guildId, body }, { res }) => {
      const { command, roles } = /** @type {{ command?: unknown, roles?: unknown }} */ (body ?? {});
      if (typeof command !== 'string' || command.length === 0) {
        throw new HttpError(400, 'Champ `command` manquant ou vide');
      }

      const id = /** @type {string} */ (guildId);

      // `null` rend la commande à son niveau déclaré ; un tableau remplace
      // la liste entière. La nuance compte : une liste vide ne « retire pas
      // la règle », elle réserve la commande aux administrateurs.
      if (roles !== null) {
        const guild = client.guilds.cache.get(id);
        if (!guild) throw new HttpError(404, "Le bot n'est pas présent sur ce serveur");

        const invalid = checkRoles(roles, (roleId) => guild.roles.cache.has(roleId));
        if (invalid) {
          sendJson(res, 400, { error: ROLE_ERRORS[invalid], reason: invalid });
          return undefined;
        }
      }

      const result = await perms.set(
        id,
        command,
        roles === null ? undefined : /** @type {string[]} */ (roles),
      );
      return result.ok
        ? { ok: true, command, roles: result.roles ?? null }
        : sendPermsRefusal(res, result);
    },
  },

  {
    method: 'GET',
    path: '/api/core/errors',
    // Comme /api/core/guilds, sans serveur ciblé : réservé au propriétaire
    // du bot, pas à un administrateur de serveur.
    auth: 'owner',
    handler: async ({ query }) => {
      const entries = await errorReporting.getRecent(parseErrorLogLimit(query.limit));
      // `level` (toujours 'error') n'apporte rien à l'interface : on ne
      // renvoie que ce que le brief décrit.
      return {
        entries: entries.map(({ id, timestamp, message, context }) => ({
          id,
          timestamp,
          message,
          context,
        })),
      };
    },
  },

  {
    method: 'DELETE',
    path: '/api/core/errors',
    auth: 'owner',
    handler: async () => {
      // Passe par la file de reporting/drivers/local.js : un clear() qui
      // écrirait directement pourrait s'entrelacer avec un report() en vol
      // et laisser réapparaître une entrée qu'on croyait purgée.
      await errorReporting.clear();
      return { ok: true };
    },
  },
];
