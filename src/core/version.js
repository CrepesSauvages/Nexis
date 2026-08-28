import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const packagePath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');

/**
 * Retourne la version de Nexis déclarée dans package.json.
 * @returns {string}
 */
export const getVersion = () => {
  /** @type {{ version: string }} */
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  return pkg.version;
};
