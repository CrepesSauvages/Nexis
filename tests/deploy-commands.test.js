import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployCommands } from '../src/deploy-commands.js';

const here = dirname(fileURLToPath(import.meta.url));
const realPlugins = join(here, '..', 'plugins');

/** @type {string} */
let dir;
/** @type {ReturnType<typeof vi.fn>} */
let put;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-deploy-'));
  put = vi.fn().mockResolvedValue([]);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('deployCommands', () => {
  const run = () =>
    deployCommands({
      env: {
        DISCORD_TOKEN: 'tok',
        DISCORD_CLIENT_ID: 'app1',
        LOG_LEVEL: 'error',
        STORAGE_PATH: join(dir, 'store.json'),
        PLUGINS_DIR: realPlugins,
      },
      restFactory: () =>
        /** @type {{ put: (route: string, options: { body: unknown }) => Promise<unknown> }} */ ({
          put,
        }),
    });

  it('devrait pousser les commandes vers Discord', async () => {
    await run();
    expect(put).toHaveBeenCalledOnce();
  });

  it('devrait pousser la commande nexis', async () => {
    await run();
    const names = put.mock.calls[0][1].body.map(
      /** @param {{ name: string }} command */
      (command) => command.name,
    );
    expect(names).toContain('nexis');
  });

  it('devrait viser la route globale', async () => {
    await run();
    expect(put.mock.calls[0][0]).not.toContain('guilds');
  });
});
