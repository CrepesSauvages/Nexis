import { describe, it, expect, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifest, setup } from '../../../plugins/moderation/index.js';
import { validateManifest } from '../../../src/core/manifest.js';
import { applyConventions } from '../../../src/core/conventions.js';

const pluginDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'plugins',
  'moderation',
);

const makeCtx = () => ({
  client: {},
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), keys: vi.fn().mockResolvedValue([]) },
  config: vi.fn().mockResolvedValue({}),
  registerCommand: vi.fn(),
  registerEvent: vi.fn(),
  registerJob: vi.fn(),
  registerRoute: vi.fn(),
  registerComponent: vi.fn(),
  /** @param {string} id */
  componentId: (id) => `moderation:${id}`,
  provideService: vi.fn(),
  useService: vi.fn(),
  /**
   * @param {string} _locale
   * @param {string} key
   */
  t: (_locale, key) => `[${key}]`,
  resolveLocale: async () => 'fr',
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

/**
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

const plugin = { name: 'moderation', manifest, setup, dir: pluginDir };
/** @type {import('../../../src/core/loader.js').LoadedPlugin} */
const loadedPlugin = /** @type {import('../../../src/core/loader.js').LoadedPlugin} */ (
  /** @type {unknown} */ (plugin)
);

describe('plugin moderation — manifeste', () => {
  it('devrait avoir un manifeste valide', () => {
    expect(() => validateManifest(manifest, 'plugins/moderation')).not.toThrow();
  });
});

describe('plugin moderation — setup()', () => {
  it('devrait enregistrer trois components (purge-confirm, lock-confirm, cancel)', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.registerComponent).toHaveBeenCalledTimes(3);
    const ids = ctx.registerComponent.mock.calls.map((call) => call[0].customId);
    expect(ids.sort()).toEqual(['cancel', 'lock-confirm', 'purge-confirm']);
  });

  it('devrait exiger guild-admin sur chaque component', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    for (const call of ctx.registerComponent.mock.calls) {
      expect(call[0].permissions).toBe('guild-admin');
    }
  });

  it('ne devrait pas enregistrer par setup ce que la convention charge', () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    expect(ctx.registerCommand).not.toHaveBeenCalled();
  });
});

describe('plugin moderation — conventions de dossiers', () => {
  it('devrait charger les commandes purge et lock', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const names = ctx.registerCommand.mock.calls.map((call) => call[0].data.name).sort();
    expect(names).toEqual(['lock', 'purge']);
  });

  it('devrait marquer les deux commandes guild-admin', async () => {
    const ctx = makeCtx();
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    for (const call of ctx.registerCommand.mock.calls) {
      expect(call[0].permissions).toBe('guild-admin');
    }
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

describe('commande /purge', () => {
  /** @param {ReturnType<typeof makeCtx>} ctx */
  const getCommand = async (ctx) => {
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const call = ctx.registerCommand.mock.calls.find(
      /** @param {any[]} call */ (call) => call[0].data.name === 'purge',
    );
    if (!call) throw new Error('commande purge introuvable');
    return call[0];
  };

  it('devrait répondre avec un bouton de confirmation encodant le count', async () => {
    const ctx = makeCtx();
    const command = await getCommand(ctx);
    const interaction = {
      options: { getInteger: vi.fn().mockReturnValue(5) },
      reply: vi.fn(),
    };

    await command.execute(interaction, asCtx(ctx));

    expect(interaction.reply).toHaveBeenCalledOnce();
    const payload = interaction.reply.mock.calls[0][0];
    const customIds = payload.components[0].components.map(
      /** @param {any} c */ (c) => c.data.custom_id,
    );
    expect(customIds).toContain('moderation:purge-confirm:5');
    expect(customIds).toContain('moderation:cancel');
  });
});

describe('commande /lock', () => {
  /** @param {ReturnType<typeof makeCtx>} ctx */
  const getCommand = async (ctx) => {
    await applyConventions({
      plugin: loadedPlugin,
      ctx: asCtx(ctx),
      logger: asLogger(makeLogger()),
    });
    const call = ctx.registerCommand.mock.calls.find(
      /** @param {any[]} call */ (call) => call[0].data.name === 'lock',
    );
    if (!call) throw new Error('commande lock introuvable');
    return call[0];
  };

  it('devrait répondre avec un bouton de confirmation', async () => {
    const ctx = makeCtx();
    const command = await getCommand(ctx);
    const interaction = { reply: vi.fn() };

    await command.execute(interaction, asCtx(ctx));

    expect(interaction.reply).toHaveBeenCalledOnce();
    const payload = interaction.reply.mock.calls[0][0];
    const customIds = payload.components[0].components.map(
      /** @param {any} c */ (c) => c.data.custom_id,
    );
    expect(customIds).toContain('moderation:lock-confirm');
    expect(customIds).toContain('moderation:cancel');
  });
});

describe('component purge-confirm', () => {
  it('devrait supprimer count messages et éditer la réponse', async () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    const found = ctx.registerComponent.mock.calls.find(
      /** @param {any[]} call */ (call) => call[0].customId === 'purge-confirm',
    );
    if (!found) throw new Error('component purge-confirm introuvable');
    const entry = found[0];

    const bulkDelete = vi.fn().mockResolvedValue({ size: 5 });
    const interaction = {
      customId: 'moderation:purge-confirm:5',
      inCachedGuild: () => true,
      channel: { bulkDelete },
      update: vi.fn(),
    };

    await entry.handler(interaction, asCtx(ctx));

    expect(bulkDelete).toHaveBeenCalledWith(5, true);
    expect(interaction.update).toHaveBeenCalledOnce();
    expect(interaction.update.mock.calls[0][0].content).toContain('5');
    expect(interaction.update.mock.calls[0][0].components).toEqual([]);
  });
});

describe('component lock-confirm', () => {
  it('devrait poser un override SendMessages=false sur @everyone', async () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    const found = ctx.registerComponent.mock.calls.find(
      /** @param {any[]} call */ (call) => call[0].customId === 'lock-confirm',
    );
    if (!found) throw new Error('component lock-confirm introuvable');
    const entry = found[0];

    const edit = vi.fn();
    const everyone = { id: 'everyone-role' };
    const interaction = {
      customId: 'moderation:lock-confirm',
      inCachedGuild: () => true,
      channel: { permissionOverwrites: { edit } },
      guild: { roles: { everyone } },
      update: vi.fn(),
    };

    await entry.handler(interaction, asCtx(ctx));

    expect(edit).toHaveBeenCalledWith(everyone, { SendMessages: false });
    expect(interaction.update).toHaveBeenCalledOnce();
  });
});

describe('component cancel', () => {
  it("devrait éditer la réponse pour signaler l'annulation, sans effet de bord", async () => {
    const ctx = makeCtx();
    setup(asCtx(ctx));
    const found = ctx.registerComponent.mock.calls.find(
      /** @param {any[]} call */ (call) => call[0].customId === 'cancel',
    );
    if (!found) throw new Error('component cancel introuvable');
    const entry = found[0];

    const interaction = { customId: 'moderation:cancel', update: vi.fn() };
    await entry.handler(interaction, asCtx(ctx));

    expect(interaction.update).toHaveBeenCalledOnce();
    expect(interaction.update.mock.calls[0][0].components).toEqual([]);
  });
});
