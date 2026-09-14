import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../src/core/storage/drivers/json.js';
import { createGuildConfig } from '../../src/core/guild-config.js';

/** @type {string} */
let dir;
/** @type {import('../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {ReturnType<typeof createGuildConfig>} */
let guildConfig;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-gc-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  guildConfig = createGuildConfig({ storage });
});

afterEach(async () => {
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('activation des plugins', () => {
  it('devrait démarrer sans aucun plugin activé', async () => {
    expect(await guildConfig.enabledPlugins('g1')).toEqual([]);
  });

  it('devrait activer un plugin', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(true);
  });

  it('devrait désactiver un plugin', async () => {
    await guildConfig.enable('g1', 'welcome');
    await guildConfig.disable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g1', 'welcome')).toBe(false);
  });

  it('devrait isoler les guilds entre elles', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.isEnabled('g2', 'welcome')).toBe(false);
  });

  it('devrait tolérer une double activation', async () => {
    await guildConfig.enable('g1', 'welcome');
    await guildConfig.enable('g1', 'welcome');
    expect(await guildConfig.enabledPlugins('g1')).toEqual(['welcome']);
  });

  it("devrait tolérer la désactivation d'un plugin inactif", async () => {
    await expect(guildConfig.disable('g1', 'absent')).resolves.not.toThrow();
  });

  it('devrait persister les activations dans le storage', async () => {
    await guildConfig.enable('g1', 'welcome');
    expect(await storage.get('core:guild:g1:enabled')).toEqual(['welcome']);
  });

  it('devrait relire depuis le storage après invalidation du cache', async () => {
    await storage.set('core:guild:g1:enabled', ['injecté']);
    guildConfig.invalidate('g1');
    expect(await guildConfig.enabledPlugins('g1')).toEqual(['injecté']);
  });

  it('ne devrait pas exposer une référence mutable au cache', async () => {
    await guildConfig.enable('g1', 'welcome');
    const plugins1 = await guildConfig.enabledPlugins('g1');
    plugins1.push('mutated');
    const plugins2 = await guildConfig.enabledPlugins('g1');
    expect(plugins2).toEqual(['welcome']);
  });
});

describe('locale par serveur', () => {
  it('devrait démarrer sans override de locale', async () => {
    expect(await guildConfig.getLocale('g1')).toBeUndefined();
  });

  it('devrait fixer puis lire la locale', async () => {
    await guildConfig.setLocale('g1', 'de');
    expect(await guildConfig.getLocale('g1')).toBe('de');
  });

  it('devrait isoler les guilds entre elles', async () => {
    await guildConfig.setLocale('g1', 'de');
    expect(await guildConfig.getLocale('g2')).toBeUndefined();
  });

  it('devrait persister la locale dans le storage', async () => {
    await guildConfig.setLocale('g1', 'pl');
    expect(await storage.get('core:guild:g1:locale')).toBe('pl');
  });

  it('devrait remplacer une locale déjà fixée', async () => {
    await guildConfig.setLocale('g1', 'de');
    await guildConfig.setLocale('g1', 'es');
    expect(await guildConfig.getLocale('g1')).toBe('es');
  });

  it('invalidate() devrait vider le cache de locale de la guild', async () => {
    await guildConfig.setLocale('g1', 'de');
    await storage.set('core:guild:g1:locale', 'pl');
    guildConfig.invalidate('g1');
    expect(await guildConfig.getLocale('g1')).toBe('pl');
  });
});

describe('configuration des plugins', () => {
  const schema = {
    message: { type: 'string', label: 'Message', default: 'Salut' },
    channelId: { type: 'channel', label: 'Salon', required: true },
  };

  it('devrait retourner les valeurs par défaut du schéma', async () => {
    expect(await guildConfig.getConfig('g1', 'welcome', schema)).toEqual({ message: 'Salut' });
  });

  it('devrait fusionner les valeurs stockées avec les défauts', async () => {
    await guildConfig.setConfig('g1', 'welcome', { channelId: '99' });
    expect(await guildConfig.getConfig('g1', 'welcome', schema)).toEqual({
      message: 'Salut',
      channelId: '99',
    });
  });

  it('devrait laisser une valeur stockée écraser son défaut', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    expect((await guildConfig.getConfig('g1', 'welcome', schema)).message).toBe('Yo');
  });

  it('devrait fusionner les écritures successives', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    await guildConfig.setConfig('g1', 'welcome', { channelId: '99' });
    const config = await guildConfig.getConfig('g1', 'welcome', schema);
    expect(config).toEqual({ message: 'Yo', channelId: '99' });
  });

  it('devrait isoler la config entre plugins', async () => {
    await guildConfig.setConfig('g1', 'welcome', { message: 'Yo' });
    expect(await guildConfig.getConfig('g1', 'autre', {})).toEqual({});
  });

  it('devrait retourner un objet vide sans schéma ni valeurs', async () => {
    expect(await guildConfig.getConfig('g1', 'welcome', undefined)).toEqual({});
  });
});

