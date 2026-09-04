import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const scriptPath = join(root, 'scripts', 'prepare.js');
const SKIP_MESSAGE = 'Installation de production détectée';

/**
 * Lance `scripts/prepare.js` en enfant, avec un environnement contrôlé :
 * les trois variables que le script inspecte sont toujours explicitement
 * posées (vides si absentes), pour ne jamais dépendre de celles que `npm
 * test` pose déjà pour ce process.
 * @param {{ omit?: string, nodeEnv?: string, production?: string }} env
 * @param {number} [timeout]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
const runPrepare = ({ omit = '', nodeEnv = '', production = '' }, timeout) =>
  spawnSync('node', [scriptPath], {
    cwd: root,
    env: {
      ...process.env,
      npm_config_omit: omit,
      NODE_ENV: nodeEnv,
      npm_config_production: production,
    },
    encoding: 'utf8',
    timeout,
  });

// Le troisième cas (aucune des trois variables posée) n'est délibérément pas
// testé ici : il ferait tourner husky puis `npm run build:web` (tsc + vite)
// pour de vrai. Sous Windows, un timeout sur `spawnSync` tue le processus
// `node` parent mais peut laisser survivre le petit-fils `tsc`/`vite` lancé
// via `shell: true`, qui continue alors d'écrire dans `web/dist` pendant que
// d'autres tests tournent — source de flakiness et de processus orphelins
// constatée en pratique, pour un test qui ne prouvait de toute façon que
// l'absence du message de sortie rapide. Ce chemin non-production est déjà
// exercé pour de vrai par chaque `npm run build:web`.

describe('scripts/prepare.js', () => {
  it('devrait ignorer hooks et construction quand npm_config_omit contient dev', () => {
    const result = runPrepare({ omit: 'dev' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(SKIP_MESSAGE);
  });

  it('devrait ignorer hooks et construction quand NODE_ENV vaut production', () => {
    // C'est la même installation de production que `--omit=dev`, mais sans
    // qu'aucune variable `npm_config_*` ne le signale — la porte que le
    // garde-fou d'origine laissait ouverte.
    const result = runPrepare({ nodeEnv: 'production' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(SKIP_MESSAGE);
  });
});
