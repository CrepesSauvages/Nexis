# Changelog

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
