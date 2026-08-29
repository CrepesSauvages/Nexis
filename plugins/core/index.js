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
    /** @type {{ plugins: import('../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof import('../../src/core/guild-config.js').createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> }, alwaysEnabled: string[] }} */ (
      ctx.core
    );
  const command = /** @type {import('../../src/core/registry/commands.js').CommandDef} */ (
    buildNexisCommand(core)
  );
  ctx.registerCommand(command);
};
