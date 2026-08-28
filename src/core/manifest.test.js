import { describe, it, expect } from 'vitest';
import { validateManifest } from './manifest.js';
import { PluginError } from './errors.js';

const valid = { name: 'welcome', version: '1.0.0' };

/**
 * @param {unknown} manifest
 * @returns {() => void}
 */
const check = (manifest) => () =>
  validateManifest(
    /** @type {import('./manifest.js').PluginManifest | undefined} */ (manifest),
    'plugins/test',
  );

describe('validateManifest', () => {
  it('devrait accepter un manifeste minimal', () => {
    expect(check(valid)).not.toThrow();
  });

  it('devrait accepter un manifeste complet', () => {
    expect(
      check({
        ...valid,
        description: 'x',
        dependsOn: ['economy'],
        allowDM: true,
        config: { chan: { type: 'channel', required: true, label: 'Salon' } },
      }),
    ).not.toThrow();
  });

  it('devrait rejeter un manifeste absent', () => {
    expect(check(undefined)).toThrow(PluginError);
  });

  it('devrait rejeter un nom manquant', () => {
    expect(check({ version: '1.0.0' })).toThrow(/name/);
  });

  it("devrait rejeter un nom qui n'est pas en kebab-case", () => {
    expect(check({ ...valid, name: 'MonPlugin' })).toThrow(/kebab-case/);
  });

  it('devrait rejeter un nom avec underscore', () => {
    expect(check({ ...valid, name: 'mon_plugin' })).toThrow(/kebab-case/);
  });

  it('devrait accepter un nom avec chiffres et tirets', () => {
    expect(check({ ...valid, name: 'anti-raid-2' })).not.toThrow();
  });

  it('devrait rejeter une version manquante', () => {
    expect(check({ name: 'a' })).toThrow(/version/);
  });

  it('devrait rejeter une version non semver', () => {
    expect(check({ ...valid, version: 'v1' })).toThrow(/version/);
  });

  it("devrait rejeter un dependsOn qui n'est pas un tableau", () => {
    expect(check({ ...valid, dependsOn: 'economy' })).toThrow(/dependsOn/);
  });

  it('devrait rejeter un allowDM non booléen', () => {
    expect(check({ ...valid, allowDM: 'oui' })).toThrow(/allowDM/);
  });

  it('devrait rejeter un type de config inconnu', () => {
    expect(check({ ...valid, config: { x: { type: 'date', label: 'X' } } })).toThrow(/date/);
  });

  it('devrait rejeter une entrée de config sans label', () => {
    expect(check({ ...valid, config: { x: { type: 'string' } } })).toThrow(/label/);
  });

  it('devrait exiger des options pour un type select', () => {
    expect(check({ ...valid, config: { x: { type: 'select', label: 'X' } } })).toThrow(/options/);
  });

  it('devrait accepter un select avec options', () => {
    expect(
      check({ ...valid, config: { x: { type: 'select', label: 'X', options: ['a', 'b'] } } }),
    ).not.toThrow();
  });

  it("devrait rejeter une entrée à la fois required et pourvue d'un default", () => {
    expect(
      check({
        ...valid,
        config: { x: { type: 'string', label: 'X', required: true, default: 'd' } },
      }),
    ).toThrow(/required/);
  });
});
