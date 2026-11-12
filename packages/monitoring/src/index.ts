import {
  type EnvironmentProviders,
  ErrorHandler,
  Injectable,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { initMonitoring, reportError } from './monitoring';

export { initMonitoring, reportError, reportMetric } from './monitoring';

/** Angular가 잡은 오류(컴포넌트·변경 감지 등)는 전역으로 올라가지 않으므로 콘솔에 남기고 Sentry로도 보냅니다. */
@Injectable()
export class ReportingErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    super.handleError(error);
    reportError(error);
  }
}

/**
 * 오류·성능 모니터링. 앱 설정의 providers에 넣습니다.
 * DSN은 빌드할 때 `--define SENTRY_DSN=...`으로 넣고, 없으면 Sentry를 불러오지 않습니다.
 */
export function provideMonitoring(app: string, dsn: string | undefined): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    provideAppInitializer(() => initMonitoring({ dsn, app, dev: isDevMode() })),
  ]);
}
