import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { bootstrap } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures', 'plugins');
// Répertoire dédié, séparé de `fixtures` : `throws-in-setup` a un manifeste
// valide et serait donc chargé par loader.test.js et par les assertions
// exactes ['alpha', 'beta'] de ce fichier s'il vivait dans `fixtures`.
const setupThrowsFixtures = join(here, 'fixtures', 'plugins-setup-throws');
const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.guilds = { cache: new Map() };
    this.login = vi.fn().mockResolvedValue('ok');
    this.destroy = vi.fn().mockResolvedValue(undefined);
  }
}

/**
 * FakeClient est un simple EventEmitter en test, pas un vrai Client
 * discord.js — suffisant pour piloter tout le trajet d'un event, sans
 * connexion réseau.
 * @returns {import('discord.js').Client}
 */
const fakeClient = () =>
  /** @type {import('discord.js').Client} */ (/** @type {unknown} */ (new FakeClient()));

/**
 * @param {import('discord.js').Client} client
 * @param {string} event
 * @param {unknown} payload
 */
const emit = (client, event, payload) =>
  /** @type {import('node:events').EventEmitter} */ (client).emit(event, payload);

/** @type {string} */
let dir;
/** @type {Awaited<ReturnType<typeof bootstrap>> | undefined} */
let app;

const boot = async (overrides = {}) => {
  app = await bootstrap({
    env: {
      DISCORD_TOKEN: 'tok',
      DISCORD_CLIENT_ID: 'app1',
      LOG_LEVEL: 'error',
      STORAGE_DRIVER: 'json',
      STORAGE_PATH: join(dir, 'store.json'),
      PLUGINS_DIR: fixtures,
      ...overrides,
    },
    clientFactory: fakeClient,
    restFactory: () => ({ put: vi.fn().mockResolvedValue([]) }),
  });
  return app;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-boot-'));
});

afterEach(async () => {
  await app?.shutdown();
  app = undefined;
  await rm(dir, { recursive: true, force: true });
});

