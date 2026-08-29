import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../src/core/logger.js';

describe('createLogger', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let stdout;
  /** @type {ReturnType<typeof vi.spyOn>} */
  let stderr;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('devrait écrire un message info sur stdout', () => {
    createLogger({ level: 'info' }).info('démarrage');
    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout.mock.calls[0][0]).toContain('démarrage');
  });

  it('devrait écrire un message debug sur stdout', () => {
    createLogger({ level: 'debug' }).debug('détail');
    expect(stdout).toHaveBeenCalledOnce();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('devrait écrire un message warn sur stderr', () => {
    createLogger({ level: 'info' }).warn('attention');
    expect(stderr).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
  });

  it('devrait écrire un message error sur stderr', () => {
    createLogger({ level: 'info' }).error('échec');
    expect(stderr).toHaveBeenCalledOnce();
    expect(stdout).not.toHaveBeenCalled();
  });

  it('devrait taire les messages sous le niveau configuré', () => {
    createLogger({ level: 'warn' }).info('invisible');
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('devrait laisser passer les messages au-dessus du niveau', () => {
    createLogger({ level: 'warn' }).error('visible');
    expect(stderr).toHaveBeenCalledOnce();
  });

  it('devrait préfixer la sortie du logger enfant', () => {
    createLogger({ level: 'info' }).child('plugin:welcome').info('prêt');
    expect(stdout.mock.calls[0][0]).toContain('[plugin:welcome]');
  });

  it('devrait sérialiser le contexte fourni', () => {
    createLogger({ level: 'info' }).error('échec', { guildId: '42' });
    expect(stderr.mock.calls[0][0]).toContain('guildId');
    expect(stderr.mock.calls[0][0]).toContain('42');
  });

  it('devrait imbriquer les préfixes des enfants successifs', () => {
    createLogger({ level: 'info' }).child('a').child('b').info('x');
    expect(stdout.mock.calls[0][0]).toContain('[a][b]');
  });

  it('devrait surcharger le niveau pour un logger enfant', () => {
    const child = createLogger({ level: 'warn' }).child('bruyant', { level: 'debug' });
    child.debug('visible malgré le niveau parent');
    expect(stdout).toHaveBeenCalledOnce();
  });

  it('devrait propager le niveau surchargé aux petits-enfants', () => {
    const grandchild = createLogger({ level: 'warn' }).child('a', { level: 'debug' }).child('b');
    grandchild.debug('toujours visible');
    expect(stdout).toHaveBeenCalledOnce();
  });

  it('ne devrait pas colorer la sortie hors TTY', () => {
    createLogger({ level: 'info' }).error('sans couleur');
    // eslint-disable-next-line no-control-regex
    expect(stderr.mock.calls[0][0]).not.toMatch(/\x1b\[/);
  });

  it('devrait colorer la sortie en TTY', () => {
    const original = process.stderr.isTTY;
    process.stderr.isTTY = true;
    try {
      createLogger({ level: 'info' }).error('coloré');
      // eslint-disable-next-line no-control-regex
      expect(stderr.mock.calls[0][0]).toMatch(/\x1b\[/);
    } finally {
      process.stderr.isTTY = original;
    }
  });

  describe('onError', () => {
    it('devrait être déclenché sur .error() avec une entrée complète', () => {
      /** @type {import('../../src/core/reporting/driver.js').ReportEntry[]} */
      const entries = [];
      createLogger({ level: 'info', onError: (entry) => entries.push(entry) }).error('boom', {
        plugin: 'x',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        level: 'error',
        message: 'boom',
        context: { plugin: 'x' },
      });
      expect(entries[0].id).toMatch(/^[a-f0-9]{8}$/);
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('ne devrait pas être déclenché sur .warn()/.info()/.debug()', () => {
      /** @type {unknown[]} */
      const entries = [];
      const logger = createLogger({ level: 'debug', onError: (entry) => entries.push(entry) });
      logger.debug('x');
      logger.info('x');
      logger.warn('x');
      expect(entries).toHaveLength(0);
    });

    it('devrait être propagé aux loggers enfants', () => {
      /** @type {unknown[]} */
      const entries = [];
      createLogger({ level: 'info', onError: (entry) => entries.push(entry) })
        .child('p')
        .error('boom');
      expect(entries).toHaveLength(1);
    });

    it('ne devrait rien faire si onError est absent', () => {
      expect(() => createLogger({ level: 'info' }).error('sans callback')).not.toThrow();
    });

    it('devrait réutiliser context.errorId comme id du rapport quand présent', () => {
      /** @type {import('../../src/core/reporting/driver.js').ReportEntry[]} */
      const entries = [];
      createLogger({ level: 'info', onError: (entry) => entries.push(entry) }).error('boom', {
        errorId: 'deadbeef',
        plugin: 'x',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('deadbeef');
    });

    it('devrait minter un id frais quand context.errorId est absent ou pas une chaîne', () => {
      /** @type {import('../../src/core/reporting/driver.js').ReportEntry[]} */
      const entries = [];
      const logger = createLogger({ level: 'info', onError: (entry) => entries.push(entry) });
      logger.error('boom sans errorId');
      logger.error('boom avec errorId invalide', { errorId: 42 });

      expect(entries).toHaveLength(2);
      expect(entries[0].id).toMatch(/^[a-f0-9]{8}$/);
      expect(entries[1].id).toMatch(/^[a-f0-9]{8}$/);
    });
  });
});
