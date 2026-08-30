import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../../src/core/storage/drivers/json.js';
import { createGuildConfig } from '../../../../src/core/guild-config.js';
import { buildNexisCommand } from '../../../../plugins/core/commands/nexis.js';
import { translator } from '../../../../src/core/i18n/index.js';
import { resolveLocale as resolveLocalePure } from '../../../../src/core/i18n/locale-resolver.js';

/**
 * @param {string} name
 * @param {Record<string, unknown>} [manifest]
 * @returns {import('../../../../src/core/loader.js').LoadedPlugin}
 */
const makePlugin = (name, manifest = {}) => ({
  name,
  manifest: /** @type {import('../../../../src/core/manifest.js').PluginManifest} */ ({
    name,
    version: '1.0.0',
    description: `plugin ${name}`,
    ...manifest,
  }),
  setup: () => {},
  dir: `/fake/${name}`,
});

/**
 * @param {string} subcommand
 * @param {string} [pluginName]
 * @param {string} [userId]
 */
const makeInteraction = (subcommand, pluginName, userId = 'owner-123') => ({
  guildId: 'g1',
  locale: /** @type {string | undefined} */ (undefined),
  user: { id: userId },
  reply: vi.fn(),
  options: {
    getSubcommand: () => subcommand,
    getString: () => pluginName,
  },
});

/**
 * @param {ReturnType<typeof makeInteraction>} interaction
 * @returns {string}
 */
const replyText = (interaction) => {
  const payload = interaction.reply.mock.calls[0][0];
  return typeof payload === 'string' ? payload : payload.content;
};

/** @type {string} */
let dir;
/** @type {import('../../../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;
/** @type {{ plugins: import('../../../../src/core/loader.js').LoadedPlugin[], guildConfig: ReturnType<typeof createGuildConfig>, commandSync: { syncGuild: (guildId: string) => Promise<void> }, alwaysEnabled: string[], ownerId: string | undefined, errorReporting: { getRecent: import('vitest').Mock<(count?: number) => Promise<import('../../../../src/core/reporting/driver.js').ReportEntry[]>> }, t: (locale: string, key: string, params?: Record<string, string | number>) => string, resolveLocale: (interaction: { locale?: string, guildId?: string | null }) => Promise<string> }} */
let core;
/** @type {ReturnType<typeof buildNexisCommand>} */
let command;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-core-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  guildConfig = createGuildConfig({ storage });
  core = {
    plugins: [makePlugin('welcome'), makePlugin('economy')],
    guildConfig,
    commandSync: { syncGuild: vi.fn().mockResolvedValue(undefined) },
    alwaysEnabled: [],
    ownerId: 'owner-123',
    errorReporting: { getRecent: vi.fn().mockResolvedValue([]) },
    t: translator.t,
    resolveLocale: async (interaction) =>
      resolveLocalePure(interaction, await guildConfig.getLocale(interaction.guildId ?? '')),
  };
  command = buildNexisCommand(core);
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('/nexis', () => {
  it('devrait exiger la permission guild-admin', () => {
    expect(command.permissions).toBe('guild-admin');
  });

  it('devrait se nommer nexis', () => {
    expect(command.data.name).toBe('nexis');
  });
});

describe('/nexis list', () => {
  it('devrait lister tous les plugins disponibles', async () => {
    const interaction = makeInteraction('list');
    await command.execute(interaction);
    expect(replyText(interaction)).toContain('welcome');
    expect(replyText(interaction)).toContain('economy');
  });

  it('devrait distinguer les plugins activés', async () => {
    await guildConfig.enable('g1', 'welcome');
    const interaction = makeInteraction('list');
    await command.execute(interaction);
    const text = replyText(interaction);
    expect(text).toMatch(/welcome/);
    expect(text).toContain('✅');
    expect(text).toContain('◻️');
  });

  it('devrait afficher un plugin alwaysEnabled comme toujours actif, pas comme désactivé', async () => {
    core.plugins.push(makePlugin('core'));
    core.alwaysEnabled.push('core');
    const interaction = makeInteraction('list');
    await command.execute(interaction);
    const text = replyText(interaction);
    expect(text).toMatch(/toujours actif.*\*\*core\*\*/);
  });

  it("devrait traduire le titre selon la locale de l'interaction", async () => {
    const interaction = makeInteraction('list');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toContain('**Nexis Plugins**');
  });
});

