import { PermissionFlagsBits } from 'discord.js';
import { HttpError } from '../errors.js';
import { sendJson } from './request.js';
import { validateConfigValues } from '../config-schema.js';
import { SUPPORTED_LOCALES } from '../i18n/index.js';

/** Message humain associé à chaque refus de règle. */
const REFUSAL_MESSAGES = {
  not_found: 'Plugin introuvable',
  always_enabled: 'Ce plugin est interne : il est toujours actif',
  already_enabled: 'Ce plugin est déjà activé sur ce serveur',
  missing_deps: 'Ce plugin dépend de plugins qui ne sont pas activés',
  has_dependents: "D'autres plugins activés dépendent de celui-ci",
};

/**
 * Rend un refus de règle.
 *
 * Le routeur ne sait rendre qu'un `{ error }` à partir d'une HttpError : il ne
 * transporte aucun champ supplémentaire. Comme la réponse doit porter `reason`
 * et parfois `deps`, on écrit ici et on renvoie `undefined` — c'est
 * exactement le cas que le contrat du routeur prévoit.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ ok: false, reason: import('../plugin-admin.js').AdminRefusalReason, deps?: string[] }} result
 * @returns {undefined}
 */
const sendRefusal = (res, result) => {
  const status = result.reason === 'not_found' ? 404 : 409;
  sendJson(res, status, {
    error: REFUSAL_MESSAGES[result.reason],
    reason: result.reason,
    ...(result.deps ? { deps: result.deps } : {}),
  });
  return undefined;
};

/**
 * Teste la permission « Gérer le serveur » sur une chaîne de permissions
 * brute venue de Discord.
 *
 * `BigInt(...)` lève une `SyntaxError` sur tout ce qui n'est pas un entier
 * décimal — un serveur mal formé ne doit pas faire échouer `/api/core/guilds`
 * pour tous les autres : il est simplement écarté de la liste.
 *
 * @param {string} permissions
 * @returns {boolean}
 */
const canManageGuild = (permissions) => {
  try {
    return (
      (BigInt(permissions) & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild
    );
  } catch {
    return false;
  }
};

/**
 * @param {unknown} body
 * @returns {string} le nom de plugin porté par le corps
 */
const pluginNameFrom = (body) => {
  const { name } = /** @type {{ name?: unknown }} */ (body ?? {});
  if (typeof name !== 'string' || name.length === 0) {
    throw new HttpError(400, 'Champ `name` manquant ou vide');
  }
  return name;
};

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

      const result = await validateConfigValues({
        schema: plugin.manifest.config,
        values: /** @type {Record<string, unknown>} */ (values),
        guild,
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
];
