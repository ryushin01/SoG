import type { Metric } from 'web-vitals';

type SentryModule = typeof import('./sentry');

/** Sentry를 받기 전에 모아 둘 오류 수. 오류가 반복돼도 메모리를 계속 쓰지 않게 합니다. */
const MAX_EARLY_ERRORS = 20;

/** 방문 기록(세션), 이동·클릭 기록(브레드크럼), 콘솔 기록은 모으지 않습니다. */
const OFF_INTEGRATIONS = new Set(['BrowserSession', 'Breadcrumbs', 'Console']);

let sentry: Promise<SentryModule | undefined> | undefined;
let logToConsole = false;

export type MonitoringOptions = {
  /** Sentry DSN. 비어 있으면 Sentry를 불러오지 않습니다. */
  dsn?: string;
  /** 앱 이름. Sentry 태그로 남깁니다. */
  app: string;
  /** 개발 모드면 Web Vitals를 콘솔에 찍습니다. */
  dev: boolean;
};

/**
 * 브라우저의 오류·성능 모니터링을 켭니다. 첫 화면을 무겁게 하지 않도록 Sentry와 web-vitals는 나중에 따로 받습니다.
 * - dsn이 있으면 처리하지 못한 오류와 나쁜(poor) Web Vitals를 Sentry로 보냅니다.
 * - 없으면 Sentry를 불러오지 않고, 개발 모드에서만 Web Vitals를 콘솔에 찍습니다.
 */
export function initMonitoring({ dsn, app, dev }: MonitoringOptions) {
  if (typeof window === 'undefined') return;
  logToConsole = dev;

  if (dsn) {
    // Sentry를 받는 동안 난 오류(첫 화면 그리기 등)를 모아 두었다가, 준비되면 보냅니다.
    const early: { error: unknown; type: string }[] = [];
    const keep = (error: unknown, type: string) => {
      if (early.length < MAX_EARLY_ERRORS) early.push({ error, type });
    };
    const onError = (event: ErrorEvent) => keep(event.error ?? event.message, 'onerror');
    const onRejection = (event: PromiseRejectionEvent) =>
      keep(event.reason, 'onunhandledrejection');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    const stopBuffering = () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };

    sentry = import('./sentry')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: dev ? 'development' : 'production',
          initialScope: { tags: { app } },
          // 오류 내용만 남깁니다. 사용자 정보·쿠키·헤더·쿼리 문자열은 모으지 않습니다.
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            stackFrameVariables: false,
          },
          integrations: (defaults) => defaults.filter(({ name }) => !OFF_INTEGRATIONS.has(name)),
          // 감싼 콜백이 던진 오류에는 그 콜백의 인수(입력 이벤트 등)가 extra.arguments로 붙습니다. 오류 내용이 아니므로 지웁니다.
          beforeSend(event) {
            if (event.extra) delete event.extra['arguments'];
            return event;
          },
        });
        stopBuffering();
        for (const { error, type } of early.splice(0)) captureUnhandled(Sentry, error, type);
        return Sentry;
      })
      // Sentry를 받지 못해도 앱은 그대로 돕니다.
      .catch(() => {
        stopBuffering();
        return undefined;
      });
  }

  // 보낼 곳도 찍을 곳도 없으면(DSN 없는 배포) 지표 관찰기를 달지 않습니다.
  if (!dsn && !dev) return;

  void import('web-vitals')
    .then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
      for (const subscribe of [onCLS, onINP, onLCP, onFCP, onTTFB]) subscribe(reportMetric);
    })
    // 지표를 받지 못해도 앱은 그대로 돕니다.
    .catch(() => undefined);
}

export function reportMetric(metric: Metric) {
  if (logToConsole) {
    console.debug(`[web-vitals] ${metric.name} ${metric.value.toFixed(1)} (${metric.rating})`);
  }
  if (!sentry || metric.rating !== 'poor') return;
  // CLS·INP는 다른 화면으로 옮긴 뒤에 알려질 수 있어, 지표가 속한 쪽의 주소를 씁니다.
  const path = metric.navigationURL
    ? new URL(metric.navigationURL, location.origin).pathname
    : location.pathname;
  void sentry.then((Sentry) =>
    Sentry?.captureMessage(`Web Vitals 나쁨: ${metric.name}`, {
      level: 'warning',
      tags: { metric: metric.name, rating: metric.rating, path },
      extra: { value: metric.value, id: metric.id, navigationType: metric.navigationType },
    }),
  );
}

/** Angular ErrorHandler가 받은 오류를 보냅니다. */
export function reportError(error: unknown) {
  if (!sentry) return;
  void sentry.then((Sentry) => Sentry?.captureException(error));
}

/**
 * 전역 오류 처리기가 잡은 것처럼 '처리되지 않은 오류'로 표시해 보냅니다.
 * captureException은 기본으로 handled: true를 붙이므로 이벤트 처리기에서 바꿉니다.
 */
function captureUnhandled(Sentry: SentryModule, error: unknown, type: string) {
  Sentry.withScope((scope) => {
    scope.addEventProcessor((event) => {
      for (const value of event.exception?.values ?? []) value.mechanism = { type, handled: false };
      return event;
    });
    Sentry.captureException(error);
  });
}
