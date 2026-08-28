// Plugin valide, dans le même répertoire que throws-in-setup : prouve que
// les autres plugins démarrent toujours malgré le voisin qui échoue.
export const manifest = { name: 'ok', version: '1.0.0' };
export const setup = () => {};
