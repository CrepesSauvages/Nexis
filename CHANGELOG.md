# Changelog

# [0.2.0](https://github.com/CrepesSauvages/Nexis/compare/v0.1.0...v0.2.0) (2026-08-29)

### Bug Fixes

* exclure la stack et plafonner le contexte inliné dans /nexis errors ([0ba61ba](https://github.com/CrepesSauvages/Nexis/commit/0ba61ba0c5c1bdccb47116730001ca8822881f48))
* réutiliser context.errorId comme id du rapport dans logger.js ([58fb387](https://github.com/CrepesSauvages/Nexis/commit/58fb387ea43dc8e578852068f6aac72e6f5e0c2f))
* sérialiser report() dans le reporter local pour éviter une perte d'entrée ([1b3e16c](https://github.com/CrepesSauvages/Nexis/commit/1b3e16ccc9f2e6a15a8dc319f013ee9b071b9e2b))
* tester l'isolation bidirectionnelle du fan-out et nommer le reporter fautif dans le log ([4ea688d](https://github.com/CrepesSauvages/Nexis/commit/4ea688dc167b9e6589f84a3be309918d3ab67d2a))
* update version test to use dynamic version from package.json ([4df563b](https://github.com/CrepesSauvages/Nexis/commit/4df563b8bbc40adb85bc68e71176c4a32bccd0fb))

### Features

* ajouter /nexis errors, réservée au propriétaire du bot ([808c217](https://github.com/CrepesSauvages/Nexis/commit/808c2178f8984295082c50178eaee787b281271f))
* ajouter l'interface ErrorReporter et le driver local à buffer circulaire ([73b1685](https://github.com/CrepesSauvages/Nexis/commit/73b1685b5f90ed96dd1514228f8bde23294b8810))
* ajouter le driver de reporting Sentry, import différé au premier rapport ([1598e8e](https://github.com/CrepesSauvages/Nexis/commit/1598e8e17269c511868b1715ca97365088583290))
* ajouter SENTRY_DSN et ERROR_LOG_LIMIT à la configuration ([cbd3271](https://github.com/CrepesSauvages/Nexis/commit/cbd3271ae0924e39915852def38f2f7ca0ee68b3))
* assembler le fan-out de reporting, local toujours actif, Sentry conditionnel ([e6e0df9](https://github.com/CrepesSauvages/Nexis/commit/e6e0df92b7561e3c4cf4c2d014d52a54d3b07746))
* câbler errorReporting au boot, exposer ownerId et errorReporting dans ctx.core ([f6b1c49](https://github.com/CrepesSauvages/Nexis/commit/f6b1c490550e325d68e05e80bb027c158d431c91))
* séparer stdout/stderr par niveau, ajouter couleur TTY, niveau par enfant et hook onError au logger ([ac68afc](https://github.com/CrepesSauvages/Nexis/commit/ac68afc0db20c66ab579d3776dc1c5eeb06f2b08))

# 0.1.0 (2026-08-29)

### Bug Fixes

* corriger les lacunes d'intégration relevées par la revue finale du branch ([45d2b9f](https://github.com/CrepesSauvages/Nexis/commit/45d2b9f4371c1fd44cd413ee8511403700ef515d))
* défendre handlersFor contre les mutations et retirer les [@ts-ignore](https://github.com/ts-ignore) ([26189d4](https://github.com/CrepesSauvages/Nexis/commit/26189d414b9c34e7e88074c44392606ff5a32b31))
* écarter en cascade les plugins dont une dépendance manque, garder les cycles fatals ([06af3ee](https://github.com/CrepesSauvages/Nexis/commit/06af3ee17235303e1040017fb4092222296da2c4))
* préciser les types pour CommandDef et utiliser les bonnes interfaces ([e4e09cf](https://github.com/CrepesSauvages/Nexis/commit/e4e09cf6d03f47f69c2c898ad657663556467bfe))

### Features

* add support for PostgreSQL and MongoDB storage drivers ([4a66c18](https://github.com/CrepesSauvages/Nexis/commit/4a66c18789b2dc995e6a9d5807089ed8f24c9286))
* ajouter l'abstraction storage, le driver json et sa suite de conformité ([7ccab74](https://github.com/CrepesSauvages/Nexis/commit/7ccab74f0b9db164ecfc1a770689744a97f9988b))
* ajouter le driver de storage sqlite ([da24871](https://github.com/CrepesSauvages/Nexis/commit/da2487155dc45f7256b562378ba6938e4b95202d))
* ajouter le plugin interne d'administration des plugins ([4b4665b](https://github.com/CrepesSauvages/Nexis/commit/4b4665b5de1bbf481e4133b7ec31bb976a5505a8))
* ajouter les registres de commandes, events, jobs, services et routes ([d0d829e](https://github.com/CrepesSauvages/Nexis/commit/d0d829e6b58613665bf05897446131fdcfb786cf))
* ajouter les types d'erreur et le logger du core ([6d18042](https://github.com/CrepesSauvages/Nexis/commit/6d180428cf6096c4a399a30c9aeba45f91bea18e))
* assembler le boot complet du bot ([29d16c6](https://github.com/CrepesSauvages/Nexis/commit/29d16c6515e78d637a0bdb4c7a3fb31cef9c73d8))
* auto-charger les commandes, events et jobs par convention de dossiers ([1795723](https://github.com/CrepesSauvages/Nexis/commit/1795723b88827b5f626ab360431b3e3d0e52a9d2))
* charger et valider les plugins depuis le répertoire plugins ([6638000](https://github.com/CrepesSauvages/Nexis/commit/66380007347ba5c7b9e0f5b0346fc1d537257ec2))
* déployer les commandes globales vers Discord ([7f8409b](https://github.com/CrepesSauvages/Nexis/commit/7f8409b623761cb4ad7e49a71b77b3575b446a96))
* dériver les intents Discord depuis les events déclarés ([90fe5eb](https://github.com/CrepesSauvages/Nexis/commit/90fe5eb92b9cb7484dafea56a52bc4acd2df7808))
* dispatcher les events et commandes vers les plugins activés ([63d9410](https://github.com/CrepesSauvages/Nexis/commit/63d94109875ccffe730a778285b3da95c4624327))
* exécuter les tâches planifiées des plugins par serveur ([2da68cc](https://github.com/CrepesSauvages/Nexis/commit/2da68cc06f70516b21d19a8a98da879ea12671a3))
* fabriquer le contexte injecté aux plugins ([53cd3a0](https://github.com/CrepesSauvages/Nexis/commit/53cd3a011e905f75198eaad0c0a43831bbaddfd9))
* gérer l'activation et la configuration des plugins par serveur ([aa442da](https://github.com/CrepesSauvages/Nexis/commit/aa442dad3736b77a4d1d46413e8282bf1dce3f07))
* résoudre l'ordre de chargement des plugins et détecter les cycles ([a9bc963](https://github.com/CrepesSauvages/Nexis/commit/a9bc96323cc05cb96caa2f75445b8fed0b4cb099))
* synchroniser les slash commands par serveur ([fc323a1](https://github.com/CrepesSauvages/Nexis/commit/fc323a17524f563ebe2a6345ff69e9b768a39b78))
* **tests:** add comprehensive test suite for core functionality and plugins ([c6a7168](https://github.com/CrepesSauvages/Nexis/commit/c6a7168536d2823d06b1dba5adcc92943c06ef4d))
* valider la configuration d'environnement au démarrage ([ec9e1a8](https://github.com/CrepesSauvages/Nexis/commit/ec9e1a85a944e734fec577d7a0fb6a6bc187af1c))