describe('/nexis enable', () => {
  it('devrait activer le plugin demandé', async () => {
    await command.execute(makeInteraction('enable', 'welcome'));
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(true);
  });

  it('devrait resynchroniser les commandes de la guild', async () => {
    await command.execute(makeInteraction('enable', 'welcome'));
    expect(core.commandSync.syncGuild).toHaveBeenCalledWith('g1');
  });

  it('devrait refuser un plugin inexistant', async () => {
    const interaction = makeInteraction('enable', 'fantôme');
    await command.execute(interaction);
    expect(replyText(interaction)).toMatch(/introuvable|inconnu/i);
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it('devrait signaler un plugin déjà activé', async () => {
    await guildConfig.enable('g1', 'welcome');
    const interaction = makeInteraction('enable', 'welcome');
    await command.execute(interaction);
    expect(replyText(interaction)).toMatch(/déjà/i);
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it("devrait refuser si une dépendance n'est pas activée", async () => {
    core.plugins.push(makePlugin('shop', { dependsOn: ['economy'] }));
    const interaction = makeInteraction('enable', 'shop');
    await command.execute(interaction);

    expect(await guildConfig.isEnabled('g1', 'shop')).toBe(false);
    expect(replyText(interaction)).toContain('economy');
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it('devrait accepter si la dépendance est activée', async () => {
    core.plugins.push(makePlugin('shop', { dependsOn: ['economy'] }));
    await guildConfig.enable('g1', 'economy');
    await command.execute(makeInteraction('enable', 'shop'));

    expect(await guildConfig.isEnabled('g1', 'shop')).toBe(true);
  });

  it("devrait refuser d'activer un plugin alwaysEnabled", async () => {
    core.plugins.push(makePlugin('core'));
    core.alwaysEnabled.push('core');
    const interaction = makeInteraction('enable', 'core');
    await command.execute(interaction);

    expect(replyText(interaction)).toMatch(/toujours actif/);
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it('devrait traduire "plugin introuvable" selon la locale de l\'interaction', async () => {
    const interaction = makeInteraction('enable', 'inexistant');
    interaction.locale = 'de';
    await command.execute(interaction);
    expect(replyText(interaction)).toBe('Plugin nicht gefunden: `inexistant`');
  });

  it('devrait traduire le pluriel des dépendances manquantes (une seule)', async () => {
    const dep = makePlugin('dep');
    const plugin = makePlugin('needs-dep', { dependsOn: ['dep'] });
    core.plugins = [dep, plugin];
    const interaction = makeInteraction('enable', 'needs-dep');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toBe('`needs-dep` depends on `dep`. Enable this plugin first.');
  });

  it('devrait traduire le pluriel des dépendances manquantes (plusieurs)', async () => {
    const dep1 = makePlugin('dep1');
    const dep2 = makePlugin('dep2');
    const plugin = makePlugin('needs-deps', { dependsOn: ['dep1', 'dep2'] });
    core.plugins = [dep1, dep2, plugin];
    const interaction = makeInteraction('enable', 'needs-deps');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toBe(
      '`needs-deps` depends on `dep1`, `dep2`. Enable these plugins first.',
    );
  });
});

describe('/nexis disable', () => {
  it('devrait désactiver le plugin demandé', async () => {
    await guildConfig.enable('g1', 'welcome');
    await command.execute(makeInteraction('disable', 'welcome'));
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(false);
  });

  it('devrait resynchroniser les commandes', async () => {
    await guildConfig.enable('g1', 'welcome');
    await command.execute(makeInteraction('disable', 'welcome'));
    expect(core.commandSync.syncGuild).toHaveBeenCalledWith('g1');
  });

  it('devrait refuser si un plugin activé en dépend', async () => {
    core.plugins.push(makePlugin('shop', { dependsOn: ['economy'] }));
    await guildConfig.enable('g1', 'economy');
    await guildConfig.enable('g1', 'shop');

    const interaction = makeInteraction('disable', 'economy');
    await command.execute(interaction);

    expect(await guildConfig.isEnabled('g1', 'economy')).toBe(true);
    expect(replyText(interaction)).toContain('shop');
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it('devrait refuser de désactiver un plugin alwaysEnabled, sans fausse confirmation', async () => {
    core.plugins.push(makePlugin('core'));
    core.alwaysEnabled.push('core');
    const interaction = makeInteraction('disable', 'core');
    await command.execute(interaction);

    expect(replyText(interaction)).toMatch(/toujours actif/);
    expect(replyText(interaction)).not.toMatch(/désactivé/);
    expect(core.commandSync.syncGuild).not.toHaveBeenCalled();
  });

  it("devrait traduire le message de succès selon la locale de l'interaction", async () => {
    await guildConfig.enable('g1', 'welcome');
    const interaction = makeInteraction('disable', 'welcome');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toBe('`welcome` disabled on this server.');
  });
});

describe('/nexis info', () => {
  it('devrait afficher version et description', async () => {
    const interaction = makeInteraction('info', 'welcome');
    await command.execute(interaction);
    expect(replyText(interaction)).toContain('1.0.0');
    expect(replyText(interaction)).toContain('plugin welcome');
  });

  it('devrait afficher le schéma de configuration', async () => {
    core.plugins.push(
      makePlugin('greet', { config: { msg: { type: 'string', label: 'Message', default: 'Yo' } } }),
    );
    const interaction = makeInteraction('info', 'greet');
    await command.execute(interaction);
    expect(replyText(interaction)).toContain('Message');
    expect(replyText(interaction)).toContain('Yo');
  });

  it('devrait refuser un plugin inexistant', async () => {
    const interaction = makeInteraction('info', 'fantôme');
    await command.execute(interaction);
    expect(replyText(interaction)).toMatch(/introuvable|inconnu/i);
  });

  it("devrait traduire le statut selon la locale de l'interaction", async () => {
    await guildConfig.enable('g1', 'welcome');
    const interaction = makeInteraction('info', 'welcome');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toContain('enabled');
  });
});

describe('/nexis errors', () => {
  it('devrait refuser un utilisateur non-owner', async () => {
    const interaction = makeInteraction('errors', undefined, 'quelqu-un-d-autre');
    await command.execute(interaction);
    expect(replyText(interaction)).toMatch(/réservée|propriétaire/i);
    expect(core.errorReporting.getRecent).not.toHaveBeenCalled();
  });

  it('devrait afficher un message quand le buffer est vide', async () => {
    const interaction = makeInteraction('errors', undefined, 'owner-123');
    await command.execute(interaction);
    expect(replyText(interaction)).toMatch(/aucune erreur/i);
  });

  it('devrait traduire le message "aucune erreur" selon la locale de l\'interaction', async () => {
    const interaction = makeInteraction('errors', undefined, 'owner-123');
    interaction.locale = 'en-US';
    await command.execute(interaction);
    expect(replyText(interaction)).toBe('No recent errors.');
  });

  it('devrait lister les erreurs récentes', async () => {
    core.errorReporting.getRecent.mockResolvedValue([
      {
        id: 'abc12345',
        timestamp: '2026-01-01T10:00:00.000Z',
        level: 'error',
        message: 'quelque chose a cassé',
        context: { plugin: 'welcome' },
      },
    ]);
    const interaction = makeInteraction('errors', undefined, 'owner-123');
    await command.execute(interaction);
    const text = replyText(interaction);
    expect(text).toContain('abc12345');
    expect(text).toContain('quelque chose a cassé');
  });

  it('devrait tronquer un message long pour rester sous la limite Discord', async () => {
    core.errorReporting.getRecent.mockResolvedValue([
      {
        id: 'abc12345',
        timestamp: '2026-01-01T10:00:00.000Z',
        level: 'error',
        message: 'x'.repeat(3000),
        context: {},
      },
    ]);
    const interaction = makeInteraction('errors', undefined, 'owner-123');
    await command.execute(interaction);
    expect(replyText(interaction).length).toBeLessThan(2000);
  });

  it('ne devrait pas inliner la stack complète, même quand le contexte en porte une', async () => {
    // Stack réaliste : ~20 frames, du même ordre de grandeur que ce que
    // errorStack() (errors.js) produit réellement sur les ~20 sites d'appel
    // existants de logger.error() dans le core (700-2500 caractères).
    const realisticStack = `Error: échec\n${Array.from(
      { length: 20 },
      (_, i) => `    at handler${i} (/app/plugins/x/index.js:${10 + i}:5)`,
    ).join('\n')}`;
    expect(realisticStack.length).toBeGreaterThan(700);

    core.errorReporting.getRecent.mockResolvedValue([
      {
        id: 'abc12345',
        timestamp: '2026-01-01T10:00:00.000Z',
        level: 'error',
        message: 'quelque chose a cassé',
        context: { plugin: 'welcome', stack: realisticStack },
      },
    ]);
    const interaction = makeInteraction('errors', undefined, 'owner-123');
    await command.execute(interaction);
    const text = replyText(interaction);

    expect(text).toContain('abc12345');
    expect(text).toContain('welcome');
    expect(text).not.toContain(realisticStack);
    // La ligne entière (id + timestamp + message + contexte tronqué) reste
    // très en dessous du budget total : la stack ne doit pas y contribuer.
    expect(text.length).toBeLessThan(400);
  });

  it('devrait laisser tenir 10 entrées avec stacks réalistes sous le cap de troncature', async () => {
    /** @param {number} n */
    const realisticStack = (n) =>
      `Error: échec ${n}\n${Array.from(
        { length: 15 },
        (_, i) => `    at handler${i} (/app/plugins/x/index.js:${10 + i}:5)`,
      ).join('\n')}`;

    /** @type {import('../../../../src/core/reporting/driver.js').ReportEntry[]} */
    const entries = Array.from({ length: 10 }, (_, n) => ({
      id: `abc${String(n).padStart(5, '0')}`,
      timestamp: '2026-01-01T10:00:00.000Z',
      level: /** @type {'error'} */ ('error'),
      message: `erreur numéro ${n}`,
      context: { plugin: 'welcome', stack: realisticStack(n) },
    }));
    core.errorReporting.getRecent.mockResolvedValue(entries);

    const interaction = makeInteraction('errors', undefined, 'owner-123');
    await command.execute(interaction);
    const text = replyText(interaction);

    // Le plafond Discord (2000) est respecté...
    expect(text.length).toBeLessThan(2000);
    // ...mais surtout, ce n'est pas ~1 seule entrée qui tient dans le budget :
    // la plupart des 10 doivent apparaître, preuve que chaque entrée ne
    // consomme plus tout le budget de troncature à elle seule.
    const idsPresent = entries.filter((entry) => text.includes(entry.id)).length;
    expect(idsPresent).toBeGreaterThanOrEqual(8);
  });
});

describe('locale', () => {
  it('devrait fixer la locale du serveur et confirmer dans la nouvelle langue', async () => {
    const interaction = {
      guildId: 'g1',
      user: { id: 'owner-123' },
      locale: 'fr',
      reply: vi.fn(),
      options: {
        getSubcommand: () => 'locale',
        getString: () => 'de',
      },
    };
    await command.execute(interaction);
    expect(await guildConfig.getLocale('g1')).toBe('de');
    expect(replyText(interaction)).toBe('Serversprache auf Deutsch gesetzt.');
  });
});
