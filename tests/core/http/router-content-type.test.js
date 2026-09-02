import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RouterTestHarness } from './router-harness.js';

const harness = new RouterTestHarness();

beforeEach(async () => {
  await harness.setupTempDir();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('garde CSRF sur Content-Type', () => {
  it('devrait refuser en 415 un POST avec corps et Content-Type text/plain', async () => {
    const { base } = await harness.start([
      { method: 'POST', path: '/api/x', auth: 'public', handler: ({ body }) => body },
    ]);
    const response = await fetch(`${base}/api/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(response.status).toBe(415);
  });

  it('devrait accepter un POST avec corps et Content-Type application/json; charset=utf-8', async () => {
    const { base } = await harness.start([
      { method: 'POST', path: '/api/x', auth: 'public', handler: ({ body }) => body },
    ]);
    const response = await fetch(`${base}/api/x`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ a: 1 });
  });

  it('ne devrait pas exiger de Content-Type sur un POST sans corps', async () => {
    const { base } = await harness.start([
      {
        method: 'POST',
        path: '/api/x',
        auth: 'public',
        handler: ({ body }) => ({ body: body ?? null }),
      },
    ]);
    const response = await fetch(`${base}/api/x`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ body: null });
  });
});
