import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Lit les fichiers de locale d'un plugin (`<pluginDir>/i18n/<locale>.json`).
 * Dossier absent = pas d'erreur, la convention est optionnelle — même
 * tolérance que `commands/`/`events/`/`jobs/` (voir conventions.js).
 * @param {string} pluginDir
 * @returns {Promise<Record<string, Record<string, string>>>}
 */
export const loadPluginLocales = async (pluginDir) => {
  const i18nDir = join(pluginDir, 'i18n');

  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = await readdir(i18nDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  /** @type {Record<string, Record<string, string>>} */
  const locales = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const locale = entry.name.slice(0, -'.json'.length);
    const content = await readFile(join(i18nDir, entry.name), 'utf8');
    locales[locale] = /** @type {Record<string, string>} */ (JSON.parse(content));
  }
  return locales;
};
