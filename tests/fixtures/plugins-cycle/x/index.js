// Cycle volontaire avec "y" : les deux plugins chargent et valident sans
// problème, mais leur dépendance mutuelle doit rester une erreur fatale.
export const manifest = { name: 'x', version: '1.0.0', dependsOn: ['y'] };
export const setup = () => {};
