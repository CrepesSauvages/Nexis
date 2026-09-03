// npm exécute `prepare` même lors d'une installation sans devDependencies
// (`npm install --omit=dev` / `npm ci --omit=dev`) — contrairement à ce
// qu'on pourrait supposer. Sans ce garde-fou, `prepare` tenterait de lancer
// `build:web`, qui a besoin de `vite` (une devDependency du workspace
// `web` jamais installée dans ce mode), et l'installation entière échouerait
// alors qu'elle réussissait avant l'existence de l'interface web.
//
// npm expose ses propres options aux scripts de cycle de vie via des
// variables `npm_config_*` : `npm_config_omit` contient `dev` quand les
// devDependencies sont omises.
import { spawnSync } from 'node:child_process';

const omit = process.env.npm_config_omit ?? '';

if (omit.includes('dev')) {
  console.log(
    "Installation sans devDependencies détectée : construction de l'interface web ignorée (voir scripts/prepare-web.js).",
  );
  process.exit(0);
}

const result = spawnSync('npm run build:web', { shell: true, stdio: 'inherit' });
process.exit(result.status ?? 1);
