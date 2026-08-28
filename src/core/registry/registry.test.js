import { describe, it, expect } from 'vitest';
import { createRegistries } from './index.js';
import { PluginError } from '../errors.js';

const noop = () => {};
/**
 * @param {string} name
 * @returns {{ data: { name: string }, execute: () => void }}
 */
const command = (name) => ({ data: { name }, execute: noop });

describe('registre de commandes', () => {
  it('devrait retrouver une commande ajoutée avec son plugin', () => {
    const { commands } = createRegistries();
    commands.add('welcome', command('hello'));
    expect(commands.get('hello')).toMatchObject({ plugin: 'welcome' });
  });

  it('devrait refuser deux commandes de même nom', () => {
    const { commands } = createRegistries();
    commands.add('a', command('dup'));
    expect(() => commands.add('b', command('dup'))).toThrow(PluginError);
  });

  it('devrait nommer les deux plugins en conflit', () => {
    const { commands } = createRegistries();
    commands.add('a', command('dup'));
    expect(() => commands.add('b', command('dup'))).toThrow(/a.*b|b.*a/);
  });

  it('devrait lister les commandes par plugin', () => {
    const { commands } = createRegistries();
    commands.add('welcome', command('x'));
    commands.add('welcome', command('y'));
    commands.add('other', command('z'));
    expect(commands.byPlugin('welcome')).toHaveLength(2);
  });

  it('devrait rejeter une commande sans data.name', () => {
    const { commands } = createRegistries();
    // @ts-ignore - testing invalid input
    expect(() => commands.add('a', { execute: noop })).toThrow(PluginError);
  });

  it('devrait rejeter une commande sans execute', () => {
    const { commands } = createRegistries();
    // @ts-ignore - testing invalid input
    expect(() => commands.add('a', { data: { name: 'x' } })).toThrow(PluginError);
  });
});

describe("registre d'events", () => {
  it('devrait accumuler plusieurs handlers sur un même event', () => {
    const { events } = createRegistries();
    events.add('a', 'messageCreate', noop);
    events.add('b', 'messageCreate', noop);
    expect(events.handlersFor('messageCreate')).toHaveLength(2);
  });

  it("devrait lister les noms d'events sans doublon", () => {
    const { events } = createRegistries();
    events.add('a', 'messageCreate', noop);
    events.add('b', 'messageCreate', noop);
    events.add('a', 'guildMemberAdd', noop);
    expect(events.eventNames().sort()).toEqual(['guildMemberAdd', 'messageCreate']);
  });

  it('devrait retourner un tableau vide pour un event sans handler', () => {
    expect(createRegistries().events.handlersFor('inconnu')).toEqual([]);
  });

  it("devrait rejeter un handler qui n'est pas une fonction", () => {
    const { events } = createRegistries();
    // @ts-ignore - testing invalid input
    expect(() => events.add('a', 'ready', 'pas une fonction')).toThrow(PluginError);
  });
});

describe('registre de jobs', () => {
  it('devrait conserver plugin, cron et handler', () => {
    const { jobs } = createRegistries();
    jobs.add('stats', '0 9 * * *', noop);
    expect(jobs.all()).toEqual([{ plugin: 'stats', cron: '0 9 * * *', handler: noop }]);
  });

  it('devrait rejeter une expression cron vide', () => {
    const { jobs } = createRegistries();
    expect(() => jobs.add('stats', '', noop)).toThrow(PluginError);
  });
});

describe('registre de services', () => {
  it('devrait retourner le service fourni', () => {
    const { services } = createRegistries();
    const api = { greet: noop };
    services.provide('economy', api);
    expect(services.get('economy')).toBe(api);
  });

  it("devrait signaler la présence d'un service", () => {
    const { services } = createRegistries();
    services.provide('economy', {});
    expect(services.has('economy')).toBe(true);
    expect(services.has('absent')).toBe(false);
  });

  it('devrait refuser deux services pour le même plugin', () => {
    const { services } = createRegistries();
    services.provide('economy', {});
    expect(() => services.provide('economy', {})).toThrow(PluginError);
  });
});

describe('registre de routes', () => {
  it('devrait préfixer le path par le namespace du plugin', () => {
    const { routes } = createRegistries();
    routes.add('welcome', { method: 'GET', path: '/stats', auth: 'guild-admin', handler: noop });
    expect(routes.all()[0].path).toBe('/api/plugins/welcome/stats');
  });

  it('devrait rejeter une méthode HTTP inconnue', () => {
    const { routes } = createRegistries();
    expect(() =>
      routes.add('a', { method: 'FETCH', path: '/x', auth: 'public', handler: noop }),
    ).toThrow(PluginError);
  });

  it('devrait rejeter un niveau auth inconnu', () => {
    const { routes } = createRegistries();
    expect(() =>
      routes.add('a', { method: 'GET', path: '/x', auth: 'root', handler: noop }),
    ).toThrow(PluginError);
  });

  it('devrait rejeter un path qui ne commence pas par /', () => {
    const { routes } = createRegistries();
    expect(() =>
      routes.add('a', { method: 'GET', path: 'stats', auth: 'public', handler: noop }),
    ).toThrow(PluginError);
  });

  it('devrait refuser deux routes identiques', () => {
    const { routes } = createRegistries();
    const route = { method: 'GET', path: '/x', auth: 'public', handler: noop };
    routes.add('a', route);
    expect(() => routes.add('a', route)).toThrow(PluginError);
  });
});
