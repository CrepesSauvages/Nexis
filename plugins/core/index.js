import { buildNexisCommand } from './commands/nexis.js';

export const manifest = {
  name: 'core',
  version: '1.0.0',
  description: 'Administration de Nexis. Toujours actif, non désactivable.',
};

/**
 * Le seul plugin recevant `ctx.core` — il pilote l'activation des autres.
 * @param {import('../../src/core/context.js').PluginContext} ctx
 */
export const setup = (ctx) => {
  const core =
    /** @type {{ plugins: import('../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> }, alwaysEnabled: string[], ownerId: string | undefined, errorReporting: { getRecent: (count?: number) => Promise<import('../../src/core/reporting/driver.js').ReportEntry[]> }, t: (locale: string, key: string, params?: Record<string, string | number>) => string, resolveLocale: (interaction: { locale?: string, guildId?: string | null }) => Promise<string> }} */ ({
      ...ctx.core,
      t: ctx.t,
      resolveLocale: ctx.resolveLocale,
    });
  const command = /** @type {import('../../src/core/registry/commands.js').CommandDef} */ (
    buildNexisCommand(core)
  );
  ctx.registerCommand(command);
};
