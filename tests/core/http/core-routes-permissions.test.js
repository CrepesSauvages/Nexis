import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CoreRoutesTestHarness, ID } from './core-routes-harness.js';

const harness = new CoreRoutesTestHarness();
/** @type {string} */
let cookie;

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

/**
 * @param {string} base
 * @param {string} [guild]
 */
const get = (base, guild = 'g1') =>
  fetch(`${base}/api/core/permissions?guild=${guild}`, { headers: { Cookie: cookie } });

/**
 * @param {string} base
 * @param {unknown} body
 */
const put = (base, body) =>
  fetch(`${base}/api/core/permissions?guild=g1`, {
    method: 'PUT',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const boot = async () => {
  const base = await harness.boot();
  cookie = harness.cookie;
  return base;
};

describe('GET /api/core/permissions', () => {
  it('devrait lister les commandes des plugins actifs', async () => {
    const base = await boot();
    const body = await (await get(base)).json();

    expect(body.commands).toEqual(
      expect.arrayContaining([{ name: 'ping', plugin: 'epsilon', declared: null, roles: null }]),
    );
  });

  it('devrait rendre la liste de rôles enregistrée', async () => {
    const base = await boot();
    await harness.app?.guildConfig.setCommandRoles('g1', 'ping', [ID]);

    const body = await (await get(base)).json();
    const ping = body.commands.find((/** @type {{ name: string }} */ c) => c.name === 'ping');
    expect(ping.roles).toEqual([ID]);
  });

  it('devrait exiger « Gérer le serveur »', async () => {
    const base = await boot();
    expect((await get(base, 'g5')).status).toBe(403);
  });
});

describe('PUT /api/core/permissions', () => {
  it('devrait enregistrer une liste de rôles', async () => {
    const base = await boot();
    const response = await put(base, { command: 'ping', roles: [ID] });

    expect(response.status).toBe(200);
    expect(await harness.app?.guildConfig.getCommandRoles('g1', 'ping')).toEqual([ID]);
  });

  it('devrait accepter une liste vide, qui réserve aux administrateurs', async () => {
    const base = await boot();
    await put(base, { command: 'ping', roles: [] });

    expect(await harness.app?.guildConfig.getCommandRoles('g1', 'ping')).toEqual([]);
  });

  it('devrait rendre la commande à son niveau déclaré avec null', async () => {
    const base = await boot();
    await put(base, { command: 'ping', roles: [ID] });
    const response = await put(base, { command: 'ping', roles: null });

    expect(response.status).toBe(200);
    expect(await harness.app?.guildConfig.getCommandRoles('g1', 'ping')).toBeUndefined();
  });

  it('devrait refuser un corps sans commande', async () => {
    const base = await boot();
    expect((await put(base, { roles: [] })).status).toBe(400);
  });

  it('devrait refuser une commande inconnue en 404', async () => {
    const base = await boot();
    const response = await put(base, { command: 'fantome', roles: [] });

    expect(response.status).toBe(404);
    expect((await response.json()).reason).toBe('unknown_command');
  });

  it("devrait refuser autre chose qu'un tableau de rôles", async () => {
    const base = await boot();
    const response = await put(base, { command: 'ping', roles: ID });

    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('not_an_array');
  });

  it("devrait refuser un identifiant qui n'est pas un snowflake", async () => {
    const base = await boot();
    const response = await put(base, { command: 'ping', roles: ['pas-un-id'] });

    expect((await response.json()).reason).toBe('not_a_snowflake');
  });

  it('devrait refuser un rôle absent du serveur', async () => {
    const base = await boot();
    const response = await put(base, { command: 'ping', roles: ['999999999999999999'] });

    expect(response.status).toBe(400);
    expect((await response.json()).reason).toBe('unknown_role');
  });

  it('ne devrait rien écrire quand un rôle est refusé', async () => {
    const base = await boot();
    await put(base, { command: 'ping', roles: [ID, 'pas-un-id'] });

    expect(await harness.app?.guildConfig.getCommandRoles('g1', 'ping')).toBeUndefined();
  });
});
