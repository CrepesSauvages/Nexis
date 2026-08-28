import { DependencyError } from './errors.js';

/**
 * Trie les plugins de sorte qu'un plugin soit toujours initialisé après
 * ceux dont il dépend. Parcours en profondeur avec marquage : un nœud
 * rencontré alors qu'il est en cours de visite signale un cycle.
 *
 * Un cycle et une dépendance absente sont tous deux fatals au boot —
 * ce sont des erreurs de code, pas des conditions d'exécution.
 *
 * @param {Array<{ name: string, dependsOn?: string[] }>} manifests
 * @returns {string[]} noms triés
 */
export const resolveOrder = (manifests) => {
  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  /** @type {string[]} */
  const order = [];
  /** @type {Map<string, 'visiting' | 'done'>} */
  const state = new Map();

  /**
   * @param {string} name
   * @param {string[]} trail - chemin parcouru, pour afficher le cycle
   */
  const visit = (name, trail) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const cycle = [...trail.slice(trail.indexOf(name)), name].join(' → ');
      throw new DependencyError(`Cycle de dépendances entre plugins : ${cycle}`, { cycle });
    }

    const manifest = byName.get(name);
    if (!manifest) {
      const dependent = trail.at(-1);
      throw new DependencyError(
        `Le plugin "${dependent}" dépend de "${name}", qui est introuvable dans plugins/`,
        { plugin: dependent, missing: name },
      );
    }

    state.set(name, 'visiting');
    for (const dependency of manifest.dependsOn ?? []) {
      visit(dependency, [...trail, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };

  for (const manifest of manifests) {
    visit(manifest.name, []);
  }

  return order;
};