describe('écritures concurrentes', () => {
  /**
   * Un storage dont chaque `set` prend un tour de boucle : sans
   * sérialisation, deux `enable` lancés ensemble lisent la même liste avant
   * que l'un des deux n'ait écrit.
   * @param {number} [delay]
   * @returns {import('../../src/core/storage/driver.js').StorageDriver}
   */
  const slowStorage = (delay = 5) => {
    /** @type {Map<string, unknown>} */
    const data = new Map();
    /** @type {import('../../src/core/storage/driver.js').StorageDriver} */
    const driver = {
      async init() {},
      async close() {},
      async get(key) {
        return data.get(key);
      },
      async set(key, value) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        data.set(key, value);
      },
      async delete(key) {
        data.delete(key);
      },
      async keys(prefix) {
        return [...data.keys()].filter((key) => key.startsWith(prefix));
      },
      raw: () => data,
    };
    return driver;
  };

  it('devrait conserver les deux plugins de deux activations simultanées', async () => {
    const guildConfig = createGuildConfig({ storage: slowStorage() });
    await Promise.all([guildConfig.enable('g1', 'alpha'), guildConfig.enable('g1', 'beta')]);
    expect((await guildConfig.enabledPlugins('g1')).sort()).toEqual(['alpha', 'beta']);
  });

  it('devrait conserver les deux clés de deux écritures de configuration simultanées', async () => {
    const guildConfig = createGuildConfig({ storage: slowStorage() });
    await Promise.all([
      guildConfig.setConfig('g1', 'alpha', { a: 1 }),
      guildConfig.setConfig('g1', 'alpha', { b: 2 }),
    ]);
    expect(await guildConfig.getConfig('g1', 'alpha', undefined)).toEqual({ a: 1, b: 2 });
  });

  it('devrait ne pas faire attendre un serveur derrière un autre', async () => {
    // Deux serveurs distincts ont deux files distinctes : leurs écritures se
    // recouvrent dans le temps au lieu de s'enchaîner. Seuil à 80 ms (au lieu
    // de 10 ms) : sérialisé ça prendrait 100 ms contre 50 ms en parallèle, et
    // 80 ms sépare sans ambiguïté malgré la granularité des timers Windows
    // (~16 ms).
    const guildConfig = createGuildConfig({ storage: slowStorage(50) });
    const started = Date.now();
    await Promise.all([guildConfig.enable('g1', 'alpha'), guildConfig.enable('g2', 'alpha')]);
    expect(Date.now() - started).toBeLessThan(80);
  });

  it('devrait continuer à écrire après un échec', async () => {
    // La file avale le rejet pour ne pas bloquer les écritures suivantes,
    // mais l'appelant du `set` fautif reçoit bien son erreur.
    let calls = 0;
    /** @type {Map<string, unknown>} */
    const data = new Map();
    /** @type {import('../../src/core/storage/driver.js').StorageDriver} */
    const storage = {
      async init() {},
      async close() {},
      async get(key) {
        return data.get(key);
      },
      async set(key, value) {
        calls += 1;
        if (calls === 1) throw new Error('disque plein');
        data.set(key, value);
      },
      async delete(key) {
        data.delete(key);
      },
      async keys(prefix) {
        return [...data.keys()].filter((key) => key.startsWith(prefix));
      },
      raw: () => data,
    };

    const guildConfig = createGuildConfig({ storage });
    await expect(guildConfig.enable('g1', 'alpha')).rejects.toThrow('disque plein');
    await guildConfig.enable('g1', 'beta');
    expect(await guildConfig.enabledPlugins('g1')).toEqual(['beta']);
  });
});

describe('permissions de commande par serveur', () => {
  it("devrait rendre undefined quand aucune surcharge n'est définie", async () => {
    const config = createGuildConfig({ storage });
    expect(await config.getCommandRoles('g1', 'purge')).toBeUndefined();
  });

  it('devrait enregistrer puis relire les rôles autorisés', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1', 'r2']);
    expect(await config.getCommandRoles('g1', 'purge')).toEqual(['r1', 'r2']);
  });

  it('devrait distinguer une liste vide d’une absence de surcharge', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', []);
    expect(await config.getCommandRoles('g1', 'purge')).toEqual([]);
  });

  it('devrait retirer la surcharge avec undefined', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1']);
    await config.setCommandRoles('g1', 'purge', undefined);
    expect(await config.getCommandRoles('g1', 'purge')).toBeUndefined();
  });

  it('devrait garder les serveurs indépendants', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1']);
    expect(await config.getCommandRoles('g2', 'purge')).toBeUndefined();
  });

  it('devrait lister toutes les surcharges du serveur', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1']);
    await config.setCommandRoles('g1', 'lock', []);
    expect(await config.allCommandRoles('g1')).toEqual({ purge: ['r1'], lock: [] });
  });

  it('ne devrait pas laisser muter la liste rendue', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1']);
    const roles = /** @type {string[]} */ (await config.getCommandRoles('g1', 'purge'));
    roles.push('intrus');
    expect(await config.getCommandRoles('g1', 'purge')).toEqual(['r1']);
  });

  it('devrait relire le storage après invalidate', async () => {
    const config = createGuildConfig({ storage });
    await config.setCommandRoles('g1', 'purge', ['r1']);
    await storage.set('core:guild:g1:permissions', { purge: ['ailleurs'] });
    config.invalidate('g1');
    expect(await config.getCommandRoles('g1', 'purge')).toEqual(['ailleurs']);
  });
});

