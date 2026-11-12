import type { Metric } from 'web-vitals';
import { afterEach, describe, expect, it, vi } from 'vitest';

type SentryEvent = {
  exception?: { values?: { mechanism?: unknown }[] };
  extra?: Record<string, unknown>;
};
type EventProcessor = (event: SentryEvent) => SentryEvent;

const sentry = vi.hoisted(() => {
  const processors: EventProcessor[] = [];
  return {
    processors,
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    withScope: vi.fn((callback: (scope: unknown) => void) =>
      callback({ addEventProcessor: (processor: EventProcessor) => processors.push(processor) }),
    ),
  };
});
vi.mock('./sentry', () => sentry);
vi.mock('web-vitals', () => ({ onCLS() {}, onINP() {}, onLCP() {}, onFCP() {}, onTTFB() {} }));

const metric = (rating: Metric['rating']): Metric => ({
  name: 'LCP',
  value: 4200,
  rating,
  delta: 4200,
  id: 'v1',
  navigationId: 1,
  entries: [],
  navigationType: 'navigate',
});

describe('monitoring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('DSN이 없으면 나쁜 지표와 오류를 오류 없이 넘긴다', async () => {
    const { initMonitoring, reportError, reportMetric } = await import('./monitoring');
    initMonitoring({ app: 'test', dev: false });
    expect(() => reportMetric(metric('poor'))).not.toThrow();
    expect(() => reportError(new Error('x'))).not.toThrow();
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('개발 모드에서는 지표를 콘솔에 남긴다', async () => {
    const { initMonitoring, reportMetric } = await import('./monitoring');
    initMonitoring({ app: 'test', dev: true });
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    reportMetric(metric('good'));
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('LCP 4200.0 (good)'));
  });

  it('Sentry를 받기 전에 난 오류도 준비되면 처리되지 않은 오류로 보낸다', async () => {
    const { initMonitoring } = await import('./monitoring');
    initMonitoring({ dsn: 'https://key@o1.ingest.sentry.io/1', app: 'test', dev: false });
    const error = new Error('first paint');
    window.dispatchEvent(new ErrorEvent('error', { error }));

    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledWith(error));
    const event: SentryEvent = {
      exception: { values: [{ mechanism: { type: 'generic', handled: true } }] },
    };
    for (const process of sentry.processors) process(event);
    expect(event.exception?.values?.[0]?.mechanism).toEqual({ type: 'onerror', handled: false });

    const { integrations, beforeSend } = sentry.init.mock.calls.at(-1)![0];
    const kept = integrations(
      ['Console', 'BrowserSession', 'Breadcrumbs', 'GlobalHandlers'].map((name) => ({ name })),
    );
    expect(kept.map(({ name }: { name: string }) => name)).toEqual(['GlobalHandlers']);
    expect(beforeSend({ extra: { arguments: ['secret'], other: 1 } })).toEqual({
      extra: { other: 1 },
    });
    expect(
      beforeSend({ request: { url: 'https://example.com/login#access_token=secret' } }),
    ).toEqual({
      request: { url: 'https://example.com/login' },
    });
  });
});
