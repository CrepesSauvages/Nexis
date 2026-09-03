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
