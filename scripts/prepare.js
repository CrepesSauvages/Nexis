// npm exécute `prepare` même lors d'une installation sans devDependencies
// (`npm install --omit=dev` / `npm ci --omit=dev`) — contrairement à ce
// qu'on pourrait supposer. `husky` est lui-même une devDependency : sans
// garde-fou, l'appeler sans condition échouait déjà avant même d'atteindre
// la construction du front, puisque son binaire est absent dans ce mode.
// Ce script porte donc tout le cycle de vie `prepare` : rien qui ne sert
// qu'au développement (hooks git, construction de l'interface) ne doit
// tourner sur une installation de production.
//
// npm expose ses propres options aux scripts de cycle de vie via des
// variables `npm_config_*` : `npm_config_omit` contient `dev` quand les
// devDependencies sont omises.
import { spawnSync } from 'node:child_process';

const omit = process.env.npm_config_omit ?? '';

if (omit.includes('dev')) {
  console.log(
    "Installation sans devDependencies détectée : hooks git et construction de l'interface web ignorés (voir scripts/prepare.js).",
  );
  process.exit(0);
}

const run = (command) => {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('husky');
run('npm run build:web');