describe('bootstrap', () => {
  it('devrait charger les plugins valides des fixtures', async () => {
    // `epsilon` (fixture de la Task 20) a un manifeste et un setup() valides
    // (vide), donc il survit au loader au même titre qu'alpha et beta ; les
    // fichiers mal formés qu'il contient dans commands/ ne sont scannés que
    // par applyConventions, pas par loadPlugins.
    const { plugins } = await boot();
    expect(plugins.map((p) => p.name).sort()).toEqual(['alpha', 'beta', 'epsilon']);
  });

  it('devrait construire un contexte par plugin', async () => {
    const { contexts } = await boot();
    expect(contexts.get('alpha')).toBeDefined();
    expect(contexts.get('beta')).toBeDefined();
  });

  it('devrait démarrer malgré un plugin invalide dans le répertoire', async () => {
    const { plugins } = await boot();
    expect(plugins.map((p) => p.name)).not.toContain('Broken');
  });

  it('devrait charger les déclarations par convention de dossiers', async () => {
    const { registries } = await boot();
    const ping = registries.commands.get('ping');
    expect(ping?.plugin).toBe('epsilon');
    expect(registries.jobs.all().some((job) => job.plugin === 'epsilon')).toBe(true);
  });

  it('devrait exposer un storage fonctionnel', async () => {
    const { storage } = await boot();
    await storage.set('test', 1);
    expect(await storage.get('test')).toBe(1);
  });

  it('ne devrait pas se connecter à Discord', async () => {
    const { client } = await boot();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('devrait rejeter si la configuration est invalide', async () => {
    await expect(
      bootstrap({ env: { DISCORD_CLIENT_ID: 'app1' }, clientFactory: fakeClient }),
    ).rejects.toThrow(/DISCORD_TOKEN/);
  });

  it('devrait stocker une entrée quand le logger racine logue une erreur', async () => {
    app = await boot();

    app.logger.error('erreur de test', { source: 'test' });
    // onError() (câblé sur reportAll) est fire-and-forget côté logger — .error()
    // reste synchrone. `flush()` laisse l'écriture asynchrone du reporter local
    // atteindre le storage avant la lecture ci-dessous (même pattern que le test
    // de dispatch d'event plus haut dans ce fichier).
    await flush();

    const entries = /** @type {import('../src/core/reporting/driver.js').ReportEntry[]} */ (
      await app.storage.get('core:errors')
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('erreur de test');
    expect(entries[0].context).toEqual({ source: 'test' });
  });

  it('devrait exposer ctx.t traduit dans la langue résolue à un plugin', async () => {
    // `alpha` (fixture, non privilégié) : ctx.t doit être câblé au vrai
    // translator pour tout plugin, pas seulement le plugin interne `core`
    // (absent des fixtures de ce fichier — voir 'core' dans plugins/core/).
    app = await boot();
    const ctx = app.contexts.get('alpha');
    expect(ctx?.t('en', 'nexis.owner_only')).toBe('This command is reserved for the bot owner.');
  });
});

describe('boot complet — comportement', () => {
  it("devrait délivrer un event au plugin qui l'a déclaré", async () => {
    // Le plugin fixture `alpha` déclare guildMemberAdd dans son setup et
    // écrit dans son storage à chaque appel — on observe donc le trajet
    // complet : listener attaché au boot, filtre guild, handler, storage.
    const { client, guildConfig, storage } = await boot();
    await guildConfig.enable('g1', 'alpha');

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(await storage.get('plugin:alpha:vus')).toBe(1);
  });

  it("ne devrait pas délivrer l'event si le plugin est désactivé", async () => {
    const { client, storage } = await boot();

    emit(client, 'guildMemberAdd', { guildId: 'g1' });
    await flush();

    expect(await storage.get('plugin:alpha:vus')).toBeUndefined();
  });

  it('devrait activer puis désactiver un plugin sur une guild', async () => {
    const { guildConfig } = await boot();
    await guildConfig.enable('g1', 'alpha');
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(true);
    await guildConfig.disable('g1', 'alpha');
    expect(await guildConfig.isEnabled('g1', 'alpha')).toBe(false);
  });

  it('devrait persister les activations entre deux boots', async () => {
    const first = await boot();
    await first.guildConfig.enable('g1', 'alpha');
    await first.shutdown();
    app = undefined;

    const second = await boot();
    expect(await second.guildConfig.isEnabled('g1', 'alpha')).toBe(true);
  });

  it('devrait fermer proprement le storage au shutdown', async () => {
    const booted = await boot();
    await booted.shutdown();
    app = undefined;
    expect(booted.client.destroy).toHaveBeenCalledOnce();
  });
});

describe('setup() qui lève — seconde ligne de défense', () => {
  it('devrait exclure un plugin dont le setup() lève, sans faire échouer le boot', async () => {
    // `throws-in-setup` a un manifeste valide (le loader le charge donc),
    // mais son setup() lève de façon synchrone à l'appel — un chemin
    // différent de `throws`, qui échoue dès l'import et n'atteint jamais
    // bootstrap(). C'est le try/catch de bootstrap() qui doit l'écarter.
    const logSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { plugins, contexts } = await boot({ PLUGINS_DIR: setupThrowsFixtures });
    // `mockRestore()` efface l'historique des appels : on lit `mock.calls`
    // avant de restaurer, pas après.
    const logged = logSpy.mock.calls.some(([line]) => String(line).includes('throws-in-setup'));
    logSpy.mockRestore();

    expect(contexts.get('throws-in-setup')).toBeUndefined();
    // Le plugin voisin, valide, démarre toujours malgré l'échec de l'autre.
    expect(plugins.map((p) => p.name)).toEqual(['ok']);
    expect(logged).toBe(true);
  });
});
