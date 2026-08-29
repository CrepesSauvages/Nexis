import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { bootstrap } from '../src/index.js';

// Ce fichier vérifie exclusivement le mécanisme de proxy client documenté
// dans src/index.js : `ctx.client` pendant setup() ne peut être que
// mémorisé tel quel pour un usage différé — lire une propriété ou appeler
// une méthode dessus de façon synchrone pendant setup() ne fonctionne pas.
// Répertoire de fixtures dédié (pas tests/fixtures/plugins) pour ne pas
// changer la liste ['alpha', 'beta'] attendue par bootstrap.test.js.

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures', 'client-proxy-plugins');
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeClient extends EventEmitter {
  // Champ privé : y accéder avec un `this` qui n'est pas la vraie instance
  // (ex. le proxy client, non lié) lève un TypeError — exactement le genre
  // de piège qu'un vrai discord.js `Client` peut présenter en interne.
  #secret = 'real-client-secret';

  constructor() {
    super();
    this.guilds = { cache: new Map() };
    this.login = vi.fn().mockResolvedValue('ok');
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }

  /** @returns {string} */
  revealSecret() {
    return this.#secret;
  }
}

/** @returns {import('discord.js').Client} */
const fakeClient = () =>
  /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient()));

/**
 * @param {import('discord.js').Client} client
 * @param {string} event
 * @param {unknown} payload
 */
const emit = (client, event, payload) =>
  /** @type {import('node:events').EventEmitter} */ (client).emit(event, payload);

/**
 * Ajoute une fausse guild au cache — seul `id` est réellement utilisé par
 * le plugin fixture, le reste du type `Guild` n'a pas de sens en test.
 * @param {import('discord.js').Client} client
 * @param {string} id
 */
const addGuild = (client, id) => {
  const guild = /** @type {import('discord.js').Guild} */ (/** @type {unknown} */ ({ id }));
  client.guilds.cache.set(id, guild);
};

/** @type {string} */
let dir;
/** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
let app;

const boot = async () => {
  app = await bootstrap({
    env: {
      DISCORD_TOKEN: 'tok',
      DISCORD_CLIENT_ID: 'app1',
      LOG_LEVEL: 'error',
      STORAGE_DRIVER: 'json',
      STORAGE_PATH: join(dir, 'store.json'),
      PLUGINS_DIR: fixtures,
    },
    clientFactory: fakeClient,
    restFactory: () => ({ put: vi.fn().mockResolvedValue([]) }),
  });
  return app;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-boot-proxy-'));
});

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('ctx.client pendant setup() — le proxy client', () => {
  it("devrait résoudre le client réel pour un plugin qui l'a mémorisé en entier pendant setup()", async () => {
    const { client, guildConfig, storage } = await boot();
    addGuild(client, 'g1');
    await guildConfig.enable('g1', 'client-later');

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    // Si le plugin avait capturé le proxy vide au lieu du client réel,
    // cette valeur serait restée absente : ici elle prouve que la lecture
    // différée de `client.guilds` a bien atteint le vrai FakeClient.
    expect(await storage.get('plugin:client-later:guildsSeen')).toBe(1);
  });

  it('devrait exclure sans planter un plugin qui appelle une méthode de ctx.client pendant setup()', async () => {
    const logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { plugins, contexts } = await boot();
    // `mockRestore()` efface l'historique des appels : on lit `mock.calls`
    // avant de restaurer, pas après.
    const logged = logSpy.mock.calls.some(([line]) => String(line).includes('client-eager'));
    logSpy.mockRestore();

    expect(plugins.map((p) => p.name).sort()).toEqual(['client-later', 'client-later-method']);
    expect(contexts.get('client-eager')).toBeUndefined();
    expect(logged).toBe(true);
  });

  it("devrait lier (bind) une méthode du client mémorisé pendant setup() à l'instance réelle", async () => {
    // Preuve du correctif du proxy : sans `.bind(clientRef.current)` dans
    // le get trap, `this` vaudrait le proxy au moment de l'appel différé,
    // et `revealSecret()` planterait sur son champ privé (accessible
    // seulement depuis la vraie instance de FakeClient).
    const { client, guildConfig, storage } = await boot();
    addGuild(client, 'g1');
    await guildConfig.enable('g1', 'client-later-method');

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(await storage.get('plugin:client-later-method:secret')).toBe('real-client-secret');
  });
});
