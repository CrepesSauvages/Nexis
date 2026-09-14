import { describe, it, expect, vi } from 'vitest';
import { GUILD_CONFIG_CHANGED, announceGuildConfigChange } from '../../src/core/shard-bus.js';

describe('announceGuildConfigChange', () => {
  it('ne devrait rien faire sans sharding', async () => {
    const client = /** @type {import('discord.js').Client} */ (/** @type {unknown} */ ({}));
    await expect(announceGuildConfigChange(client, 'g1')).resolves.toBeUndefined();
  });

  it('ne devrait rien faire sans client', async () => {
    await expect(announceGuildConfigChange(null, 'g1')).resolves.toBeUndefined();
  });

  it("devrait émettre l'event sur chaque shard, serveur compris", async () => {
    /** @type {Array<{ event: string, id: string }>} */
    const emitted = [];
    const shards = [0, 1, 2].map(() => ({
      emit: (/** @type {string} */ event, /** @type {string} */ id) => emitted.push({ event, id }),
    }));
    const client = /** @type {import('discord.js').Client} */ (
      /** @type {unknown} */ ({
        shard: {
          // La fonction est réellement exécutée contre chaque client
          // simulé : c'est ce qui prouve qu'elle ne capture rien.
          broadcastEval: vi.fn(async (/** @type {Function} */ fn, /** @type {any} */ options) =>
            shards.map((remote) => fn(remote, options?.context)),
          ),
        },
      })
    );

    await announceGuildConfigChange(client, 'g1');

    expect(emitted).toEqual([
      { event: GUILD_CONFIG_CHANGED, id: 'g1' },
      { event: GUILD_CONFIG_CHANGED, id: 'g1' },
      { event: GUILD_CONFIG_CHANGED, id: 'g1' },
    ]);
  });
});