describe('cache borné', () => {
  it('devrait oublier le serveur le plus anciennement utilisé', async () => {
    const config = createGuildConfig({ storage, maxCachedGuilds: 2 });
    await config.setLocale('g1', 'de');
    await config.setLocale('g2', 'es');
    await config.setLocale('g3', 'it');

    // g1 est sorti du cache : la lecture repasse par le storage, que l'on
    // modifie dans son dos pour le prouver.
    await storage.set('core:guild:g1:locale', 'pl');
    expect(await config.getLocale('g1')).toBe('pl');
    // g3, le plus récent, répond toujours depuis le cache.
    await storage.set('core:guild:g3:locale', 'nl');
    expect(await config.getLocale('g3')).toBe('it');
  });

  it('devrait garder en cache un serveur relu récemment', async () => {
    const config = createGuildConfig({ storage, maxCachedGuilds: 2 });
    await config.setLocale('g1', 'de');
    await config.setLocale('g2', 'es');
    // Relire g1 le remet en tête : c'est g2 qui doit sortir.
    await config.getLocale('g1');
    await config.setLocale('g3', 'it');

    await storage.set('core:guild:g1:locale', 'pl');
    await storage.set('core:guild:g2:locale', 'nl');
    expect(await config.getLocale('g1')).toBe('de');
    expect(await config.getLocale('g2')).toBe('nl');
  });

  it("devrait oublier d'un bloc tout ce qu'il retenait d'un serveur", async () => {
    const config = createGuildConfig({ storage, maxCachedGuilds: 1 });
    await config.enable('g1', 'welcome');
    await config.setCommandRoles('g1', 'purge', ['r1']);
    await config.setConfig('g1', 'welcome', { greeting: 'Salut' });

    // Un second serveur évince le premier, entièrement.
    await config.setLocale('g2', 'de');
    await storage.set('core:guild:g1:enabled', ['autre']);
    await storage.set('core:guild:g1:permissions', { purge: ['r9'] });
    await storage.set('core:guild:g1:config:welcome', { greeting: 'Hello' });

    expect(await config.enabledPlugins('g1')).toEqual(['autre']);
    expect(await config.getCommandRoles('g1', 'purge')).toEqual(['r9']);
    expect(await config.getConfig('g1', 'welcome', undefined)).toEqual({ greeting: 'Hello' });
  });

  it('ne devrait pas relire le storage pour une absence de locale déjà connue', async () => {
    const config = createGuildConfig({ storage });
    expect(await config.getLocale('g1')).toBeUndefined();

    // La réponse « aucun override » est une réponse : la relire du storage
    // à chaque interaction serait du travail pour rien.
    await storage.set('core:guild:g1:locale', 'pl');
    expect(await config.getLocale('g1')).toBeUndefined();
  });
});

describe('signalement des écritures', () => {
  /** @returns {{ config: ReturnType<typeof createGuildConfig>, written: string[] }} */
  const withHook = () => {
    /** @type {string[]} */
    const written = [];
    const config = createGuildConfig({
      storage,
      onWrite: (guildId) => {
        written.push(guildId);
      },
    });
    return { config, written };
  };

  it('devrait signaler une activation', async () => {
    const { config, written } = withHook();
    await config.enable('g1', 'welcome');
    expect(written).toEqual(['g1']);
  });

  it('devrait signaler une écriture de configuration', async () => {
    const { config, written } = withHook();
    await config.setConfig('g1', 'welcome', { greeting: 'Salut' });
    expect(written).toEqual(['g1']);
  });

  it('devrait signaler un changement de langue et de permissions', async () => {
    const { config, written } = withHook();
    await config.setLocale('g1', 'de');
    await config.setCommandRoles('g1', 'purge', ['r1']);
    expect(written).toEqual(['g1', 'g1']);
  });

  it("ne devrait rien signaler quand l'écriture est un no-op", async () => {
    const { config, written } = withHook();
    await config.enable('g1', 'welcome');
    // Déjà activé : `enable` rend la main sans écrire.
    await config.enable('g1', 'welcome');
    await config.disable('g1', 'absent');
    expect(written).toEqual(['g1']);
  });

  it('ne devrait pas faire échouer une écriture si le signal lève', async () => {
    const config = createGuildConfig({
      storage,
      onWrite: () => {
        throw new Error('bus HS');
      },
    });

    // Prévenir les autres process est un effet de bord de l'écriture, pas
    // une condition de sa réussite.
    await expect(config.enable('g1', 'welcome')).resolves.toBeUndefined();
    expect(await config.enabledPlugins('g1')).toEqual(['welcome']);
  });
});
