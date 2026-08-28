import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Suite partagée que tout driver de storage doit passer.
 *
 * `factory` doit retourner trois choses :
 * - `driver` : une instance du driver, pas encore initialisée (la suite
 *   appelle `init()` elle-même dans `beforeEach`) ;
 * - `reopen()` : crée une **toute nouvelle instance** du driver, pointant
 *   vers le même emplacement de stockage que `driver` — un vrai
 *   redémarrage à froid, jamais le même objet. C'est ce qui permet à la
 *   suite de vérifier que la persistance passe réellement par le support
 *   du driver (fichier, base…) et non par une simple relecture du même
 *   objet gardé en mémoire par la closure du test ;
 * - `cleanup()` : supprime les données de test après le run.
 *
 * @param {string} name - nom du driver, pour le libellé des tests
 * @param {() => Promise<{
 *   driver: import('../src/core/storage/driver.js').StorageDriver,
 *   reopen: () => import('../src/core/storage/driver.js').StorageDriver,
 *   cleanup: () => Promise<void>,
 * }>} factory
 */
export const runConformanceSuite = (name, factory) => {
  describe(`driver ${name} — conformité`, () => {
    /** @type {import('../src/core/storage/driver.js').StorageDriver} */
    let driver;
    /** @type {() => import('../src/core/storage/driver.js').StorageDriver} */
    let reopen;
    /** @type {() => Promise<void>} */
    let cleanup;

    beforeEach(async () => {
      ({ driver, reopen, cleanup } = await factory());
      await driver.init();
    });

    afterEach(async () => {
      await driver.close();
      await cleanup();
    });

    it('devrait relire une valeur écrite', async () => {
      await driver.set('a', 1);
      expect(await driver.get('a')).toBe(1);
    });

    it('devrait retourner undefined pour une clé absente', async () => {
      expect(await driver.get('inconnue')).toBeUndefined();
    });

    it('devrait écraser une valeur existante', async () => {
      await driver.set('a', 1);
      await driver.set('a', 2);
      expect(await driver.get('a')).toBe(2);
    });

    it('devrait préserver les objets imbriqués', async () => {
      const value = { nested: { list: [1, 2, 3], flag: true } };
      await driver.set('obj', value);
      expect(await driver.get('obj')).toEqual(value);
    });

    it("devrait distinguer null d'une clé absente", async () => {
      await driver.set('nul', null);
      expect(await driver.get('nul')).toBeNull();
      expect(await driver.get('jamais-écrite')).toBeUndefined();
    });

    it('devrait supprimer une clé', async () => {
      await driver.set('a', 1);
      await driver.delete('a');
      expect(await driver.get('a')).toBeUndefined();
    });

    it("devrait tolérer la suppression d'une clé absente", async () => {
      await expect(driver.delete('fantôme')).resolves.not.toThrow();
    });

    it('devrait lister les clés par préfixe', async () => {
      await driver.set('p:1', 'x');
      await driver.set('p:2', 'y');
      await driver.set('autre:3', 'z');
      expect((await driver.keys('p:')).sort()).toEqual(['p:1', 'p:2']);
    });

    it('devrait retourner un tableau vide si aucun préfixe ne correspond', async () => {
      await driver.set('a', 1);
      expect(await driver.keys('zzz:')).toEqual([]);
    });

    it('devrait persister les données entre deux ouvertures', async () => {
      await driver.set('durable', 'oui');
      await driver.close();
      // Nouvelle instance sur le même emplacement : un vrai redémarrage à
      // froid, pas une relecture du même objet en mémoire.
      const second = reopen();
      await second.init();
      expect(await second.get('durable')).toBe('oui');
      await second.close();
    });

    it('devrait traiter "__proto__" comme une clé de données ordinaire', async () => {
      await driver.set('__proto__', { polluted: true });
      expect(await driver.get('__proto__')).toEqual({ polluted: true });
      expect(await driver.get('autre')).toBeUndefined();
      // La clé ne doit jamais avoir pollué le prototype global.
      expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    });

    it('devrait supporter des écritures concurrentes sans perte', async () => {
      await Promise.all([driver.set('c1', 1), driver.set('c2', 2), driver.set('c3', 3)]);
      expect(await driver.get('c1')).toBe(1);
      expect(await driver.get('c2')).toBe(2);
      expect(await driver.get('c3')).toBe(3);
    });
  });
};
