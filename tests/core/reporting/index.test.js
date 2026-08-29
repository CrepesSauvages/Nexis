import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonDriver } from '../../../src/core/storage/drivers/json.js';
import { createErrorReporting } from '../../../src/core/reporting/index.js';

vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn() }));

/** @param {Partial<import('../../../src/core/reporting/driver.js').ReportEntry>} [overrides] */
const entry = (overrides = {}) => ({
  id: 'abc12345',
  timestamp: '2026-01-01T00:00:00.000Z',
  level: /** @type {'error'} */ ('error'),
  message: 'boom',
  context: {},
  ...overrides,
});

/** @type {string} */
let dir;
/** @type {import('../../../src/core/storage/driver.js').StorageDriver} */
let storage;
/** @type {ReturnType<typeof vi.spyOn>} */
let consoleErrorSpy;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-reporting-index-'));
  storage = createJsonDriver({ path: join(dir, 's.json') });
  await storage.init();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  consoleErrorSpy.mockRestore();
  await storage.close();
  await rm(dir, { recursive: true, force: true });
});

describe('createErrorReporting', () => {
  it('devrait toujours activer le reporter local, même sans sentryDsn', async () => {
    const reporting = createErrorReporting({ storage });
    await reporting.reportAll(entry());
    expect(await reporting.getRecent()).toEqual([entry()]);
  });

  it('ne devrait pas activer Sentry si sentryDsn est absent', async () => {
    const reporting = createErrorReporting({ storage });
    await reporting.reportAll(entry());
    const Sentry = await import('@sentry/node');
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('devrait activer Sentry si sentryDsn est fourni', async () => {
    const reporting = createErrorReporting({ storage, sentryDsn: 'https://example/1' });
    await reporting.reportAll(entry());
    const Sentry = await import('@sentry/node');
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it("l'échec d'un reporter ne devrait pas empêcher les autres de recevoir l'entrée", async () => {
    const reporting = createErrorReporting({ storage, sentryDsn: 'https://example/1' });
    const Sentry = await import('@sentry/node');
    /** @type {ReturnType<typeof vi.fn>} */ (Sentry.captureException).mockImplementationOnce(() => {
      throw new Error('Sentry indisponible');
    });

    await reporting.reportAll(entry());

    expect(await reporting.getRecent()).toEqual([entry()]);
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it("l'échec du reporter local ne devrait pas remonter à l'appelant", async () => {
    const reporting = createErrorReporting({ storage });
    // NOTE : le brief forçait l'échec via `await storage.close()`, mais le
    // driver JSON ne verrouille rien à la fermeture (close() attend juste
    // la file d'écriture) — set()/get() continuent de fonctionner après.
    // On force donc l'échec directement sur set(), ce qui exerce le même
    // comportement d'isolation visé : un storage qui échoue ne doit pas
    // remonter à l'appelant de reportAll().
    vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('disque plein'));
    await expect(reporting.reportAll(entry())).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it("l'échec du reporter local ne devrait pas empêcher Sentry de recevoir l'entrée", async () => {
    const reporting = createErrorReporting({ storage, sentryDsn: 'https://example/1' });
    const Sentry = await import('@sentry/node');
    // Le mock @sentry/node est partagé par tout le fichier (pas de
    // clearMocks global) : on repart d'un compteur à zéro pour que
    // toHaveBeenCalledOnce() porte bien sur CET appel, pas sur le cumul
    // des tests précédents qui activent aussi sentryDsn.
    /** @type {ReturnType<typeof vi.fn>} */ (Sentry.captureException).mockClear();
    vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('disque plein'));

    await reporting.reportAll(entry());

    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('local'));
  });

  it('devrait transmettre limit au reporter local', async () => {
    const reporting = createErrorReporting({ storage, limit: 1 });
    await reporting.reportAll(entry({ id: 'a' }));
    await reporting.reportAll(entry({ id: 'b' }));
    const recent = await reporting.getRecent(10);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe('b');
  });
});
