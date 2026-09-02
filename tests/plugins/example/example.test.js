import { describe, it, expect, vi, beforeAll } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, setup } from '../../../plugins/example/index.js';
import { validateManifest } from '../../../src/core/manifest.js';
import { applyConventions } from '../../../src/core/conventions.js';
import { translator, registerPluginLocales } from '../../../src/core/i18n/index.js';
import { mapDiscordLocale } from '../../../src/core/i18n/locale-resolver.js';
import { loadPluginLocales } from '../../../src/core/i18n/plugin-locales.js';

const pluginDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'plugins',
  'example',
);

// Ce fichier construit son `ctx` à la main (voir makeCtx), sans passer par
// bootstrap() — l'enregistrement des traductions du plugin (fait par
// bootstrap() en temps normal, avant setup()) doit donc être reproduit ici.
beforeAll(async () => {
  registerPluginLocales('example', await loadPluginLocales(pluginDir));
});

const makeCtx = () => ({
  client: {},
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockResolvedValue([]) },
  config: vi.fn().mockResolvedValue({ greeting: 'Bienvenue', announce: false }),
  registerCommand: vi.fn(),
  registerEvent: vi.fn(),
  registerJob: vi.fn(),
  registerRoute: vi.fn(),
  provideService: vi.fn(),
  useService: vi.fn(),
  t: translator.t,
  resolveLocale: async (/** @type {{ locale?: string }} */ interaction) =>
    mapDiscordLocale(interaction.locale) ?? 'fr',
});

const makeLogger = () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return logger;
};

const plugin = { name: 'example', manifest, setup, dir: pluginDir };

/**
 * Les doublures ci-dessus (`makeCtx`, `makeLogger`) ne couvrent que les
 * propriétés utilisées par le code testé — le cast passe par `unknown`,
 * comme dans `src/core/conventions.test.js`.
 * @param {ReturnType<typeof makeCtx>} ctx
 * @returns {import('../../../src/core/context.js').PluginContext}
 */
const asCtx = (ctx) =>
  /** @type {import('../../../src/core/context.js').PluginContext} */ (
    /** @type {unknown} */ (ctx)
  );

/**
 * @param {ReturnType<typeof makeLogger>} logger
 * @returns {import('../../../src/core/logger.js').Logger}
 */
const asLogger = (logger) =>
  /** @type {import('../../../src/core/logger.js').Logger} */ (/** @type {unknown} */ (logger));

/** @type {import('../../../src/core/loader.js').LoadedPlugin} */
const loadedPlugin = /** @type {import('../../../src/core/loader.js').LoadedPlugin} */ (
  /** @type {unknown} */ (plugin)
);

describe('plugin example — manifeste', () => {
  it('devrait avoir un manifeste valide', () => {
    expect(() => validateManifest(manifest, 'plugins/example')).not.toThrow();
  });
});

describe('plugin example — setup()', () => {
  it('devrait enregistrer un job', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.registerJob).toHaveBeenCalledOnce();
  });

  it('devrait enregistrer une route', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.registerRoute).toHaveBeenCalledOnce();
  });

  it('devrait fournir un service', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.provideService).toHaveBeenCalledOnce();
  });

  it('ne devrait pas enregistrer par setup ce que la convention charge', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.registerCommand).not.toHaveBeenCalled();
    expect(ctx.registerEvent).not.toHaveBeenCalled();
  });
});

describe('plugin example — conventions de dossiers', () => {
  it('devrait charger les commandes hello et ping', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    expect(ctx.registerCommand).toHaveBeenCalledTimes(2);
    const commandNames = ctx.registerCommand.mock.calls.map((call) => call[0].data.name);
    expect(commandNames).toEqual(expect.arrayContaining(['hello', 'ping']));
  });

  it('devrait charger le handler guildMemberAdd', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    expect(ctx.registerEvent).toHaveBeenCalledWith('guildMemberAdd', expect.any(Function));
  });

  it('ne devrait produire aucun avertissement', async () => {
    const logger = makeLogger();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(makeCtx()),
      logger: asLogger(logger),
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('commande hello', () => {
  it('devrait répondre avec le message configuré', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const command = ctx.registerCommand.mock.calls[0][0];
    const interaction = { guildId: 'g1', user: { id: 'u1' }, reply: vi.fn() };

    await command.execute(interaction, asCtx(ctx));

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(interaction.reply.mock.calls[0][0].content).toContain('Bienvenue');
  });

  it('devrait traduire le suffixe selon interaction.locale (pluriel, 1 fois)', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const command = ctx.registerCommand.mock.calls[0][0];
    const interaction = { guildId: 'g1', user: { id: 'u1' }, locale: 'en-US', reply: vi.fn() };

    await command.execute(interaction, asCtx(ctx));

    expect(interaction.reply.mock.calls[0][0].content).toContain(' ! (1 time)');
  });

  it('devrait traduire le suffixe selon interaction.locale (pluriel, plusieurs fois)', async () => {
    const ctx = makeCtx();
    ctx.storage.get = vi.fn().mockResolvedValue(1);
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const command = ctx.registerCommand.mock.calls[0][0];
    const interaction = { guildId: 'g1', user: { id: 'u1' }, locale: 'en-US', reply: vi.fn() };

    await command.execute(interaction, asCtx(ctx));

    expect(interaction.reply.mock.calls[0][0].content).toContain(' ! (2 times)');
  });
});
