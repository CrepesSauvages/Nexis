import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { installProcessGuards } from '../../src/core/process-guards.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

/** @type {EventEmitter} */
let target;
/** @type {ReturnType<typeof vi.fn<(code: number) => void>>} */
let exit;
/** @type {{ info: ReturnType<typeof vi.fn>, error: ReturnType<typeof vi.fn> }} */
let logs;

/**
 * Logger réduit aux deux niveaux que ce module emploie. Les doublures
 * rendent les assertions directes, sans passer par les flux du process.
 * @returns {import('../../src/core/logger.js').Logger}
 */
const asLogger = () =>
  /** @type {import('../../src/core/logger.js').Logger} */ (/** @type {unknown} */ (logs));

beforeEach(() => {
  target = new EventEmitter();
  exit = vi.fn();
  logs = { info: vi.fn(), error: vi.fn() };
});

const install = (options = {}) =>
  installProcessGuards({
    logger: asLogger(),
    shutdown: async () => {},
    target,
    exit,
    ...options,
  });

describe('installProcessGuards', () => {
  it('devrait arrêter proprement sur SIGINT', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    install({ shutdown });

    target.emit('SIGINT');
    await flush();

    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('devrait arrêter proprement sur SIGTERM', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    install({ shutdown });

    target.emit('SIGTERM');
    await flush();

    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("ne devrait arrêter qu'une fois sur deux signaux", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    install({ shutdown });

    target.emit('SIGINT');
    target.emit('SIGINT');
    target.emit('SIGTERM');
    await flush();

    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('devrait journaliser un rejet non traité sans arrêter le bot', async () => {
    const shutdown = vi.fn();
    install({ shutdown });

    target.emit('unhandledRejection', new Error('promesse oubliée'));
    await flush();

    expect(logs.error.mock.calls[0][0]).toContain('promesse oubliée');
    expect(shutdown).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("devrait journaliser un rejet dont la raison n'est pas une Error", async () => {
    install();

    target.emit('unhandledRejection', 'juste une chaîne');
    await flush();

    expect(logs.error.mock.calls[0][0]).toContain('juste une chaîne');
  });

  it('devrait arrêter avec un code non nul sur exception non interceptée', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    install({ shutdown });

    target.emit('uncaughtException', new Error('boum'));
    await flush();

    expect(logs.error.mock.calls[0][0]).toContain('boum');
    expect(shutdown).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('devrait sortir quand même si shutdown échoue', async () => {
    install({ shutdown: async () => Promise.reject(new Error('storage bloqué')) });

    target.emit('SIGTERM');
    await flush();
    await flush();

    expect(logs.error.mock.calls[0][0]).toContain('storage bloqué');
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('devrait sortir quand même si shutdown ne rend jamais la main', async () => {
    vi.useFakeTimers();
    install({ shutdown: () => new Promise(() => {}), timeoutMs: 50 });

    target.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(60);

    expect(logs.error.mock.calls[0][0]).toContain('Arrêt incomplet');
    expect(exit).toHaveBeenCalledWith(0);
    vi.useRealTimers();
  });

  it('devrait retirer ses écouteurs à la désinstallation', () => {
    const guards = install();
    expect(target.listenerCount('SIGINT')).toBe(1);
    expect(target.listenerCount('uncaughtException')).toBe(1);

    guards.uninstall();

    expect(target.listenerCount('SIGINT')).toBe(0);
    expect(target.listenerCount('uncaughtException')).toBe(0);
  });
});
