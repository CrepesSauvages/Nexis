import { describe, it, expect } from 'vitest';
import { createRegistries } from '../../../src/core/registry/index.js';
import { PluginError } from '../../../src/core/errors.js';

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
    // Doublure délibérément invalide : le cast passe par `unknown` plutôt
    // que par `any`, pour vérifier le rejet à l'exécution sans désactiver
    // la vérification de types sur le reste du fichier.
    const invalidCmd = /** @type {import('../../../src/core/registry/commands.js').CommandDef} */ (
      /** @type {unknown} */ ({ execute: noop })
    );
    expect(() => commands.add('a', invalidCmd)).toThrow(PluginError);
  });

  it('devrait rejeter une commande sans execute', () => {
    const { commands } = createRegistries();
    const invalidCmd = /** @type {import('../../../src/core/registry/commands.js').CommandDef} */ (
      /** @type {unknown} */ ({ data: { name: 'x' } })
    );
    expect(() => commands.add('a', invalidCmd)).toThrow(PluginError);
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
    // Doublure délibérément invalide : cast via `unknown`, pas `any`.
    const invalidHandler = /** @type {Function} */ (/** @type {unknown} */ ('pas une fonction'));
    expect(() => events.add('a', 'ready', invalidHandler)).toThrow(PluginError);
  });

  it('devrait retourner une copie pour éviter les mutations du registre', () => {
    const { events } = createRegistries();
    const handler1 = () => {};
    const handler2 = () => {};
    events.add('a', 'messageCreate', handler1);
    const handlers = events.handlersFor('messageCreate');
    expect(handlers).toHaveLength(1);
    handlers.push({ plugin: 'malicious', handler: handler2 });
    const handlersAfter = events.handlersFor('messageCreate');
    expect(handlersAfter).toHaveLength(1);
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

describe('registre de components', () => {
  it('devrait préfixer le customId par le namespace du plugin', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(components.all()[0].customId).toBe('shop:buy');
  });

  it('devrait rejeter un type de component inconnu', () => {
    const { components } = createRegistries();
    expect(() =>
      components.add('shop', { customId: 'buy', type: 'dropdown', handler: noop }),
    ).toThrow(PluginError);
  });

  it('devrait rejeter un customId vide', () => {
    const { components } = createRegistries();
    expect(() => components.add('shop', { customId: '', type: 'button', handler: noop })).toThrow(
      PluginError,
    );
  });

  it("devrait rejeter un handler qui n'est pas une fonction", () => {
    const { components } = createRegistries();
    const invalid = /** @type {unknown} */ ({ customId: 'buy', type: 'button' });
    expect(() =>
      components.add(
        'shop',
        /** @type {import('../../../src/core/registry/components.js').ComponentDef} */ (invalid),
      ),
    ).toThrow(PluginError);
  });

  it('devrait rejeter un niveau de permission inconnu', () => {
    const { components } = createRegistries();
    expect(() =>
      components.add('shop', {
        customId: 'buy',
        type: 'button',
        permissions: 'root',
        handler: noop,
      }),
    ).toThrow(PluginError);
  });

  it('devrait refuser deux components identiques (même plugin, même id, même type)', () => {
    const { components } = createRegistries();
    const def = { customId: 'buy', type: 'button', handler: noop };
    components.add('shop', def);
    expect(() => components.add('shop', def)).toThrow(PluginError);
  });

  it('devrait autoriser le même customId sur deux types différents', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(() =>
      components.add('shop', { customId: 'buy', type: 'modal', handler: noop }),
    ).not.toThrow();
  });

  it('devrait retrouver un component par customId exact', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(components.find('shop:buy', 'button')).toMatchObject({ plugin: 'shop' });
  });

  it('devrait retrouver un component via un customId dynamique (préfixe + suffixe)', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(components.find('shop:buy:1234', 'button')).toMatchObject({ plugin: 'shop' });
  });

  it('ne devrait pas retrouver un component avec le mauvais type', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(components.find('shop:buy', 'select')).toBeUndefined();
  });

  it('ne devrait pas confondre deux préfixes proches ("buy" et "buying")', () => {
    const { components } = createRegistries();
    components.add('shop', { customId: 'buy', type: 'button', handler: noop });
    expect(components.find('shop:buying', 'button')).toBeUndefined();
  });
});
