// Manifeste valide, mais setup() lève de façon synchrone : ce n'est pas le
// même chemin que `throws` (qui échoue à l'import). Vérifie la seconde
// ligne de défense dans bootstrap(), indépendante de celle du loader.
export const manifest = { name: 'throws-in-setup', version: '1.0.0' };

export const setup = () => {
  throw new Error('boom au setup');
};
