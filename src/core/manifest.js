import { PluginError } from './errors.js';

export const CONFIG_TYPES = ['string', 'number', 'boolean', 'channel', 'role', 'user', 'select'];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+/;

/**
 * @typedef {object} ConfigEntry
 * @property {string} type
 * @property {string} label
 * @property {boolean} [required]
 * @property {unknown} [default]
 * @property {string[]} [options] - requis si type === 'select'
 */

/**
 * @typedef {object} PluginManifest
 * @property {string} name
 * @property {string} version
 * @property {string} [description]
 * @property {string[]} [dependsOn]
 * @property {boolean} [allowDM]
 * @property {Record<string, ConfigEntry>} [config]
 */

/**
 * Valide un manifeste. Toute anomalie est une PluginError : le plugin
 * sera écarté, le bot démarrera quand même.
 * @param {PluginManifest | undefined} manifest
 * @param {string} source - chemin du plugin, pour situer l'erreur
 * @returns {void}
 */
export const validateManifest = (manifest, source) => {
  /**
   * @param {string} message
   * @param {Record<string, unknown>} [context]
   * @returns {never}
   */
  const fail = (message, context = {}) => {
    throw new PluginError(`${source} : ${message}`, { source, ...context });
  };

  if (!manifest || typeof manifest !== 'object') {
    fail('manifeste absent — le plugin doit exporter `manifest`');
    return;
  }
  if (typeof manifest.name !== 'string' || !manifest.name) {
    fail('champ `name` manquant');
  }
  if (!KEBAB.test(manifest.name)) {
    fail(`le nom "${manifest.name}" doit être en kebab-case (minuscules, chiffres, tirets)`);
  }
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    fail('champ `version` manquant ou non semver (attendu : "1.0.0")');
  }
  if (manifest.dependsOn !== undefined && !Array.isArray(manifest.dependsOn)) {
    fail('`dependsOn` doit être un tableau de noms de plugins');
  }
  if (manifest.allowDM !== undefined && typeof manifest.allowDM !== 'boolean') {
    fail('`allowDM` doit être un booléen');
  }

  for (const [key, entry] of Object.entries(manifest.config ?? {})) {
    if (!CONFIG_TYPES.includes(entry?.type)) {
      fail(
        `config."${key}" : type "${entry?.type}" inconnu (attendu : ${CONFIG_TYPES.join(', ')})`,
      );
    }
    if (typeof entry.label !== 'string' || !entry.label) {
      fail(`config."${key}" : champ \`label\` manquant — il sert au dashboard`);
    }
    if (entry.type === 'select' && !Array.isArray(entry.options)) {
      fail(`config."${key}" : un type select exige un tableau \`options\``);
    }
    if (entry.required === true && entry.default !== undefined) {
      fail(`config."${key}" : \`required\` et \`default\` sont contradictoires`);
    }
  }
};
