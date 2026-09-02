import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { HttpError } from '../../../src/core/errors.js';
import { parseCookies, serializeCookie, readJsonBody } from '../../../src/core/http/request.js';

/**
 * Un IncomingMessage n'est rien de plus qu'un flux lisible pour
 * readJsonBody : un Readable suffit, sans socket ni serveur.
 * @param {string} body
 * @returns {import('node:http').IncomingMessage}
 */
const fakeRequest = (body) =>
  /** @type {import('node:http').IncomingMessage} */ (
    /** @type {unknown} */ (Readable.from([Buffer.from(body, 'utf8')]))
  );

describe('parseCookies', () => {
  it('devrait retourner un objet vide sans en-tête', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it('devrait parser plusieurs cookies', () => {
    expect(parseCookies('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('devrait décoder les valeurs encodées', () => {
    expect(parseCookies('n=a%20b')).toEqual({ n: 'a b' });
  });

  it('devrait ignorer un fragment sans signe égal', () => {
    expect(parseCookies('cassé; a=1')).toEqual({ a: '1' });
  });

  it('devrait garder les signes égal présents dans la valeur', () => {
    expect(parseCookies('t=a=b')).toEqual({ t: 'a=b' });
  });
});

describe('serializeCookie', () => {
  it('devrait poser les attributs de sécurité par défaut', () => {
    const cookie = serializeCookie('s', 'abc', { maxAge: 60, secure: false });
    expect(cookie).toContain('s=abc');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=60');
    expect(cookie).not.toContain('Secure');
  });

  it('devrait ajouter Secure quand demandé', () => {
    expect(serializeCookie('s', 'abc', { maxAge: 60, secure: true })).toContain('Secure');
  });

  it('devrait produire un cookie de suppression avec Max-Age=0', () => {
    expect(serializeCookie('s', '', { maxAge: 0, secure: false })).toContain('Max-Age=0');
  });
});

describe('readJsonBody', () => {
  it('devrait parser un corps JSON', async () => {
    expect(await readJsonBody(fakeRequest('{"a":1}'))).toEqual({ a: 1 });
  });

  it('devrait retourner undefined sur un corps vide', async () => {
    expect(await readJsonBody(fakeRequest(''))).toBeUndefined();
  });

  it('devrait lever une HttpError 400 sur du JSON invalide', async () => {
    await expect(readJsonBody(fakeRequest('{pas du json'))).rejects.toMatchObject({
      status: 400,
    });
  });

  it('devrait lever une HttpError 413 au-delà de la limite', async () => {
    await expect(readJsonBody(fakeRequest('x'.repeat(50)), 10)).rejects.toBeInstanceOf(HttpError);
  });

  it('devrait refuser avant la fin de lecture, sans tout accumuler', async () => {
    await expect(readJsonBody(fakeRequest('x'.repeat(50)), 10)).rejects.toMatchObject({
      status: 413,
    });
  });
});
