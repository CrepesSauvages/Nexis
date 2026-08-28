// Dépend de "throws", qui échoue à l'import : gamma doit être écarté en cascade.
export const manifest = { name: 'gamma', version: '1.0.0', dependsOn: ['throws'] };
export const setup = () => {};
