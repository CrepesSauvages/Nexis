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

  it('devrait accepter le driver postgres avec un STORAGE_PATH explicite', () => {
    const config = loadConfig({
      ...validEnv,
      STORAGE_DRIVER: 'postgres',
      STORAGE_PATH: 'postgres://localhost/nexis',
    });
    expect(config.storage.driver).toBe('postgres');
    expect(config.storage.path).toBe('postgres://localhost/nexis');
  });

  it('devrait accepter le driver mongo avec un STORAGE_PATH explicite', () => {
    const config = loadConfig({
      ...validEnv,
      STORAGE_DRIVER: 'mongo',
      STORAGE_PATH: 'mongodb://localhost/nexis',
    });
    expect(config.storage.driver).toBe('mongo');
    expect(config.storage.path).toBe('mongodb://localhost/nexis');
  });

  it('devrait lever une ConfigError si STORAGE_PATH manque pour le driver postgres', () => {
    expect(() => loadConfig({ ...validEnv, STORAGE_DRIVER: 'postgres' })).toThrow(ConfigError);
  });

  it('devrait lever une ConfigError si STORAGE_PATH manque pour le driver mongo', () => {
    expect(() => loadConfig({ ...validEnv, STORAGE_DRIVER: 'mongo' })).toThrow(/STORAGE_PATH/);
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

  it('devrait laisser sentryDsn indéfini par défaut', () => {
    expect(loadConfig(validEnv).sentryDsn).toBeUndefined();
  });

  it('devrait exposer sentryDsn quand la variable est fournie', () => {
    expect(loadConfig({ ...validEnv, SENTRY_DSN: 'https://key@sentry.io/1' }).sentryDsn).toBe(
      'https://key@sentry.io/1',
    );
  });

  it('devrait utiliser 500 comme errorLogLimit par défaut', () => {
    expect(loadConfig(validEnv).errorLogLimit).toBe(500);
  });

  it('devrait respecter ERROR_LOG_LIMIT quand fourni', () => {
    expect(loadConfig({ ...validEnv, ERROR_LOG_LIMIT: '100' }).errorLogLimit).toBe(100);
  });

  it("devrait lever une ConfigError si ERROR_LOG_LIMIT n'est pas un nombre", () => {
    expect(() => loadConfig({ ...validEnv, ERROR_LOG_LIMIT: 'beaucoup' })).toThrow(
      /ERROR_LOG_LIMIT/,
    );
  });

  it('devrait lever une ConfigError si ERROR_LOG_LIMIT est négatif ou nul', () => {
    expect(() => loadConfig({ ...validEnv, ERROR_LOG_LIMIT: '0' })).toThrow(/ERROR_LOG_LIMIT/);
  });
});

describe('configuration du dashboard', () => {
  it('devrait désactiver le dashboard sans DISCORD_CLIENT_SECRET', () => {
    expect(loadConfig(validEnv).dashboard.enabled).toBe(false);
  });

  it('devrait activer le dashboard dès que DISCORD_CLIENT_SECRET est présent', () => {
    const { dashboard } = loadConfig({ ...validEnv, DISCORD_CLIENT_SECRET: 'secret' });
    expect(dashboard.enabled).toBe(true);
    expect(dashboard.clientSecret).toBe('secret');
  });

  it('devrait traiter un DISCORD_CLIENT_SECRET vide comme absent', () => {
    expect(loadConfig({ ...validEnv, DISCORD_CLIENT_SECRET: '' }).dashboard.enabled).toBe(false);
  });

  it('devrait appliquer les valeurs par défaut du dashboard', () => {
    const { dashboard } = loadConfig(validEnv);
    expect(dashboard.host).toBe('127.0.0.1');
    expect(dashboard.port).toBe(3000);
    expect(dashboard.baseUrl).toBe('http://localhost:3000');
  });

  it("devrait dériver l'URL de base du port choisi", () => {
    expect(loadConfig({ ...validEnv, DASHBOARD_PORT: '8080' }).dashboard.baseUrl).toBe(
      'http://localhost:8080',
    );
  });

  it('devrait respecter une URL de base explicite', () => {
    expect(
      loadConfig({ ...validEnv, DASHBOARD_BASE_URL: 'https://nexis.example' }).dashboard.baseUrl,
    ).toBe('https://nexis.example');
  });

  it("devrait retirer le slash final d'une URL de base", () => {
    expect(
      loadConfig({ ...validEnv, DASHBOARD_BASE_URL: 'https://nexis.example/' }).dashboard.baseUrl,
    ).toBe('https://nexis.example');
  });

  it('devrait accepter le port 0, qui demande un port éphémère', () => {
    expect(loadConfig({ ...validEnv, DASHBOARD_PORT: '0' }).dashboard.port).toBe(0);
  });

  it('devrait rejeter un port non numérique même dashboard désactivé', () => {
    expect(() => loadConfig({ ...validEnv, DASHBOARD_PORT: 'abc' })).toThrow(ConfigError);
  });

  it('devrait rejeter un port hors plage', () => {
    expect(() => loadConfig({ ...validEnv, DASHBOARD_PORT: '70000' })).toThrow(/DASHBOARD_PORT/);
  });
});
