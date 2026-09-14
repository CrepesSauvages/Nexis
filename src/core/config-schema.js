/** Un identifiant Discord : 17 à 20 chiffres. */
const SNOWFLAKE = /^\d{17,20}$/;

const GUILD_REFERENCES = ['channel', 'role', 'user'];

/**
 * @typedef {{ key: string, reason: string }} FieldError
 */

/**
 * @typedef {{ ok: true, values: Record<string, unknown> } | { ok: false, fields: FieldError[] }} ValidationResult
 */

/**
 * @param {unknown} value
 * @param {import('./manifest.js').ConfigEntry} entry
 * @returns {string | undefined} motif de rejet, ou undefined si la valeur convient
 */
const checkType = (value, entry) => {
  if (entry.type === 'string') return typeof value === 'string' ? undefined : 'wrong_type';
  if (entry.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? undefined : 'wrong_type';
  }
  if (entry.type === 'boolean') return typeof value === 'boolean' ? undefined : 'wrong_type';
  if (entry.type === 'select') {
    if (typeof value !== 'string') return 'wrong_type';
    return (entry.options ?? []).includes(value) ? undefined : 'not_in_options';
  }
  if (GUILD_REFERENCES.includes(entry.type)) {
    // channel, role, user : un identifiant Discord avant toute chose.
    return typeof value === 'string' && SNOWFLAKE.test(value) ? undefined : 'wrong_type';
  }
  return 'wrong_type';
};

/**
 * Valide des valeurs de configuration contre le schéma d'un manifeste.
 *
 * Tous les champs sont contrôlés avant que la fonction rende la main, et
 * toutes les erreurs reviennent ensemble : une interface peut marquer d'un
 * coup chaque champ fautif, au lieu de les découvrir un aller-retour à la
 * fois. Un seul champ invalide suffit à ne rien faire écrire à l'appelant.
 *
 * @param {object} options
 * @param {Record<string, import('./manifest.js').ConfigEntry> | undefined} options.schema
 * @param {Record<string, unknown>} options.values
 * @param {(type: 'channel' | 'role' | 'user', id: string) => Promise<boolean>} options.exists - le référencé existe-t-il dans ce serveur ? Injecté plutôt que déduit d'un objet `Guild` : sur un bot réparti en shards, le serveur visé n'est pas forcément servi par ce process.
 * @param {Record<string, unknown>} [options.current] - configuration en vigueur, défauts déjà fusionnés
 * @returns {Promise<ValidationResult>}
 */
export const validateConfigValues = async ({ schema, values, exists, current = {} }) => {
  /** @type {FieldError[]} */
  const fields = [];

  for (const [key, value] of Object.entries(values)) {
    // `schema?.[key]` teste un accès, pas une appartenance : sur une clé
    // héritée du prototype (`__proto__`, `constructor`, `toString`…), l'accès
    // renvoie une valeur truthy alors que la clé n'existe pas dans le
    // manifeste. `Object.hasOwn` tranche sur l'appartenance réelle.
    if (!Object.hasOwn(schema ?? {}, key)) {
      fields.push({ key, reason: 'unknown_key' });
      continue;
    }
    const entry = /** @type {Record<string, import('./manifest.js').ConfigEntry>} */ (schema)[key];

    const typeError = checkType(value, entry);
    if (typeError) {
      fields.push({ key, reason: typeError });
      continue;
    }

    if (
      GUILD_REFERENCES.includes(entry.type) &&
      !(await exists(
        /** @type {'channel' | 'role' | 'user'} */ (entry.type),
        /** @type {string} */ (value),
      ))
    ) {
      fields.push({ key, reason: 'not_found_in_guild' });
    }
  }

  // Champs obligatoires, contrôlés sur la valeur fusionnée : la requête est
  // une fusion partielle, un champ absent du corps garde sa valeur actuelle.
  // `false` et `0` sont des valeurs légitimes — seuls `undefined`, `null` et
  // la chaîne vide manquent réellement.
  const failed = new Set(fields.map((field) => field.key));
  for (const [key, entry] of Object.entries(schema ?? {})) {
    if (!entry.required || failed.has(key)) continue;
    const value = Object.hasOwn(values, key) ? values[key] : current[key];
    if (value === undefined || value === null || value === '') {
      fields.push({ key, reason: 'missing_required' });
    }
  }

  return fields.length > 0 ? { ok: false, fields } : { ok: true, values };
};
