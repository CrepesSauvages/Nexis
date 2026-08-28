import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadPlugins } from './loader.js';

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'tests',
  'fixtures',
  'plugins',
);

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
    const logger = silentLogger();
    await loadPlugins({ dir: fixtures, logger });
    expect(logger.warn).toHaveBeenCalledTimes(2);
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
});
