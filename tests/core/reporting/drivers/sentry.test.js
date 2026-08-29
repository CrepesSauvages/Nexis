import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sentryMock } = vi.hoisted(() => {
  return {
    sentryMock: { init: vi.fn(), captureException: vi.fn() },
  };
});

vi.mock('@sentry/node', () => sentryMock);

const { createSentryReporter } = await import('../../../../src/core/reporting/drivers/sentry.js');

/** @param {Partial<import('../../../../src/core/reporting/driver.js').ReportEntry>} [overrides] */
const entry = (overrides = {}) => ({
  id: 'abc12345',
  timestamp: '2026-01-01T00:00:00.000Z',
  level: /** @type {'error'} */ ('error'),
  message: 'boom',
  context: {},
  ...overrides,
});

beforeEach(() => {
  sentryMock.init.mockClear();
  sentryMock.captureException.mockClear();
});

describe('createSentryReporter', () => {
  it('devrait initialiser Sentry avec le DSN fourni, au premier rapport', async () => {
    const reporter = createSentryReporter({ dsn: 'https://example/1' });
    expect(sentryMock.init).not.toHaveBeenCalled();
    await reporter.report(entry());
    expect(sentryMock.init).toHaveBeenCalledWith({ dsn: 'https://example/1' });
  });

  it("ne devrait initialiser Sentry qu'une seule fois même après plusieurs rapports", async () => {
    const reporter = createSentryReporter({ dsn: 'https://example/1' });
    await reporter.report(entry());
    await reporter.report(entry());
    expect(sentryMock.init).toHaveBeenCalledOnce();
  });

  it('devrait construire une Error synthétique depuis message et context.stack', async () => {
    const reporter = createSentryReporter({ dsn: 'https://example/1' });
    await reporter.report(
      entry({ message: 'échec précis', context: { stack: 'Error: at x.js:1' } }),
    );

    expect(sentryMock.captureException).toHaveBeenCalledOnce();
    const [error] = sentryMock.captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('échec précis');
    expect(error.stack).toBe('Error: at x.js:1');
  });

  it('devrait fonctionner sans context.stack (Error sans stack forcée)', async () => {
    const reporter = createSentryReporter({ dsn: 'https://example/1' });
    await reporter.report(entry({ context: undefined }));

    const [error] = sentryMock.captureException.mock.calls[0];
    expect(error.message).toBe('boom');
  });

  it('devrait passer context en extra', async () => {
    const reporter = createSentryReporter({ dsn: 'https://example/1' });
    await reporter.report(entry({ context: { plugin: 'welcome', guildId: 'g1' } }));

    const [, options] = sentryMock.captureException.mock.calls[0];
    expect(options).toEqual({ extra: { plugin: 'welcome', guildId: 'g1' } });
  });
});
