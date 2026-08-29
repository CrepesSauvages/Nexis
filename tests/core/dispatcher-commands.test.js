import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { attachCommandDispatcher } from '../../src/core/dispatcher.js';
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

/**
 * `client` est un simple EventEmitter en test : suffisant pour émettre les
 * events consommés par `client.on(...)`, mais pas un vrai `Client` discord.js.
 * @returns {import('discord.js').Client}
 */
const asClient = () => /** @type {import('discord.js').Client} */ (client);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-disp-'));
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

const makeInteraction = (overrides = {}) => ({
  isChatInputCommand: () => true,
  commandName: 'hello',
  guildId: 'g1',
  user: { id: 'u1' },
  memberPermissions: { has: () => true },
  replied: false,
  deferred: false,
  reply: vi.fn(),
  followUp: vi.fn(),
  ...overrides,
});

describe('attachCommandDispatcher', () => {
  const attach = (options = {}) =>
    attachCommandDispatcher({
      client: asClient(),
      contexts: new Map([['welcome', /** @type {never} */ ({ marker: 'ctx' })]]),
      registries,
      guildConfig,
      logger: silent(),
      ...options,
    });

  it("devrait exécuter la commande d'un plugin activé", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    await guildConfig.enable('g1', 'welcome');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
  });

  it('devrait passer le contexte du plugin à execute', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    await guildConfig.enable('g1', 'welcome');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute.mock.calls[0][1]).toEqual({ marker: 'ctx' });
  });

  it("devrait ignorer une interaction qui n'est pas une commande", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    attach();

    client.emit('interactionCreate', makeInteraction({ isChatInputCommand: () => false }));
    await flush();

    expect(execute).not.toHaveBeenCalled();
  });

  it("devrait répondre plutôt qu'exécuter si le plugin est désactivé", async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser une commande guild-admin sans la permission', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'guild-admin',
    });
    await guildConfig.enable('g1', 'welcome');
    attach();

    const interaction = makeInteraction({ memberPermissions: { has: () => false } });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait refuser une commande owner à un autre utilisateur', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'owner',
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ ownerId: 'patron' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).not.toHaveBeenCalled();
  });

  it('devrait autoriser le propriétaire sur une commande owner', async () => {
    const execute = vi.fn();
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute,
      permissions: 'owner',
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ ownerId: 'u1' });

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(execute).toHaveBeenCalledOnce();
  });

  it("devrait répondre avec un id d'erreur si execute échoue", async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'welcome');
    // `t` par défaut ne fait pas d'interpolation (voir sa doc) — ce test
    // vérifie la présence d'un vrai errorId dans la réponse, il lui faut
    // donc le traducteur réel, comme les tests de traduction ci-dessous.
    attach({ t: translator.t });

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledOnce();
    expect(interaction.reply.mock.calls[0][0].content).toMatch(/[a-f0-9]{8}/);
  });

  it("devrait utiliser followUp si l'interaction a déjà répondu", async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'welcome');
    attach();

    const interaction = makeInteraction({ replied: true });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.followUp).toHaveBeenCalledOnce();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('ne devrait pas laisser un échec de reply() devenir un rejet non intercepté', async () => {
    // `client.on('interactionCreate', ...)` n'est jamais awaité par
    // discord.js : un rejet non capturé dans ce handler tue le process
    // (comportement par défaut depuis Node 15). `reply()` échoue couramment
    // en prod (token expiré, interaction déjà acquittée) — le pire des cas
    // étant précisément la réponse envoyée depuis le catch de execute().
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
      commandName: 'fantôme',
      reply: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
    });
    client.emit('interactionCreate', interaction);
    await flush();
    await flush();

    process.off('unhandledRejection', onUnhandledRejection);

    expect(unhandled).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('ne devrait pas laisser un échec de followUp() devenir un rejet non intercepté', async () => {
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
      commandName: 'fantôme',
      replied: true,
      followUp: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
    });
    client.emit('interactionCreate', interaction);
    await flush();
    await flush();

    process.off('unhandledRejection', onUnhandledRejection);

    expect(unhandled).toBe(false);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("ne devrait pas propager le rejet d'une erreur de storage pendant la vérification d'activation", async () => {
    // `isActive` était appelé hors du try/catch entourant l'exécution :
    // une erreur de storage y était donc un rejet non intercepté. On
    // vérifie ici qu'elle est attrapée et traitée comme "non activé"
    // (fermeture, pas ouverture par défaut).
    const execute = vi.fn();
    registries.commands.add('welcome', { data: { name: 'hello' }, execute });
    guildConfig.isEnabled = vi.fn().mockRejectedValue(new Error('storage indisponible'));

    const logger = { ...silent(), error: vi.fn(), child: () => logger };
    attach({ logger });

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait ignorer une commande inconnue', async () => {
    attach();
    const interaction = makeInteraction({ commandName: 'fantôme' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply).toHaveBeenCalledOnce();
  });

  it('devrait traduire "commande introuvable" selon interaction.locale', async () => {
    attach({ t: translator.t });
    const interaction = makeInteraction({ commandName: 'fantôme', locale: 'en-US' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply.mock.calls[0][0].content).toBe(
      'This command no longer exists. It may have been disabled.',
    );
  });

  it("devrait prioriser l'override de guildConfig sur interaction.locale", async () => {
    await guildConfig.setLocale('g1', 'de');
    attach({ t: translator.t });
    const interaction = makeInteraction({ commandName: 'fantôme', locale: 'en-US', guildId: 'g1' });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply.mock.calls[0][0].content).toBe(
      'Dieser Befehl existiert nicht mehr. Er wurde möglicherweise deaktiviert.',
    );
  });

  it('devrait traduire le message de permission refusée', async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: vi.fn(),
      permissions: 'guild-admin',
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ t: translator.t });
    const interaction = makeInteraction({
      locale: 'es-ES',
      memberPermissions: { has: () => false },
    });
    client.emit('interactionCreate', interaction);
    await flush();
    expect(interaction.reply.mock.calls[0][0].content).toBe(
      'No tienes permiso para usar este comando.',
    );
  });

  it("devrait traduire le message d'erreur de commande avec l'errorId interpolé", async () => {
    registries.commands.add('welcome', {
      data: { name: 'hello' },
      execute: () => {
        throw new Error('boum');
      },
    });
    await guildConfig.enable('g1', 'welcome');
    attach({ t: translator.t });
    const interaction = makeInteraction({ locale: 'de' });
    client.emit('interactionCreate', interaction);
    await flush();
    const content = /** @type {string} */ (interaction.reply.mock.calls[0][0].content);
    expect(content).toMatch(/^Ein Fehler ist aufgetreten\. Referenz: `[a-f0-9]{8}`$/);
  });
});
