import { describe, it, expect, vi } from 'vitest';
import buildHandler from '../../../../plugins/core/events/guild-create.js';

/**
 * @param {string[]} enabled
 */
const makeCtx = (enabled) => {
  const syncGuild = vi.fn().mockResolvedValue(undefined);
  const ctx = /** @type {import('../../../../src/core/context.js').PluginContext} */ (
    /** @type {unknown} */ ({
      logger: { info: vi.fn() },
      core: {
        guildConfig: { enabledPlugins: vi.fn().mockResolvedValue(enabled) },
        commandSync: { syncGuild },
      },
    })
  );
  return { ctx, syncGuild };
};

const guild = /** @type {import('discord.js').Guild} */ (/** @type {unknown} */ ({ id: 'g1' }));

describe('plugin core — guildCreate', () => {
  it('devrait resynchroniser les commandes des plugins déjà activés', async () => {
    const { ctx, syncGuild } = makeCtx(['welcome', 'moderation']);

    await buildHandler(ctx)(guild);

    expect(syncGuild).toHaveBeenCalledWith('g1');
  });

  it('ne devrait rien synchroniser sur un serveur sans plugin activé', async () => {
    const { ctx, syncGuild } = makeCtx([]);

    await buildHandler(ctx)(guild);

    expect(syncGuild).not.toHaveBeenCalled();
  });
});
