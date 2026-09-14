import { describe, it, expect } from 'vitest';
import { createCooldowns } from '../../src/core/cooldowns.js';

/**
 * Horloge pilotée : les temps de recharge se testent par des sauts
 * explicites, jamais par une attente réelle.
 */
const clock = (start = 1_000) => {
  let current = start;
  return {
    now: () => current,
    /** @param {number} ms */
    advance: (ms) => {
      current += ms;
    },
  };
};

describe('createCooldowns', () => {
  it('devrait autoriser une première utilisation', () => {
    expect(createCooldowns().hit('cmd:u1', 5)).toEqual({ allowed: true });
  });

  it('devrait refuser une seconde utilisation dans le délai', () => {
    const cooldowns = createCooldowns();
    cooldowns.hit('cmd:u1', 5);
    expect(cooldowns.hit('cmd:u1', 5).allowed).toBe(false);
  });

  it('devrait annoncer le temps restant', () => {
    const { now, advance } = clock();
    const cooldowns = createCooldowns({ now });
    cooldowns.hit('cmd:u1', 10);
    advance(4_000);

    const refusal = cooldowns.hit('cmd:u1', 10);
    expect(refusal).toEqual({ allowed: false, retryAfterMs: 6_000 });
  });

  it('devrait réautoriser une fois le délai écoulé', () => {
    const { now, advance } = clock();
    const cooldowns = createCooldowns({ now });
    cooldowns.hit('cmd:u1', 5);
    advance(5_000);

    expect(cooldowns.hit('cmd:u1', 5).allowed).toBe(true);
  });

  it('ne devrait pas prolonger la recharge à chaque refus', () => {
    const { now, advance } = clock();
    const cooldowns = createCooldowns({ now });
    cooldowns.hit('cmd:u1', 5);

    advance(3_000);
    cooldowns.hit('cmd:u1', 5);
    advance(2_000);

    // Le martèlement n'a pas repoussé l'échéance initiale.
    expect(cooldowns.hit('cmd:u1', 5).allowed).toBe(true);
  });

  it('devrait compter chaque clé séparément', () => {
    const cooldowns = createCooldowns();
    cooldowns.hit('cmd:u1', 5);
    expect(cooldowns.hit('cmd:u2', 5).allowed).toBe(true);
  });

  it('devrait purger les entrées périmées', () => {
    const { now, advance } = clock();
    const cooldowns = createCooldowns({ now, sweepEvery: 3 });
    cooldowns.hit('a', 1);
    cooldowns.hit('b', 1);
    advance(2_000);

    // Le troisième enregistrement déclenche le balayage : a et b sont
    // périmées, seule c survit.
    cooldowns.hit('c', 60);
    expect(cooldowns.size()).toBe(1);
  });
});
