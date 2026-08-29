import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ConfigError } from '../src/core/errors.js';

const validEnv = { DISCORD_TOKEN: 'tok', DISCORD_CLIENT_ID: '123' };

describe('loadConfig', () => {
  it('devrait retourner une config complète avec les variables requises', () => {
    const config = loadConfig(validEnv);
    expect(config.token).toBe('tok');
    expect(config.clientId).toBe('123');
  });

  it('devrait appliquer les valeurs par défaut', () => {
    const config = loadConfig(validEnv);
    expect(config.logLevel).toBe('info');
    expect(config.storage.driver).toBe('json');
    expect(config.storage.path).toBe('./data/nexis.json');
    expect(config.pluginsDir).toBe('./plugins');
  });

  it('devrait lever une ConfigError si le token manque', () => {
    expect(() => loadConfig({ DISCORD_CLIENT_ID: '123' })).toThrow(ConfigError);
  });

  it("devrait nommer la variable manquante dans le message d'erreur", () => {
    expect(() => loadConfig({ DISCORD_CLIENT_ID: '123' })).toThrow(/DISCORD_TOKEN/);
  });

  it('devrait lever une ConfigError si le client id manque', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'tok' })).toThrow(/DISCORD_CLIENT_ID/);
  });

  it('devrait rejeter un driver de storage inconnu', () => {
    expect(() => loadConfig({ ...validEnv, STORAGE_DRIVER: 'mysql' })).toThrow(/mysql/);
  });

  it('devrait accepter le driver sqlite', () => {
    expect(loadConfig({ ...validEnv, STORAGE_DRIVER: 'sqlite' }).storage.driver).toBe('sqlite');
  });

  it('devrait rejeter un niveau de log inconnu', () => {
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(/verbose/);
  });

  it('devrait respecter un chemin de storage explicite', () => {
    const config = loadConfig({ ...validEnv, STORAGE_PATH: '/tmp/x.json' });
    expect(config.storage.path).toBe('/tmp/x.json');
  });

  it('devrait exposer ownerId quand la variable est fournie', () => {
    expect(loadConfig({ ...validEnv, OWNER_ID: '77' }).ownerId).toBe('77');
  });

  it('devrait laisser ownerId indéfini par défaut', () => {
    expect(loadConfig(validEnv).ownerId).toBeUndefined();
  });
});
