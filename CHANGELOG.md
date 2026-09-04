# Changelog

# [0.4.0](https://github.com/CrepesSauvages/Nexis/compare/v0.3.0...v0.4.0) (2026-09-04)

### Bug Fixes

* ajouter GET /api/core/locale, tolérer des permissions malformées, et tester le refus 403 bout en bout ([b6b32e5](https://github.com/CrepesSauvages/Nexis/commit/b6b32e57517a4b3410f36ade904482f56fd9cf3b))
* corriger le chemin du plugin utils dans le test de locales ([815e261](https://github.com/CrepesSauvages/Nexis/commit/815e26108143bdbc2120bf849728f6af392638b5))
* détruire le flux de lecture du service statique à l'abandon client ([c040282](https://github.com/CrepesSauvages/Nexis/commit/c040282a5434d97aabbbe3a11bda675fc8ebd57f))
* durcir les en-têtes de la redirection OAuth ([db56139](https://github.com/CrepesSauvages/Nexis/commit/db56139757b611f88d6a6cb88f16159047080d62))
* effacer les donnees du serveur precedent au changement ([c7af566](https://github.com/CrepesSauvages/Nexis/commit/c7af566653930ddb02b99d9d165831119d5f40b9))
* eviter que l'installation de production echoue sur la construction du front ([4cd59f3](https://github.com/CrepesSauvages/Nexis/commit/4cd59f3f881f8c0e87196004e890e863057b6414))
* exiger Content-Type application/json sur les requêtes mutatives (CSRF) ([c5f3c5e](https://github.com/CrepesSauvages/Nexis/commit/c5f3c5ef44699b74297b2f9609ad532230423e8a))
* faire porter husky par le garde-fou de prepare ([502fcc4](https://github.com/CrepesSauvages/Nexis/commit/502fcc4e06c40a3221480782e5851f8b2a684514))
* fiabiliser l'installation de production du bot ([423522f](https://github.com/CrepesSauvages/Nexis/commit/423522fc2e0715148f10eb50abe6f23427d314fd))
* garder les valeurs brutes de cookie malformées au lieu de lever une erreur ([fd34c34](https://github.com/CrepesSauvages/Nexis/commit/fd34c3423bcf41db4a3808886925ae4562970677))
* isoler l'état du tiroir de configuration par plugin ([1510e68](https://github.com/CrepesSauvages/Nexis/commit/1510e6861b7ffa10deb617a01f21dec8f068c2ad))
* proteger les champs restaures et informer des etats du tiroir ([f54a89e](https://github.com/CrepesSauvages/Nexis/commit/f54a89ea89b9d0a93a81da0a2c57c7394bc6562b))
* recharger la liste sur les refus périmés du plugin ([b894c89](https://github.com/CrepesSauvages/Nexis/commit/b894c8946add3db37b09c13e558b64c4795ae268))
* refuser par défaut un niveau d'autorisation non reconnu ([28eb4d4](https://github.com/CrepesSauvages/Nexis/commit/28eb4d4a861515140db523bce9ef8add73a227e7))
* rejeter les clés héritées du prototype dans la validation de configuration ([0862b41](https://github.com/CrepesSauvages/Nexis/commit/0862b41c196a4a84d77ea57121afad8debfccc13))
* réparer et compléter la construction de l'image Docker ([a5ec3b3](https://github.com/CrepesSauvages/Nexis/commit/a5ec3b38071efcc748630355edc636bfd9a76f96))
* retirer le cas instable du test de prepare.js et corriger check-types ([9fb5931](https://github.com/CrepesSauvages/Nexis/commit/9fb59319d412ef8135b8dff413cc3116f9eb476d))
* revenir sur typescript 7 racine et retirer le lint du front ([8deb3f7](https://github.com/CrepesSauvages/Nexis/commit/8deb3f745baa6a84d486dee6e25d5f15ce6c3996))
* sécuriser le dashboard HTTP — activation par serveur, plugins en échec, incidents 5xx ([ceb4e08](https://github.com/CrepesSauvages/Nexis/commit/ceb4e0842a61c7c663fe14880d5a17d0fbb002e4))
* séparer l'erreur en ligne de la bannière et corriger le test de l'interrupteur ([f357740](https://github.com/CrepesSauvages/Nexis/commit/f3577403bb8a831739af6a4350c3e90681303ead))
* sérialiser les écritures de configuration d'un même serveur ([962059d](https://github.com/CrepesSauvages/Nexis/commit/962059dc81910e955949ea2bb4e905b656a74823))
* traiter les trois points reportés par la revue du socle HTTP ([547cdd5](https://github.com/CrepesSauvages/Nexis/commit/547cdd502b231ea5ea93a4a0a6439c40dccf55ea))
* typer strictement les refus d'administration et éviter une resynchronisation inutile ([f2676fb](https://github.com/CrepesSauvages/Nexis/commit/f2676fb21957cf5b7cbe36c35177d2dd3faa5b18))

### Features

* activer et désactiver un plugin depuis l'API du dashboard ([34efb39](https://github.com/CrepesSauvages/Nexis/commit/34efb390330060ae963e0f14e97943017d2fa8fa))
* ajouter des commandes utilitaires pour afficher les informations du serveur et de l'utilisateur ([cbba0a9](https://github.com/CrepesSauvages/Nexis/commit/cbba0a9eb9e866b4925197c71a15c893cba821b3))
* ajouter l'écran de connexion et le flux de session ([cf75890](https://github.com/CrepesSauvages/Nexis/commit/cf75890df010bff8eff936c8317ab85cfe1026a1))
* ajouter la barre superieure et le choix du serveur ([31b19ce](https://github.com/CrepesSauvages/Nexis/commit/31b19ce451312ea0e5eaf0497154debf19461a5d))
* ajouter la grille des plugins et leur activation ([8f99d9c](https://github.com/CrepesSauvages/Nexis/commit/8f99d9c67a885e7743d2d89ba536b2bbcaf07f93))
* ajouter le client API du dashboard ([283cc8a](https://github.com/CrepesSauvages/Nexis/commit/283cc8a0a4d60e9745ad25964906637ab27c8b11))
* ajouter le client OAuth2 Discord du dashboard ([02287d2](https://github.com/CrepesSauvages/Nexis/commit/02287d26bef43b46c02666e81f1bd0286ea53e70))
* ajouter le tiroir de configuration ([1fdd3a2](https://github.com/CrepesSauvages/Nexis/commit/1fdd3a2466be2f0e0d851844b7b9f4e0f19c6473))
* ajouter le workspace web et sa chaine de compilation ([7e3a969](https://github.com/CrepesSauvages/Nexis/commit/7e3a969182e0963f07e6970e4c039a4bd0cfc4dd))
* ajouter les champs generes depuis le schema ([b8ba116](https://github.com/CrepesSauvages/Nexis/commit/b8ba116cb5332e292e783c03f7441f4256d9df57))
* ajouter les primitives HTTP (cookies, corps JSON, réponses) ([230f16e](https://github.com/CrepesSauvages/Nexis/commit/230f16ee4d3f9be8c8da71625e63a17f364872cb))
* ajouter translator.has pour tester l'existence d'une clé ([7afd928](https://github.com/CrepesSauvages/Nexis/commit/7afd928c904cf86c1174e5be09712f287eddf4b4))
* brancher le service de fichiers statiques en repli du routeur ([3402a7c](https://github.com/CrepesSauvages/Nexis/commit/3402a7c0d2d9c010df7b7c7d0afbcd85651e9932))
* démarrer le dashboard avec le bot et le fermer proprement ([ab815c9](https://github.com/CrepesSauvages/Nexis/commit/ab815c91822d7d60f5e0ebd1c5318001d28c29d7))
* exposer la liste des serveurs et des plugins par HTTP ([8bd7cf5](https://github.com/CrepesSauvages/Nexis/commit/8bd7cf5c89a86c39f477920e6093b063c1e5e115))
* exposer les endpoints de login, callback, logout et /api/me ([9e7fe24](https://github.com/CrepesSauvages/Nexis/commit/9e7fe249f26cd88d012f3bc8a4b7a7a77408aec4))
* exposer les salons et rôles du serveur pour les formulaires ([1ba3ebd](https://github.com/CrepesSauvages/Nexis/commit/1ba3ebd0e1ae602c0baad1314918192a53cd75d6))
* extraire les règles d'activation des plugins dans un module partagé ([e01f97f](https://github.com/CrepesSauvages/Nexis/commit/e01f97f7020c1210634911498a9b1840015dccf8))
* lire et écrire la configuration et la langue par HTTP ([16a4cc5](https://github.com/CrepesSauvages/Nexis/commit/16a4cc5429959316153032743bf9db256b90751d))
* lire la configuration du dashboard depuis l'environnement ([0f4e678](https://github.com/CrepesSauvages/Nexis/commit/0f4e6788bc0634f5af2336454fa35c0c68c1e386))
* persister les sessions du dashboard dans le storage ([3acca8f](https://github.com/CrepesSauvages/Nexis/commit/3acca8fc8ca2a9ba89fcef2d297a706d5d19e467))
* refuser d'enregistrer une configuration laissant un champ obligatoire vide ([7bb0d38](https://github.com/CrepesSauvages/Nexis/commit/7bb0d38e751e18b7ad2348dfa1d7bd3d89f45dd7))
* résoudre les quatre niveaux d'autorisation du dashboard ([22d2693](https://github.com/CrepesSauvages/Nexis/commit/22d2693b4e875d6d80407f122ae3c58c06f09e49))
* router les requêtes HTTP vers les routes de plugins ([b4d8cf3](https://github.com/CrepesSauvages/Nexis/commit/b4d8cf30b0bb16dec16b8c26bb573612156860fd))
* servir les fichiers construits de l'interface web ([2f50b21](https://github.com/CrepesSauvages/Nexis/commit/2f50b2122993c0b9e11072853057e187da7cce8c))
* traduire les libellés de configuration dans la langue du serveur ([ba9b386](https://github.com/CrepesSauvages/Nexis/commit/ba9b386f179adb64989750bc87e442582c282f51))
* valider les valeurs de configuration contre le manifeste ([4292fe8](https://github.com/CrepesSauvages/Nexis/commit/4292fe8c6caf05bb6e64008859b30ca123c9bfb1))

# [0.3.0](https://github.com/CrepesSauvages/Nexis/compare/v0.2.0...v0.3.0) (2026-08-30)

### Bug Fixes

* ajouter les clés _many manquantes pour l'espagnol, le portugais et l'italien ([063f235](https://github.com/CrepesSauvages/Nexis/commit/063f235f165c952bc468558f5b57a6733f227b77))
* ajouter les variantes _other manquantes dans pl.json ([2dcb80b](https://github.com/CrepesSauvages/Nexis/commit/2dcb80b9623bda218860fec6809bd4ecead59859))
* logger un warn si la résolution de la locale serveur échoue ([f7e065b](https://github.com/CrepesSauvages/Nexis/commit/f7e065bdb96add68f7cddc97cd0e46f5c035fbf5))
* valider l'override de locale serveur avant de le résoudre ([4864c6b](https://github.com/CrepesSauvages/Nexis/commit/4864c6b6d3323b2cc86afb85c4ed0d44e679a318))

### Features

* add component registry and dispatcher for handling Discord interactions ([c53374b](https://github.com/CrepesSauvages/Nexis/commit/c53374b2121a39b7322ecc84273792606b885377))
* add moderation commands for locking channels and purging messages with confirmation buttons ([4571460](https://github.com/CrepesSauvages/Nexis/commit/457146045a5f8440d7bd279244761ef9226b91ae))
* ajouter /nexis locale pour définir la langue du serveur ([841008d](https://github.com/CrepesSauvages/Nexis/commit/841008de02a3e3438951fdf61e76091056e70ced))
* ajouter l'override de locale par serveur à guild-config ([1b8fb61](https://github.com/CrepesSauvages/Nexis/commit/1b8fb616199adacdc2bc270874141a8ab6acdada))
* ajouter la résolution de locale à 3 niveaux (override, discord, français) ([94135f7](https://github.com/CrepesSauvages/Nexis/commit/94135f766bb218a3feeb6fd9e50017e886c899d8))
* ajouter le moteur de traduction pur (createTranslator) ([7205801](https://github.com/CrepesSauvages/Nexis/commit/7205801cdf0afa8eb7ba4ed1fd77d0daa6254497))
* ajouter les 8 fichiers de locale et le chargeur i18n ([acf7705](https://github.com/CrepesSauvages/Nexis/commit/acf770573b3675c1e44f86f17c6c2b343af88a5b))
* charger et enregistrer les traductions d'un plugin au boot ([0fca016](https://github.com/CrepesSauvages/Nexis/commit/0fca016cb46091415d0938809868ab29b2c589cb))
* démontrer ctx.t/ctx.resolveLocale sur le plugin example ([785eac1](https://github.com/CrepesSauvages/Nexis/commit/785eac151fbbf68afeffd9326f8e9f956cf1b63c))
* exposer ctx.t et ctx.resolveLocale à tout plugin ([53605f0](https://github.com/CrepesSauvages/Nexis/commit/53605f0ed1490872cd6acae2a2b63ffe02b1a3c0))
* localiser nativement les descriptions de /nexis pour le picker Discord ([a731dfa](https://github.com/CrepesSauvages/Nexis/commit/a731dfae44ff773b4821ffe72ffc22fbaefabdd7))
* migrer la démo hello.js vers son propre dossier i18n/ ([4731faa](https://github.com/CrepesSauvages/Nexis/commit/4731faa1ef9449c3d5e1ebceb2749ca520738d00))
* permettre l'extension du traducteur après sa construction (extend) ([68beed6](https://github.com/CrepesSauvages/Nexis/commit/68beed6cfb44c1d797e3f2d9b0c6868b14643b66))
* traduire les messages du dispatcher de commandes ([159b182](https://github.com/CrepesSauvages/Nexis/commit/159b182aaa851876dcb7bb41679fd178ed367111))
* traduire les réponses de /nexis dans les 8 langues ([954a7ad](https://github.com/CrepesSauvages/Nexis/commit/954a7ad9cd79c4d47ebabb26532571e691a54729))

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
