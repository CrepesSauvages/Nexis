import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticHandler } from '../../../src/core/http/static.js';

/** @type {string} */
let dir;
/** @type {import('node:http').Server} */
let server;
/** @type {string} */
let base;

/**
 * @param {string} root
 * @returns {Promise<void>}
 */
const listen = async (root) => {
  const handler = createStaticHandler({ root });
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (await handler(res, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Route inconnue' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  base = `http://127.0.0.1:${address.port}`;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nexis-static-'));
});

afterEach(async () => {
  await new Promise((resolve) => server.close(() => resolve(undefined)));
  await rm(dir, { recursive: true, force: true });
});

describe('service statique — répertoire construit', () => {
  beforeEach(async () => {
    const root = join(dir, 'dist');
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'index.html'), '<!doctype html><title>Nexis</title>');
    await writeFile(join(root, 'assets', 'app-abc123.js'), 'export const a = 1;');
    await writeFile(join(root, 'logo.svg'), '<svg></svg>');
    await writeFile(join(root, 'data.bin'), 'binaire');
    await writeFile(join(dir, 'secret.txt'), 'jamais servi');
    await listen(root);
  });

  it('devrait servir index.html sur la racine', async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('Nexis');
  });

  it('devrait interdire la mise en cache de index.html', async () => {
    // Un index.html mis en cache référencerait des bundles disparus au
    // déploiement suivant.
    const response = await fetch(`${base}/`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('devrait servir un asset haché comme immuable', async () => {
    const response = await fetch(`${base}/assets/app-abc123.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('devrait poser nosniff sur toute réponse', async () => {
    const response = await fetch(`${base}/logo.svg`);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('devrait rendre un type générique pour une extension inconnue', async () => {
    const response = await fetch(`${base}/data.bin`);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('devrait répondre à HEAD sans corps', async () => {
    const response = await fetch(`${base}/`, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('35');
    expect(await response.text()).toBe('');
  });

  it('devrait refuser une remontée de répertoire', async () => {
    // `fetch` normalise `/../secret.txt` avant l'envoi : la requête n'atteint
    // jamais le serveur avec le `..` intact, et un test HTTP ne prouverait
    // donc rien. On appelle le handler directement avec un faux `res`.
    const handler = createStaticHandler({ root: join(dir, 'dist') });
    const res = /** @type {never} */ ({ writeHead: () => {}, end: () => {} });
    expect(await handler(res, '/../secret.txt')).toBe(false);
  });

  it('devrait refuser une remontée encodée', async () => {
    const response = await fetch(`${base}/%2e%2e/secret.txt`);
    expect(response.status).toBe(404);
  });

  it('devrait refuser une remontée depuis un sous-dossier', async () => {
    // Même raison que ci-dessus : `fetch` normalise le chemin avant l'envoi.
    const handler = createStaticHandler({ root: join(dir, 'dist') });
    const res = /** @type {never} */ ({ writeHead: () => {}, end: () => {} });
    expect(await handler(res, '/assets/../../secret.txt')).toBe(false);
  });

  it('devrait rendre 404 sur un encodage invalide', async () => {
    // `%` isolé : une faute de l'appelant, jamais un incident serveur.
    const response = await fetch(`${base}/%`);
    expect(response.status).toBe(404);
  });

  it('devrait rendre 404 sur un répertoire', async () => {
    const response = await fetch(`${base}/assets`);
    expect(response.status).toBe(404);
  });

  it('devrait rendre 404 sur un fichier absent', async () => {
    const response = await fetch(`${base}/absent.js`);
    expect(response.status).toBe(404);
  });
});

describe('service statique — front non construit', () => {
  beforeEach(async () => {
    await listen(join(dir, 'dist-absent'));
  });

  it("devrait expliquer en HTML que l'interface n'est pas construite", async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('npm run build --workspace web');
  });

  it('devrait laisser les autres chemins au 404 du routeur', async () => {
    const response = await fetch(`${base}/assets/app-abc123.js`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Route inconnue' });
  });
});
