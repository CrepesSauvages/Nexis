import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { attachComponentDispatcher } from '../../src/core/dispatcher.js';
import { translator } from '../../src/core/i18n/index.js';

const silent = () => createLogger({ level: 'error' });
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {import('../../src/core/registry/index.js').Registries} */
let registries;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {EventEmitter} */
let client;

/** @returns {import('discord.js').Client} */
const asClient = () => /** @type {import('discord.js').Client} */ (client);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-disp-comp-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  registries = createRegistries();
  guildConfig = createGuildConfig({ storage });
  client = new EventEmitter();
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

/**
 * @param {object} [overrides]
 */
const makeInteraction = (overrides = {}) => ({
  isButton: () => true,
  isAnySelectMenu: () => false,
  isModalSubmit: () => false,
  customId: 'shop:buy',
  guildId: 'g1',
  user: { id: 'u1' },
  memberPermissions: { has: () => true },
  replied: false,
  deferred: false,
  reply: vi.fn(),
  followUp: vi.fn(),
  ...overrides,
});

describe('attachComponentDispatcher', () => {
  const attach = (options = {}) =>
    attachComponentDispatcher({
      client: asClient(),
      contexts: new Map([['shop', /** @type {never} */ ({ marker: 'ctx' })]]),
      registries,
      guildConfig,
      logger: silent(),
      ...options,
    });

  it("devrait exécuter le handler d'un component d'un plugin activé", async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    await guildConfig.enable('g1', 'shop');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('devrait passer le contexte du plugin au handler', async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    await guildConfig.enable('g1', 'shop');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(handler.mock.calls[0][1]).toEqual({ marker: 'ctx' });
  });

  it("devrait ignorer une interaction qui n'est ni bouton, ni select, ni modal", async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    attach();

    client.emit(
      'interactionCreate',
      makeInteraction({ isButton: () => false, isChatInputCommand: () => true }),
    );
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('devrait matcher un select menu', async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'pick', type: 'select', handler });
    await guildConfig.enable('g1', 'shop');
    attach();

    client.emit(
      'interactionCreate',
      makeInteraction({
        isButton: () => false,
        isAnySelectMenu: () => true,
        customId: 'shop:pick',
      }),
    );
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('devrait matcher un modal submit', async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'form', type: 'modal', handler });
    await guildConfig.enable('g1', 'shop');
    attach();

    client.emit(
      'interactionCreate',
      makeInteraction({
        isButton: () => false,
        isModalSubmit: () => true,
        customId: 'shop:form',
      }),
    );
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('devrait matcher un customId dynamique via le préfixe', async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    await guildConfig.enable('g1', 'shop');
    attach();

    client.emit('interactionCreate', makeInteraction({ customId: 'shop:buy:1234' }));
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it("devrait répondre plutôt qu'exécuter si le plugin est désactivé", async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser un component guild-admin sans la permission', async () => {
    const handler = vi.fn();
    registries.components.add('shop', {
      customId: 'buy',
      type: 'button',
      permissions: 'guild-admin',
      handler,
    });
    await guildConfig.enable('g1', 'shop');
    attach();

    const interaction = makeInteraction({ memberPermissions: { has: () => false } });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser un component owner à un autre utilisateur', async () => {
    const handler = vi.fn();
    registries.components.add('shop', {
      customId: 'buy',
      type: 'button',
      permissions: 'owner',
      handler,
    });
    await guildConfig.enable('g1', 'shop');
    attach({ ownerId: 'patron' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(handler).not.toHaveBeenCalled();
  });

  it('devrait autoriser le propriétaire sur un component owner', async () => {
    const handler = vi.fn();
    registries.components.add('shop', {
      customId: 'buy',
      type: 'button',
      permissions: 'owner',
      handler,
    });
    await guildConfig.enable('g1', 'shop');
    attach({ ownerId: 'u1' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(handler).toHaveBeenCalledOnce();
  });

  it('devrait ignorer un customId inconnu', async () => {
    attach();
    const interaction = makeInteraction({ customId: 'fantome:buy' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it("devrait répondre avec un id d'erreur si le handler échoue", async () => {
    registries.components.add('shop', {
      customId: 'buy',
      type: 'button',
      handler: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'shop');
    attach({ t: translator.t });

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(interaction.reply.mock.calls[0][0].content).toMatch(/[a-f0-9]{8}/);
  });

  it("devrait utiliser followUp si l'interaction a déjà répondu", async () => {
    registries.components.add('shop', {
      customId: 'buy',
      type: 'button',
      handler: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'shop');
    attach();

    const interaction = makeInteraction({ replied: true });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.followUp).toHaveBeenCalledOnce();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('ne devrait pas laisser un échec de reply() devenir un rejet non intercepté', async () => {
    const logger = { ...silent(), warn: vi.fn(), child: () => logger };
    attach({ logger });

    let unhandled = false;
    /** @param {unknown} reason */
    const onUnhandledRejection = (reason) => {
      unhandled = true;
      void reason;
    };
    process.on('unhandledRejection', onUnhandledRejection);

    const interaction = makeInteraction({
      customId: 'fantome:buy',
      reply: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
    });
    client.emit('interactionCreate', interaction);
    await flush();
    await flush();

    process.off('unhandledRejection', onUnhandledRejection);

    expect(unhandled).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("ne devrait pas propager le rejet d'une erreur de storage pendant la vérification d'activation", async () => {
    const handler = vi.fn();
    registries.components.add('shop', { customId: 'buy', type: 'button', handler });
    guildConfig.isEnabled = vi.fn().mockRejectedValue(new Error('storage indisponible'));

    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    attach({ logger });

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait traduire "component introuvable" selon interaction.locale', async () => {
    attach({ t: translator.t });
    const interaction = makeInteraction({ customId: 'fantome:buy', locale: 'en-US' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply.mock.calls[0][0].content).toBe(
      'This component is no longer available. The message may be too old.',
    );
  });

  describe('permissions héritées d’une commande', () => {
    it('devrait suivre la surcharge de la commande déclarée par permissionsFrom', async () => {
      const handler = vi.fn();
      registries.components.add('shop', {
        customId: 'buy',
        type: 'button',
        permissions: 'guild-admin',
        permissionsFrom: 'acheter',
        handler,
      });
      await guildConfig.enable('g1', 'shop');
      await guildConfig.setCommandRoles('g1', 'acheter', ['mods']);
      attach();

      client.emit(
        'interactionCreate',
        makeInteraction({
          memberPermissions: { has: () => false },
          member: { roles: ['mods'] },
        }),
      );
      await flush();

      expect(handler).toHaveBeenCalledOnce();
    });

    it("devrait s'en tenir au niveau déclaré sans permissionsFrom", async () => {
      const handler = vi.fn();
      registries.components.add('shop', {
        customId: 'buy',
        type: 'button',
        permissions: 'guild-admin',
        handler,
      });
      await guildConfig.enable('g1', 'shop');
      // La surcharge existe, mais ce composant ne s'y rattache pas.
      await guildConfig.setCommandRoles('g1', 'acheter', ['mods']);
      attach();

      const interaction = makeInteraction({
        memberPermissions: { has: () => false },
        member: { roles: ['mods'] },
      });
      client.emit('interactionCreate', interaction);
      await flush();

      expect(handler).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledOnce();
    });
  });

  describe('propriété et expiration', () => {
    const NOW = 1_000_000;

    /**
     * Le message qui porte le composant. `interactionMetadata` est ce que
     * Discord attache à un message né d'une interaction : c'est de là que
     * vient l'invocateur, sans qu'aucun état n'ait à être conservé.
     * @param {object} [overrides]
     */
    const message = (overrides = {}) => ({
      createdTimestamp: NOW,
      interactionMetadata: { user: { id: 'u1' } },
      ...overrides,
    });

    /**
     * @param {object} component
     * @param {object} [interactionOverrides]
     * @param {object} [options]
     */
    const run = async (component, interactionOverrides = {}, options = {}) => {
      const handler = vi.fn();
      registries.components.add('shop', {
        customId: 'buy',
        type: 'button',
        handler,
        ...component,
      });
      await guildConfig.enable('g1', 'shop');
      attach({ now: () => NOW, ...options });

      const interaction = makeInteraction({ message: message(), ...interactionOverrides });
      client.emit('interactionCreate', interaction);
      await flush();
      return { handler, interaction };
    };

    it("devrait laisser l'invocateur utiliser son propre composant", async () => {
      const { handler } = await run({ restrictToInvoker: true });

      expect(handler).toHaveBeenCalledOnce();
    });

    it("devrait refuser le composant à quelqu'un d'autre", async () => {
      const { handler, interaction } = await run(
        { restrictToInvoker: true },
        {
          user: { id: 'u2' },
        },
      );

      expect(handler).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledOnce();
    });

    it("devrait refuser quand le message n'a pas d'invocateur connu", async () => {
      // Message posté par le plugin lui-même : aucune interaction derrière,
      // donc aucun propriétaire à comparer. On ferme.
      const { handler } = await run(
        { restrictToInvoker: true },
        {
          message: message({ interactionMetadata: null }),
        },
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it('devrait laisser passer un composant encore valide', async () => {
      const { handler } = await run(
        { expiresAfter: 60 },
        {
          message: message({ createdTimestamp: NOW - 59_000 }),
        },
      );

      expect(handler).toHaveBeenCalledOnce();
    });

    it('devrait refuser un composant expiré', async () => {
      const { handler, interaction } = await run(
        { expiresAfter: 60 },
        {
          message: message({ createdTimestamp: NOW - 61_000 }),
        },
      );

      expect(handler).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledOnce();
    });

    it('devrait traduire le refus de propriété', async () => {
      const { interaction } = await run(
        { restrictToInvoker: true },
        { user: { id: 'u2' }, locale: 'en-US' },
        { t: translator.t },
      );

      expect(interaction.reply.mock.calls[0][0].content).toBe("This component isn't for you.");
    });

    it("devrait traduire le refus d'expiration", async () => {
      const { interaction } = await run(
        { expiresAfter: 60 },
        { message: message({ createdTimestamp: NOW - 120_000 }), locale: 'en-US' },
        { t: translator.t },
      );

      expect(interaction.reply.mock.calls[0][0].content).toBe('This component has expired.');
    });

    it('ne devrait vérifier ni propriété ni expiration sur un modal', async () => {
      // Un modal n'est visible que de qui l'a ouvert, et n'a pas toujours de
      // message : les deux contrôles n'ont rien à vérifier.
      const handler = vi.fn();
      registries.components.add('shop', {
        customId: 'form',
        type: 'modal',
        handler,
        restrictToInvoker: true,
        expiresAfter: 1,
      });
      await guildConfig.enable('g1', 'shop');
      attach({ now: () => NOW });

      client.emit(
        'interactionCreate',
        makeInteraction({
          isButton: () => false,
          isModalSubmit: () => true,
          customId: 'shop:form',
          user: { id: 'u2' },
          message: null,
        }),
      );
      await flush();

      expect(handler).toHaveBeenCalledOnce();
    });

    it('ne devrait rien vérifier quand le composant ne déclare aucune des deux', async () => {
      const { handler } = await run({}, { user: { id: 'u2' }, message: null });

      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
