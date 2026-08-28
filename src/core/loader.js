import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { PluginError } from './errors.js';
import { validateManifest } from './manifest.js';
import { resolveOrder } from './resolver.js';

/**
 * @typedef {object} LoadedPlugin
 * @property {string} name
 * @property {import('./manifest.js').PluginManifest} manifest
 * @property {(ctx: unknown) => void | Promise<void>} setup
 * @property {string} dir
 */

/**
 * Scanne un répertoire de plugins, importe et valide chacun.
 * Un plugin cassé est écarté avec un avertissement — un seul plugin
 * défectueux ne doit pas empêcher le bot de démarrer.
 *
 * @param {{ dir: string, logger: import('./logger.js').Logger }} options
 * @returns {Promise<LoadedPlugin[]>} dans l'ordre topologique
 */
export const loadPlugins = async ({ dir, logger }) => {
  const root = resolve(dir);

  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      /** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT'
    ) {
      throw error;
    }
    logger.warn('Répertoire de plugins introuvable', { dir: root });
    return [];
  }

  /** @type {LoadedPlugin[]} */
  const loaded = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginDir = join(root, entry.name);

    try {
      const module = await import(pathToFileURL(join(pluginDir, 'index.js')).href);
      validateManifest(module.manifest, `plugins/${entry.name}`);
      if (typeof module.setup !== 'function') {
        throw new PluginError(`plugins/${entry.name} : export \`setup\` manquant`, {
          source: pluginDir,
        });
      }
      if (loaded.some((plugin) => plugin.name === module.manifest.name)) {
        throw new PluginError(`plugins/${entry.name} : nom "${module.manifest.name}" déjà pris`, {
          source: pluginDir,
        });
      }
      loaded.push({
        name: module.manifest.name,
        manifest: module.manifest,
        setup: module.setup,
        dir: pluginDir,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`Plugin écarté : ${entry.name}`, { reason, dir: pluginDir });
    }
  }

  const order = resolveOrder(loaded.map((plugin) => plugin.manifest));
  return order
    .map((name) => loaded.find((plugin) => plugin.name === name))
    .filter((plugin) => plugin !== undefined);
};
