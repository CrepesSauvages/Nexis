import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../../src/core/logger.js';

describe('createLogger', () => {
  /** @type {ReturnType<typeof vi.spyOn>} */
  let spy;

  beforeEach(() => {
    spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('devrait écrire un message info', () => {
    createLogger({ level: 'info' }).info('démarrage');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('démarrage');
  });

  it('devrait taire les messages sous le niveau configuré', () => {
    createLogger({ level: 'warn' }).info('invisible');
    expect(spy).not.toHaveBeenCalled();
  });

  it('devrait laisser passer les messages au-dessus du niveau', () => {
    createLogger({ level: 'warn' }).error('visible');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('devrait préfixer la sortie du logger enfant', () => {
    createLogger({ level: 'info' }).child('plugin:welcome').info('prêt');
    expect(spy.mock.calls[0][0]).toContain('[plugin:welcome]');
  });

  it('devrait sérialiser le contexte fourni', () => {
    createLogger({ level: 'info' }).error('échec', { guildId: '42' });
    expect(spy.mock.calls[0][0]).toContain('guildId');
    expect(spy.mock.calls[0][0]).toContain('42');
  });

  it('devrait imbriquer les préfixes des enfants successifs', () => {
    createLogger({ level: 'info' }).child('a').child('b').info('x');
    expect(spy.mock.calls[0][0]).toContain('[a][b]');
  });
});
