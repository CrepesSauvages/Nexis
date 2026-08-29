import { describe, it, expect, vi } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyConventions } from '../../src/core/conventions.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'fixtures', 'plugins');

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

const makeCtx = () => ({
  registerCommand: vi.fn(),
  registerEvent: vi.fn(),
  registerJob: vi.fn(),
});

/**
 * @param {string} name
 * @returns {import('../../src/core/loader.js').LoadedPlugin}
 */
const makePlugin = (name) => ({
  name,
  manifest: { name, version: '1.0.0' },
  setup: () => {},
  dir: join(fixtures, name),
});

const epsilon = makePlugin('epsilon');
const alpha = makePlugin('alpha');

/**
 * Appelle applyConventions avec des doublures de test (mocks vi.fn) qui ne
 * couvrent que les propriétés utilisées par la convention — le cast passe
 * par `unknown` car ces doublures ne recouvrent volontairement pas tout
 * PluginContext/Logger.
 *
 * @param {import('../../src/core/loader.js').LoadedPlugin} plugin
 * @param {ReturnType<typeof makeCtx>} ctx
 * @param {ReturnType<typeof makeLogger>} logger
 */
const run = (plugin, ctx, logger) =>
  applyConventions({
    plugin,
    ctx: /** @type {import('../../src/core/context.js').PluginContext} */ (
      /** @type {unknown} */ (ctx)
    ),
    logger: /** @type {import('../../src/core/logger.js').Logger} */ (
      /** @type {unknown} */ (logger)
    ),
  });

describe('applyConventions', () => {
  it('devrait enregistrer les commandes du dossier commands/', async () => {
    const ctx = makeCtx();
    await run(epsilon, ctx, makeLogger());
    expect(ctx.registerCommand).toHaveBeenCalledOnce();
    expect(ctx.registerCommand.mock.calls[0][0].data.name).toBe('ping');
  });

  it("devrait dériver le nom d'event du nom de fichier", async () => {
    const ctx = makeCtx();
    await run(epsilon, ctx, makeLogger());
    expect(ctx.registerEvent).toHaveBeenCalledWith('guildMemberAdd', expect.any(Function));
  });

  it('devrait enregistrer les jobs avec leur expression cron', async () => {
    const ctx = makeCtx();
    await run(epsilon, ctx, makeLogger());
    expect(ctx.registerJob).toHaveBeenCalledWith('0 9 * * *', expect.any(Function));
  });

  it("devrait retourner le nombre d'éléments enregistrés", async () => {
    const count = await run(epsilon, makeCtx(), makeLogger());
    expect(count).toBe(3);
  });

  it('devrait passer le contexte à la fabrique', async () => {
    const ctx = makeCtx();
    await run(epsilon, ctx, makeLogger());
    // La fabrique de ping reçoit ctx et retourne la définition de commande.
    expect(ctx.registerCommand.mock.calls[0][0].execute).toBeTypeOf('function');
  });

  it('devrait avertir sur un module sans export par défaut', async () => {
    const logger = makeLogger();
    await run(epsilon, makeCtx(), logger);
    const messages = logger.warn.mock.calls.map((call) => call[0]);
    expect(messages.some((message) => message.includes('invalide'))).toBe(true);
  });

  it("devrait avertir si l'export par défaut n'est pas une fabrique", async () => {
    const logger = makeLogger();
    await run(epsilon, makeCtx(), logger);
    const messages = logger.warn.mock.calls.map((call) => call[0]);
    expect(messages.some((message) => message.includes('pas-fabrique'))).toBe(true);
  });

  it('devrait avertir une fois par module mal formé', async () => {
    const logger = makeLogger();
    await run(epsilon, makeCtx(), logger);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('devrait ne rien faire pour un plugin sans dossiers de convention', async () => {
    const ctx = makeCtx();
    const count = await run(alpha, ctx, makeLogger());
    expect(count).toBe(0);
    expect(ctx.registerCommand).not.toHaveBeenCalled();
  });

  it('devrait ignorer les fichiers de test', async () => {
    const ctx = makeCtx();
    const logger = makeLogger();
    await run(epsilon, ctx, logger);
    // Seul ping.js est une commande valide. `ping.test.js` (fixture dédiée,
    // export par défaut délibérément invalide) prouve le filtre : sans lui,
    // il serait importé et déclencherait un avertissement le nommant — le
    // test resterait vert par accident sans cette seconde assertion, vu
    // qu'un export par défaut invalide n'incrémente jamais registerCommand.
    expect(ctx.registerCommand).toHaveBeenCalledOnce();
    const messages = logger.warn.mock.calls.map((call) => call[0]);
    expect(messages.some((message) => message.includes('ping.test.js'))).toBe(false);
  });
});
