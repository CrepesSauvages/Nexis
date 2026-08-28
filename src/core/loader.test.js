import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPlugins } from './loader.js';
import { DependencyError } from './errors.js';

const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests', 'fixtures');
const fixtures = join(fixturesRoot, 'plugins');
const cycleFixtures = join(fixturesRoot, 'plugins-cycle');

const silentLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => silentLogger(),
});

describe('loadPlugins', () => {
  it('devrait charger les plugins valides', async () => {
    const plugins = await loadPlugins({ dir: fixtures, logger: silentLogger() });
    expect(plugins.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
  });

  it("devrait respecter l'ordre topologique", async () => {
    const plugins = await loadPlugins({ dir: fixtures, logger: silentLogger() });
    const names = plugins.map((p) => p.name);
    expect(names.indexOf('alpha')).toBeLessThan(names.indexOf('beta'));
  });

  it('devrait écarter un plugin au manifeste invalide sans échouer', async () => {
    const plugins = await loadPlugins({ dir: fixtures, logger: silentLogger() });
    expect(plugins.map((p) => p.name)).not.toContain('Broken');
  });

  it('devrait écarter un plugin sans setup', async () => {
    const plugins = await loadPlugins({ dir: fixtures, logger: silentLogger() });
    expect(plugins.map((p) => p.name)).not.toContain('no-setup');
  });

  it('devrait logger un warn par plugin écarté', async () => {
    // 3 écartés directement (broken, no-setup, throws) + 2 écartés en cascade
    // (gamma → dépend de throws, delta → dépend de gamma) = 5.
    const logger = silentLogger();
    await loadPlugins({ dir: fixtures, logger });
    expect(logger.warn).toHaveBeenCalledTimes(5);
  });

  it('devrait exposer le manifeste et la fonction setup', async () => {
    const [first] = await loadPlugins({ dir: fixtures, logger: silentLogger() });
    expect(first.manifest.version).toBe('1.0.0');
    expect(typeof first.setup).toBe('function');
  });

  it("devrait retourner un tableau vide si le répertoire n'existe pas", async () => {
    const plugins = await loadPlugins({ dir: join(fixtures, 'absent'), logger: silentLogger() });
    expect(plugins).toEqual([]);
  });

  it("devrait écarter un plugin dont l'import lève une erreur JS sans échouer", async () => {
    const logger = silentLogger();
    const plugins = await loadPlugins({ dir: fixtures, logger });
    expect(plugins.map((p) => p.name)).not.toContain('throws');
    expect(plugins.map((p) => p.name).sort()).toEqual(['alpha', 'beta']);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('throws'),
      expect.objectContaining({ reason: expect.stringContaining('boom') }),
    );
  });

  it("devrait écarter en cascade un plugin dépendant d'un plugin déjà écarté", async () => {
    const logger = silentLogger();
    const plugins = await loadPlugins({ dir: fixtures, logger });
    // gamma dépend de throws (écarté à l'import) ; delta dépend de gamma
    // (écarté à son tour) : les deux doivent disparaître en cascade.
    expect(plugins.map((p) => p.name)).not.toContain('gamma');
    expect(plugins.map((p) => p.name)).not.toContain('delta');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('gamma'),
      expect.objectContaining({ reason: expect.stringContaining('throws') }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('delta'),
      expect.objectContaining({ reason: expect.stringContaining('gamma') }),
    );
  });

  it('devrait laisser propager un cycle de dépendances comme erreur fatale', async () => {
    // x et y chargent et valident tous les deux sans problème, mais se
    // dépendent mutuellement : contrairement à une dépendance manquante,
    // ce n'est pas un plugin écarté à récupérer, c'est un bug d'auteur.
    await expect(loadPlugins({ dir: cycleFixtures, logger: silentLogger() })).rejects.toThrow(
      DependencyError,
    );
  });
});
