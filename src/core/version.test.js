import { describe, it, expect } from 'vitest';
import { getVersion } from './version.js';

describe('getVersion', () => {
  it('devrait retourner la version déclarée dans package.json', () => {
    expect(getVersion()).toBe('0.0.1');
  });

  it('devrait retourner une chaîne au format semver', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
