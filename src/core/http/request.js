import { HttpError } from '../errors.js';

/** Taille maximale d'un corps de requête, en octets. */
export const BODY_LIMIT = 64 * 1024;

/**
 * Parse l'en-tête Cookie d'une requête HTTP en objet clé-valeur.
 * @param {string | undefined} header
 * @returns {Record<string, string>}
 */
export const parseCookies = (header) => {
  /** @type {Record<string, string>} */
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name) {
      const value = part.slice(separator + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        // Un cookie mal formé (ex: a=%) ne doit pas causer une erreur 500.
        // C'est une faute de l'appelant : on conserve la valeur brute.
        cookies[name] = value;
      }
    }
  }
  return cookies;
};

/**
 * Sérialise un cookie de session. Les attributs de sécurité ne sont pas
 * optionnels : tout cookie posé par le dashboard est HttpOnly (invisible
 * au JavaScript de la page) et SameSite=Lax (non envoyé sur une requête
 * inter-site, ce qui coupe le CSRF sur les routes POST).
 *
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge: number, secure: boolean }} options
 * @returns {string}
 */
export const serializeCookie = (name, value, { maxAge, secure }) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
};

/**
 * Lit le corps d'une requête et le parse en JSON.
 *
 * La limite est vérifiée pendant la lecture et non après : un corps de
 * plusieurs gigaoctets ne doit jamais tenir en mémoire avant d'être
 * refusé.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
export const readJsonBody = async (req, limit = BODY_LIMIT) => {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = /** @type {Buffer} */ (chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'Corps de requête trop volumineux');
    chunks.push(buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Corps de requête JSON invalide');
  }
};

/**
 * Envoie une réponse JSON au client.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {string[]} [setCookies]
 * @returns {void}
 */
export const sendJson = (res, status, payload, setCookies = []) => {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Le dashboard rend des identités et des configurations : rien de tout
    // cela ne doit être deviné par reniflage de type, ni stocké par un cache
    // intermédiaire.
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...(setCookies.length > 0 ? { 'Set-Cookie': setCookies } : {}),
  });
  res.end(body);
};

/**
 * Envoie une redirection HTTP au client.
 *
 * @param {import('node:http').ServerResponse} res
 * @param {string} location
 * @param {string[]} [setCookies]
 * @returns {void}
 */
export const sendRedirect = (res, location, setCookies = []) => {
  res.writeHead(302, {
    Location: location,
    // Le 302 de /auth/callback est précisément la réponse qui pose le
    // cookie de session : les mêmes en-têtes de durcissement que sendJson
    // s'y appliquent.
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...(setCookies.length > 0 ? { 'Set-Cookie': setCookies } : {}),
  });
  res.end();
};
