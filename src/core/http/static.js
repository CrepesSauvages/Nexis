import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

/**
 * Racine des fichiers construits par Vite.
 *
 * Calculée depuis l'URL du module et non depuis le répertoire courant :
 * `src/core/http/` remonte de trois niveaux jusqu'à la racine du dépôt, donc
 * un bot lancé depuis ailleurs sert quand même ses fichiers.
 */
export const WEB_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../../web/dist');

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const NOT_BUILT = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Nexis — interface non construite</title>
  </head>
  <body style="font-family: system-ui; background: #313338; color: #dbdee1; padding: 2rem">
    <h1>Interface web non construite</h1>
    <p>Le dashboard répond, mais les fichiers de l'interface sont absents.</p>
    <p>Construisez-les avec&nbsp;: <code>npm run build --workspace web</code></p>
    <p>
      Une installation de production (<code>npm ci --omit=dev</code>) exécute bien le script
      <code>prepare</code>, mais celui-ci ignore délibérément la construction de l'interface
      dans ce mode : la commande ci-dessus est alors à lancer à la main.
    </p>
  </body>
</html>
`;

/**
 * Fabrique le service de fichiers statiques du dashboard.
 *
 * Le handler rend `true` s'il a écrit une réponse, `false` s'il n'a rien à
 * servir — le routeur enchaîne alors sur son 404 JSON. La requête n'est pas
 * passée : aucun en-tête n'est lu.
 *
 * @param {{ root?: string }} [options]
 * @returns {(res: import('node:http').ServerResponse, pathname: string) => Promise<boolean>}
 */
export const createStaticHandler = ({ root = WEB_DIST } = {}) => {
  const base = resolve(root);

  return async (res, pathname) => {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    } catch {
      // Un `%` isolé est une faute de l'appelant, pas un incident : 404.
      return false;
    }

    const target = resolve(base, `.${decoded}`);
    // Seule barrière contre la traversée de répertoire : une requête ne doit
    // jamais faire sortir le service de `web/dist`.
    if (!target.startsWith(base + sep)) return false;

    let info;
    try {
      info = await stat(target);
    } catch {
      // Fichier absent ou illisible : indiscernables du point de vue de
      // l'appelant, tous deux traités comme « rien à servir ».
      info = undefined;
    }

    if (!info?.isFile()) {
      // Front non construit : `prepare` ignore délibérément sa construction sur
      // une installation sans devDependencies (`npm ci --omit=dev`), voir
      // `scripts/prepare.js`.
      // On l'explique sur la page d'accueil plutôt que de laisser le routeur
      // rendre un 404 JSON incompréhensible pour un humain.
      if (pathname === '/') {
        res.writeHead(503, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(NOT_BUILT),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        });
        res.end(NOT_BUILT);
        return true;
      }
      return false;
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      // Vite hache le nom des fichiers sous /assets/ : ils sont immuables par
      // construction. `index.html` ne l'est pas.
      'Cache-Control': decoded.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    });

    const stream = createReadStream(target);
    // `pipeline` (contrairement à `stream.pipe(res)`) détruit la source dès
    // que la destination se ferme — un client qui abandonne en cours de
    // transfert — ou échoue en lecture. `.pipe()` seul ne fait qu'un
    // `unpipe()` sur un abandon client : le descripteur de fichier reste
    // ouvert jusqu'au GC, ce qui finit en EMFILE sous charge. On ne l'attend
    // pas : le handler doit rendre la main dès l'envoi des en-têtes.
    pipeline(stream, res).catch(() => res.destroy());
    return true;
  };
};
