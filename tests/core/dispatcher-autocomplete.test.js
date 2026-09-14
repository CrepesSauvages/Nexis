import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createRegistries } from '../../src/core/registry/index.js';
import { createGuildConfig } from '../../src/core/guild-config.js';
import { createLogger } from '../../src/core/logger.js';
import { attachAutocompleteDispatcher } from '../../src/core/dispatcher.js';

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
  dir = await mkdtemp(join(tmpdir(), 'nexis-auto-'));
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
  isAutocomplete: () => true,
  commandName: 'search',
  guildId: 'g1',
  user: { id: 'u1' },
  memberPermissions: { has: () => true },
  respond: vi.fn(),
  ...overrides,
});

/**
 * @param {object} [command]
 * @returns {import('../../src/core/registry/commands.js').CommandDef}
 */
const searchCommand = (command = {}) =>
  /** @type {import('../../src/core/registry/commands.js').CommandDef} */ ({
    data: { name: 'search' },
    execute: vi.fn(),
    ...command,
  });

describe('attachAutocompleteDispatcher', () => {
  const attach = (options = {}) =>
    attachAutocompleteDispatcher({
      client: asClient(),
      contexts: new Map([['catalog', /** @type {never} */ ({ marker: 'ctx' })]]),
      registries,
      guildConfig,
      logger: silent(),
      ...options,
    });

  it('devrait répondre avec les choix retournés par le handler', async () => {
    const choices = [{ name: 'Épée', value: 'sword' }];
    registries.commands.add('catalog', searchCommand({ autocomplete: () => choices }));
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith(choices);
  });

  it('devrait passer le contexte du plugin au handler', async () => {
    const autocomplete = vi.fn().mockReturnValue([]);
    registries.commands.add('catalog', searchCommand({ autocomplete }));
    await guildConfig.enable('g1', 'catalog');
    attach();

    client.emit('interactionCreate', makeInteraction());
    await flush();

    expect(autocomplete.mock.calls[0][1]).toEqual({ marker: 'ctx' });
  });

  it('devrait attendre un handler asynchrone avant de répondre', async () => {
    const choices = [{ name: 'Bouclier', value: 'shield' }];
    registries.commands.add(
      'catalog',
      searchCommand({ autocomplete: async () => Promise.resolve(choices) }),
    );
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith(choices);
  });

  it("devrait ignorer une interaction qui n'est pas une autocomplétion", async () => {
    const autocomplete = vi.fn();
    registries.commands.add('catalog', searchCommand({ autocomplete }));
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction({ isAutocomplete: () => false });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(autocomplete).not.toHaveBeenCalled();
    expect(interaction.respond).not.toHaveBeenCalled();
  });

  it("devrait répondre une liste vide quand la commande n'existe plus", async () => {
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it("devrait répondre une liste vide quand la commande ne déclare pas d'autocomplétion", async () => {
    registries.commands.add('catalog', searchCommand());
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('devrait répondre une liste vide quand le plugin est désactivé', async () => {
    const autocomplete = vi.fn();
    registries.commands.add('catalog', searchCommand({ autocomplete }));
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(autocomplete).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('devrait répondre une liste vide sans la permission exigée par la commande', async () => {
    const autocomplete = vi.fn();
    registries.commands.add('catalog', searchCommand({ autocomplete, permissions: 'guild-admin' }));
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction({ memberPermissions: { has: () => false } });
    client.emit('interactionCreate', interaction);
    await flush();

    expect(autocomplete).not.toHaveBeenCalled();
    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('devrait répondre une liste vide quand le handler lève', async () => {
    registries.commands.add(
      'catalog',
      searchCommand({
        autocomplete: () => {
          throw new Error('boum');
        },
      }),
    );
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('devrait tronquer la réponse à 25 choix, la limite de Discord', async () => {
    const choices = Array.from({ length: 40 }, (_value, index) => ({
      name: `choix ${index}`,
      value: String(index),
    }));
    registries.commands.add('catalog', searchCommand({ autocomplete: () => choices }));
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond.mock.calls[0][0]).toHaveLength(25);
  });

  it('devrait répondre une liste vide quand le handler ne retourne pas de tableau', async () => {
    registries.commands.add(
      'catalog',
      // Le cas du plugin qui répond lui-même au lieu de retourner ses choix.
      searchCommand({ autocomplete: () => /** @type {never} */ ({ name: 'pas un tableau' }) }),
    );
    await guildConfig.enable('g1', 'catalog');
    attach();

    const interaction = makeInteraction();
    client.emit('interactionCreate', interaction);
    await flush();

    expect(interaction.respond).toHaveBeenCalledWith([]);
  });

  it('ne devrait pas laisser un échec de réponse devenir un rejet non capturé', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    registries.commands.add('catalog', searchCommand({ autocomplete: () => [] }));
    await guildConfig.enable('g1', 'catalog');
    attach({ logger: createLogger({ level: 'warn' }) });

    const interaction = makeInteraction({
      respond: vi.fn().mockRejectedValue(new Error('Unknown interaction')),
    });
    client.emit('interactionCreate', interaction);
    await flush();
    await flush();

    expect(stderr.mock.calls.join('')).toContain("Réponse à l'autocomplétion impossible");
    stderr.mockRestore();
  });
});
