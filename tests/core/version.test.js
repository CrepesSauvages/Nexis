import { describe, it, expect } from 'vitest';
import { getVersion } from '../../src/core/version.js';

describe('getVersion', () => {
  it('devrait retourner la version déclarée dans package.json', () => {
    expect(getVersion()).toBe(require('../../package.json').version);
  });

  it('devrait retourner une chaîne au format semver', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
