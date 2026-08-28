import { describe, it, expect } from 'vitest';
import { resolveOrder } from './resolver.js';
import { DependencyError } from './errors.js';

/**
 * @param {string} name
 * @param {string[]} [dependsOn]
 * @returns {{ name: string, dependsOn: string[] }}
 */
const m = (name, dependsOn = []) => ({ name, dependsOn });

describe('resolveOrder', () => {
  it('devrait retourner tous les plugins', () => {
    expect(resolveOrder([m('a'), m('b')]).sort()).toEqual(['a', 'b']);
  });

  it('devrait placer une dépendance avant son dépendant', () => {
    const order = resolveOrder([m('shop', ['economy']), m('economy')]);
    expect(order.indexOf('economy')).toBeLessThan(order.indexOf('shop'));
  });

  it('devrait résoudre une chaîne de trois plugins', () => {
    const order = resolveOrder([m('c', ['b']), m('b', ['a']), m('a')]);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('devrait résoudre un diamant de dépendances', () => {
    const order = resolveOrder([m('d', ['b', 'c']), m('b', ['a']), m('c', ['a']), m('a')]);
    expect(order.indexOf('a')).toBe(0);
    expect(order.indexOf('d')).toBe(3);
  });

  it('devrait accepter un manifeste sans dependsOn', () => {
    expect(resolveOrder([{ name: 'seul' }])).toEqual(['seul']);
  });

  it('devrait lever une DependencyError sur un cycle', () => {
    expect(() => resolveOrder([m('a', ['b']), m('b', ['a'])])).toThrow(DependencyError);
  });

  it('devrait nommer les plugins impliqués dans le cycle', () => {
    expect(() => resolveOrder([m('a', ['b']), m('b', ['a'])])).toThrow(/cycle/i);
  });

  it('devrait détecter un cycle sur soi-même', () => {
    expect(() => resolveOrder([m('a', ['a'])])).toThrow(DependencyError);
  });

  it('devrait lever une DependencyError si une dépendance est absente', () => {
    expect(() => resolveOrder([m('shop', ['economy'])])).toThrow(DependencyError);
  });

  it('devrait nommer la dépendance absente', () => {
    expect(() => resolveOrder([m('shop', ['economy'])])).toThrow(/economy/);
  });

  it('devrait retourner un tableau vide sans manifeste', () => {
    expect(resolveOrder([])).toEqual([]);
  });
});
