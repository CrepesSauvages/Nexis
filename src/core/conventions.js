import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `guild-member-add` → `guildMemberAdd`
 * @param {string} name
 * @returns {string}
 */
const toCamelCase = (name) =>
  name.replace(/-([a-z])/g, (/** @type {string} */ _match, /** @type {string} */ letter) =>
    letter.toUpperCase(),
  );

/**
 * Liste les modules JavaScript d'un sous-dossier, tests exclus.
 * Un dossier absent n'est pas une erreur : la convention est optionnelle.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
const listModules = async (dir) => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .filter((entry) => !entry.name.endsWith('.test.js'))
      .map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

/**
 * Enregistre automatiquement ce qu'un plugin range dans commands/,
 * events/ et jobs/. C'est du sucre au-dessus de setup(), pas un
 * remplacement : les deux voies coexistent sur un même plugin.
 *
 * Un module mal formé est signalé et ignoré — la convention ne doit pas
 * être plus fragile que la voie explicite.
 *
 * @param {object} options
 * @param {import('./loader.js').LoadedPlugin} options.plugin
 * @param {import('./context.js').PluginContext} options.ctx
 * @param {import('./logger.js').Logger} options.logger
 * @returns {Promise<number>} nombre d'éléments enregistrés
 */
export const applyConventions = async ({ plugin, ctx, logger }) => {
  let registered = 0;

  /**
   * Importe un module de convention et appelle sa fabrique avec le
   * contexte. Retourne undefined si le module est mal formé — un plugin
   * dont un fichier est cassé garde ses autres déclarations.
   * @param {string} dir
   * @param {string} file
   * @returns {Promise<unknown>}
   */
  const build = async (dir, file) => {
    const module = /** @type {{ default?: unknown }} */ (
      await import(pathToFileURL(join(dir, file)).href)
    );

    if (module.default === undefined) {
      logger.warn(`Module ignoré, export par défaut manquant : ${plugin.name}/${file}`, {
        plugin: plugin.name,
        file,
      });
      return undefined;
    }
    if (typeof module.default !== 'function') {
      logger.warn(
        `Module ignoré, l'export par défaut doit être une fabrique (ctx) => ... : ${plugin.name}/${file}`,
        { plugin: plugin.name, file },
      );
      return undefined;
    }

    return /** @type {(ctx: import('./context.js').PluginContext) => unknown} */ (module.default)(
      ctx,
    );
  };

  const commandsDir = join(plugin.dir, 'commands');
  for (const file of await listModules(commandsDir)) {
    const command = await build(commandsDir, file);
    if (!command) continue;
    ctx.registerCommand(/** @type {import('./registry/commands.js').CommandDef} */ (command));
    registered += 1;
  }

  const eventsDir = join(plugin.dir, 'events');
  for (const file of await listModules(eventsDir)) {
    const handler = await build(eventsDir, file);
    if (!handler) continue;
    ctx.registerEvent(toCamelCase(file.replace(/\.js$/, '')), /** @type {Function} */ (handler));
    registered += 1;
  }

  const jobsDir = join(plugin.dir, 'jobs');
  for (const file of await listModules(jobsDir)) {
    const job = /** @type {{ cron: string, handler: Function } | undefined} */ (
      await build(jobsDir, file)
    );
    if (!job) continue;
    ctx.registerJob(job.cron, job.handler);
    registered += 1;
  }

  return registered;
};
