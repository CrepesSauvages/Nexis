// Dépend de "gamma", lui-même écarté en cascade : delta doit l'être aussi.
export const manifest = { name: 'delta', version: '1.0.0', dependsOn: ['gamma'] };
export const setup = () => {};
