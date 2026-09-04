// npm exécute `prepare` même lors d'une installation sans devDependencies
// (`npm install --omit=dev` / `npm ci --omit=dev`) — contrairement à ce
// qu'on pourrait supposer. `husky` est lui-même une devDependency : sans
// garde-fou, l'appeler sans condition échouait déjà avant même d'atteindre
// la construction du front, puisque son binaire est absent dans ce mode.
// Ce script porte donc tout le cycle de vie `prepare` : rien qui ne sert
// qu'au développement (hooks git, construction de l'interface) ne doit
// tourner sur une installation de production.
//
// Une installation est considérée « de production » dès que l'une de ces
// trois conditions tient — npm expose les deux premières aux scripts de
// cycle de vie via des variables `npm_config_*` :
//   - `npm_config_omit` contient `dev` (`npm install/ci --omit=dev`) ;
//   - `npm_config_production` vaut `"true"` (ancien alias, encore répandu) ;
//   - `NODE_ENV` vaut `production` : `npm install` omet aussi les
//     devDependencies dans ce cas, sans jamais poser les deux variables
//     ci-dessus — c'est la même installation de production, par une autre
//     porte, et sans garde-fou dessus `husky` échouerait à nouveau.
import { spawnSync } from 'node:child_process';

const omit = process.env.npm_config_omit ?? '';
const isProduction =
  omit.includes('dev') ||
  process.env.npm_config_production === 'true' ||
  process.env.NODE_ENV === 'production';

if (isProduction) {
  console.log(
    "Installation de production détectée : hooks git et construction de l'interface web ignorés (voir scripts/prepare.js).",
  );
  process.exit(0);
}

const run = (command) => {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// husky reste bloquant : il est immédiat et bon marché, et son échec
// signale un problème réel avec la copie de travail.
run('husky');

// La construction du front, elle, est faite au mieux : la garantie du
// projet est que le bot s'installe et tourne sans interface construite, et
// aujourd'hui une simple erreur TypeScript dans web/src ferait échouer
// `npm install` en entier, ce qui n'a rien à voir avec le bot lui-même.
const build = spawnSync('npm run build:web', { shell: true, stdio: 'inherit' });
if (build.status !== 0) {
  console.warn(
    "Avertissement : la construction de l'interface web a échoué. Le bot fonctionnera sans interface — lancez `npm run build:web` à la main pour la corriger.",
  );
}
