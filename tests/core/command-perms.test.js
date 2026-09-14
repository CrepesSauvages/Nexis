import { describe, it, expect } from 'vitest';
import { isAllowed, checkRoles } from '../../src/core/command-perms.js';

/** @param {object} [overrides] */
const member = (overrides = {}) => ({
  isOwner: false,
  hasManageGuild: false,
  roleIds: [],
  ...overrides,
});

describe('isAllowed', () => {
  describe('sans surcharge de serveur', () => {
    it('devrait ouvrir une commande sans niveau déclaré à tout le monde', () => {
      expect(isAllowed({ declared: undefined, roles: undefined, member: member() })).toBe(true);
    });

    it('devrait réserver une commande guild-admin à « Gérer le serveur »', () => {
      expect(isAllowed({ declared: 'guild-admin', roles: undefined, member: member() })).toBe(
        false,
      );
      expect(
        isAllowed({
          declared: 'guild-admin',
          roles: undefined,
          member: member({ hasManageGuild: true }),
        }),
      ).toBe(true);
    });

    it('devrait réserver une commande owner au propriétaire du bot', () => {
      expect(
        isAllowed({
          declared: 'owner',
          roles: undefined,
          member: member({ hasManageGuild: true }),
        }),
      ).toBe(false);
      expect(
        isAllowed({ declared: 'owner', roles: undefined, member: member({ isOwner: true }) }),
      ).toBe(true);
    });
  });

  describe('avec surcharge de serveur', () => {
    it("devrait ouvrir une commande d'administration à un rôle autorisé", () => {
      expect(
        isAllowed({
          declared: 'guild-admin',
          roles: ['mods'],
          member: member({ roleIds: ['mods'] }),
        }),
      ).toBe(true);
    });

    it('devrait fermer une commande publique aux rôles non listés', () => {
      expect(
        isAllowed({ declared: undefined, roles: ['mods'], member: member({ roleIds: ['autre'] }) }),
      ).toBe(false);
    });

    it('devrait réserver aux administrateurs avec une liste vide', () => {
      expect(isAllowed({ declared: undefined, roles: [], member: member() })).toBe(false);
      expect(
        isAllowed({ declared: undefined, roles: [], member: member({ hasManageGuild: true }) }),
      ).toBe(true);
    });

    it('devrait laisser passer « Gérer le serveur » quelle que soit la liste', () => {
      // Celui qui écrit la règle ne doit pas pouvoir s'enfermer dehors.
      expect(
        isAllowed({
          declared: undefined,
          roles: ['mods'],
          member: member({ hasManageGuild: true }),
        }),
      ).toBe(true);
    });

    it('ne devrait jamais déléguer une commande owner', () => {
      // Une commande de propriétaire engage l'installation entière, pas ce
      // seul serveur : aucun administrateur ne peut se l'ouvrir.
      expect(
        isAllowed({
          declared: 'owner',
          roles: ['mods'],
          member: member({ roleIds: ['mods'], hasManageGuild: true }),
        }),
      ).toBe(false);
    });
  });
});

describe('checkRoles', () => {
  const exists = () => true;

  it('devrait accepter une liste vide', () => {
    expect(checkRoles([], exists)).toBeUndefined();
  });

  it('devrait accepter des identifiants valides du serveur', () => {
    expect(checkRoles(['12345678901234567'], exists)).toBeUndefined();
  });

  it('devrait refuser autre chose qu’un tableau', () => {
    expect(checkRoles('12345678901234567', exists)).toBe('not_an_array');
  });

  it("devrait refuser ce qui n'est pas un identifiant Discord", () => {
    expect(checkRoles(['pas-un-id'], exists)).toBe('not_a_snowflake');
  });

  it('devrait refuser un rôle absent du serveur', () => {
    expect(checkRoles(['12345678901234567'], () => false)).toBe('unknown_role');
  });
});
