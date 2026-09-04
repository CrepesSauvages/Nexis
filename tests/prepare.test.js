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
 * @param {number} timeout
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

  it('ne devrait pas prendre la sortie rapide hors de ces cas', () => {
    // Lancer réellement husky puis `npm run build:web` est lent (tsc +
    // vite) et dépend de l'état de la copie de travail : on ne fait pas
    // tourner l'installation complète ici. Le message de sortie rapide
    // est émis en tout premier, avant tout spawn — un timeout court
    // suffit donc à vérifier qu'il n'apparaît pas, sans attendre la fin
    // de la construction.
    const result = runPrepare({}, 5000);
    expect(result.stdout ?? '').not.toContain(SKIP_MESSAGE);
  }, 10000);
});
