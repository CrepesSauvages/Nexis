import type { ApiError, FieldError, Guild, GuildResources, Plugin, SessionUser } from './types';

/**
 * Une réponse non-2xx, portée par une vraie Error pour rester attrapable et
 * inspectable comme telle. Les champs reprennent exactement ce que l'API
 * rend : `reason` est fait pour être aiguillé par un composant, `error` n'est
 * affiché qu'en dernier recours.
 */
export class ApiRequestError extends Error implements ApiError {
  status: number;
  error: string;
  reason?: string;
  deps?: string[];
  fields?: FieldError[];
  errorId?: string;

  constructor(status: number, shape: Partial<ApiError>) {
    const message = shape.error ?? 'Erreur inattendue';
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.error = message;
    this.reason = shape.reason;
    this.deps = shape.deps;
    this.fields = shape.fields;
    this.errorId = shape.errorId;
  }
}

/**
 * Lit le corps d'une réponse sans jamais laisser remonter une SyntaxError :
 * un intermédiaire peut rendre du HTML là où l'API rendrait du JSON.
 */
const parse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Corps illisible : l'appelant n'en tirerait rien de plus que du statut.
    return undefined;
  }
};

const request = async (method: string, path: string, body?: unknown): Promise<unknown> => {
  const response = await fetch(path, {
    method,
    // Le cookie de session est HttpOnly : le JavaScript ne le lit jamais, il
    // demande seulement au navigateur de l'envoyer.
    credentials: 'same-origin',
    // Le routeur refuse en 415 une requête mutative portant un corps sans ce
    // type. Une requête sans corps n'en annonce pas.
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parse(response);
  if (response.ok) return payload;
  throw new ApiRequestError(response.status, (payload ?? {}) as Partial<ApiError>);
};

const guildQuery = (guild: string) => `guild=${encodeURIComponent(guild)}`;

/**
 * Les casts de retour sont assumés : l'API est la seule source de ces formes,
 * et `api/types.ts` en est le miroir. Une validation d'exécution ajouterait un
 * schéma à maintenir en double sans rien attraper que les tests HTTP du bot
 * n'attrapent déjà.
 */
export const api = {
  me: () => request('GET', '/api/me') as Promise<SessionUser>,

  guilds: () => request('GET', '/api/core/guilds') as Promise<Guild[]>,

  plugins: (guild: string) =>
    request('GET', `/api/core/plugins?${guildQuery(guild)}`) as Promise<Plugin[]>,

  resources: (guild: string) =>
    request('GET', `/api/core/guild-resources?${guildQuery(guild)}`) as Promise<GuildResources>,

  locale: (guild: string) =>
    request('GET', `/api/core/locale?${guildQuery(guild)}`) as Promise<{ locale: string | null }>,

  setLocale: async (guild: string, locale: string) => {
    await request('PUT', `/api/core/locale?${guildQuery(guild)}`, { locale });
  },

  enable: async (guild: string, name: string) => {
    await request('POST', `/api/core/plugins/enable?${guildQuery(guild)}`, { name });
  },

  disable: async (guild: string, name: string) => {
    await request('POST', `/api/core/plugins/disable?${guildQuery(guild)}`, { name });
  },

  saveConfig: async (guild: string, name: string, values: Record<string, unknown>) => {
    await request('PATCH', `/api/core/config?${guildQuery(guild)}`, { name, values });
  },

  logout: async () => {
    await request('POST', '/auth/logout');
  },
};
