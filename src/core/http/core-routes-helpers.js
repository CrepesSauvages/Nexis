import { PermissionFlagsBits } from 'discord.js';
import { HttpError } from '../errors.js';
import { sendJson } from './request.js';
import { translator } from '../i18n/index.js';

/** Message humain associé à chaque refus de règle. */
export const REFUSAL_MESSAGES = {
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
export const sendRefusal = (res, result) => {
  const status = result.reason === 'not_found' ? 404 : 409;
  sendJson(res, status, {
    error: REFUSAL_MESSAGES[result.reason],
    reason: result.reason,
    ...(result.deps ? { deps: result.deps } : {}),
  });
  return undefined;
};

/** Message humain associé à chaque refus des règles de permission. */
export const PERMS_REFUSAL_MESSAGES = {
  unknown_command: 'Commande inconnue',
  owner_command:
    'Cette commande est réservée au propriétaire du bot : ses permissions ne se délèguent pas',
  no_override: "Cette commande n'a pas de liste de rôles sur ce serveur",
  already_listed: 'Ce rôle est déjà autorisé pour cette commande',
  not_listed: "Ce rôle n'est pas dans la liste de cette commande",
};

/** Message humain associé à chaque rejet de `checkRoles`. */
export const ROLE_ERRORS = {
  not_an_array: 'Champ `roles` : un tableau d’identifiants de rôles, ou null, est attendu',
  not_a_snowflake: 'Identifiant de rôle invalide',
  unknown_role: "Ce rôle n'existe pas sur ce serveur",
};

/**
 * Rend un refus des règles de permission, avec le même contrat que
 * `sendRefusal` : la réponse porte `reason`, que le routeur ne sait pas
 * transporter depuis une HttpError.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {{ ok: false, reason: import('../command-perms.js').PermsRefusalReason }} result
 * @returns {undefined}
 */
export const sendPermsRefusal = (res, result) => {
  const status =
    result.reason === 'unknown_command' ? 404 : result.reason === 'owner_command' ? 403 : 409;
  sendJson(res, status, { error: PERMS_REFUSAL_MESSAGES[result.reason], reason: result.reason });
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
export const canManageGuild = (permissions) => {
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
export const pluginNameFrom = (body) => {
  const { name } = /** @type {{ name?: unknown }} */ (body ?? {});
  if (typeof name !== 'string' || name.length === 0) {
    throw new HttpError(400, 'Champ `name` manquant ou vide');
  }
  return name;
};

/**
 * Traduit un texte de manifeste s'il correspond à une clé de traduction du
 * plugin, sinon le rend tel quel.
 *
 * Les traductions des plugins sont déjà chargées et préfixées par
 * `registerPluginLocales` au démarrage : rien à charger ici.
 *
 * @param {string} locale
 * @param {string} plugin
 * @param {string} text
 * @returns {string}
 */
export const localizeText = (locale, plugin, text) => {
  const key = `${plugin}.${text}`;
  return translator.has(locale, key) ? translator.t(locale, key) : text;
};

/**
 * Copie un schéma de configuration en traduisant chaque `label`.
 *
 * Une copie, jamais une mutation : `manifest.config` est partagé par tous les
 * serveurs. Les `options` d'un `select` ne sont pas traduites — ce sont les
 * valeurs acceptées par la validation, les traduire ferait échouer
 * l'enregistrement.
 *
 * @param {string} locale
 * @param {string} plugin
 * @param {Record<string, import('../manifest.js').ConfigEntry> | undefined} schema
 * @returns {Record<string, import('../manifest.js').ConfigEntry>}
 */
export const localizeSchema = (locale, plugin, schema) =>
  Object.fromEntries(
    Object.entries(schema ?? {}).map(([key, entry]) => [
      key,
      { ...entry, label: localizeText(locale, plugin, entry.label) },
    ]),
  );

/**
 * Position d'un salon dans la liste du serveur. Un `ThreadChannel` n'a pas de
 * `rawPosition` — le test d'appartenance restreint le type pour TypeScript
 * autant qu'il évite un `NaN` à l'exécution.
 *
 * @param {import('discord.js').GuildBasedChannel} channel
 * @returns {number}
 */
export const positionOf = (channel) => ('rawPosition' in channel ? channel.rawPosition : 0);

/** Défaut et plafond de `?limit=` pour GET /api/core/errors. */
export const DEFAULT_ERROR_LOG_LIMIT = 50;
export const MAX_ERROR_LOG_LIMIT = 200;

/**
 * Interprète `?limit=` pour GET /api/core/errors. Le buffer local va jusqu'à
 * 500 entrées avec leur stack : les renvoyer toutes serait une réponse
 * absurde par défaut, d'où un plafond distinct de la limite du buffer.
 * Une valeur absente, non numérique ou négative retombe sur le défaut :
 * ce paramètre de confort ne doit jamais faire échouer une simple
 * consultation.
 *
 * @param {string | undefined} raw
 * @returns {number}
 */
export const parseErrorLogLimit = (raw) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_ERROR_LOG_LIMIT;
  return Math.min(Math.trunc(value), MAX_ERROR_LOG_LIMIT);
};
