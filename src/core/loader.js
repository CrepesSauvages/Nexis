import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { DependencyError, PluginError } from './errors.js';
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

  const order = resolveOrderDroppingMissing(loaded, logger);
  return order
    .map((name) => loaded.find((plugin) => plugin.name === name))
    .filter((plugin) => plugin !== undefined);
};

/**
 * Résout l'ordre topologique de `loaded`, en écartant en cascade les
 * plugins dont une dépendance déclarée a elle-même été écartée plus tôt
 * (manifeste invalide, `setup` manquant, échec d'import). Ce n'est pas un
 * bug de code : la dépendance a légitimement disparu de la liste, donc le
 * plugin qui comptait dessus ne peut pas non plus démarrer.
 *
 * Un cycle de dépendances, en revanche, est une vraie erreur d'auteur
 * entre plugins qui ont tous chargé et validé correctement : il reste
 * fatal et propage la `DependencyError` telle quelle.
 *
 * @param {LoadedPlugin[]} loaded - muté : les plugins écartés en cascade sont retirés
 * @param {import('./logger.js').Logger} logger
 * @returns {string[]}
 */
const resolveOrderDroppingMissing = (loaded, logger) => {
  for (;;) {
    try {
      return resolveOrder(loaded.map((plugin) => plugin.manifest));
    } catch (error) {
      if (!(error instanceof DependencyError) || error.context.missing === undefined) {
        throw error;
      }
      const dependent = /** @type {string} */ (error.context.plugin);
      const missing = /** @type {string} */ (error.context.missing);
      const index = loaded.findIndex((plugin) => plugin.name === dependent);
      if (index === -1) throw error;
      loaded.splice(index, 1);
      logger.warn(`Plugin écarté : ${dependent}`, {
        reason: `dépend de "${missing}", introuvable parmi les plugins chargés`,
      });
    }
  }
};
