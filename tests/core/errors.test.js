import { describe, it, expect } from 'vitest';
import {
  NexisError,
  ConfigError,
  PluginError,
  DependencyError,
  HttpError,
  newErrorId,
} from '../../src/core/errors.js';

describe('NexisError', () => {
  it('devrait conserver le message et le contexte', () => {
    const err = new NexisError('boom', { guildId: '123' });
    expect(err.message).toBe('boom');
    expect(err.context).toEqual({ guildId: '123' });
  });

  it('devrait avoir un contexte vide par défaut', () => {
    expect(new NexisError('boom').context).toEqual({});
  });

  it('devrait rester une instance de Error', () => {
    expect(new NexisError('boom')).toBeInstanceOf(Error);
  });
});

describe('sous-classes', () => {
  it('devrait exposer un code distinct par type', () => {
    expect(new ConfigError('x').code).toBe('CONFIG_ERROR');
    expect(new PluginError('x').code).toBe('PLUGIN_ERROR');
    expect(new DependencyError('x').code).toBe('DEPENDENCY_ERROR');
  });

  it('devrait porter son propre nom de classe', () => {
    expect(new ConfigError('x').name).toBe('ConfigError');
  });

  it('devrait hériter de NexisError', () => {
    expect(new PluginError('x')).toBeInstanceOf(NexisError);
  });
});

describe('newErrorId', () => {
  it('devrait retourner 8 caractères alphanumériques', () => {
    expect(newErrorId()).toMatch(/^[a-z0-9]{8}$/);
  });

  it('devrait produire des identifiants différents', () => {
    expect(newErrorId()).not.toBe(newErrorId());
  });
});

describe('HttpError', () => {
  it('devrait porter le statut HTTP à renvoyer', () => {
    const error = new HttpError(403, 'Interdit');
    expect(error.status).toBe(403);
    expect(error.message).toBe('Interdit');
  });

  it('devrait rester une NexisError avec son code propre', () => {
    const error = new HttpError(404, 'Introuvable', { path: '/x' });
    expect(error).toBeInstanceOf(NexisError);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.context).toEqual({ path: '/x' });
  });
});
