import {
  type ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideMonitoring } from '@sog/monitoring';
import { provideWmsClient, reloadOnStaleChunk } from '@/shared/api';
import { routes } from './app.routes';
import { PageTitleStrategy } from './title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // DSN은 빌드할 때 --define SENTRY_DSN으로 넣습니다(package.json의 build). 없으면 Sentry를 불러오지 않습니다.
    provideMonitoring(
      '현장 앱',
      typeof SENTRY_DSN === 'undefined' ? undefined : SENTRY_DSN || undefined,
    ),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // 배포 뒤 열어 둔 탭이 사라진 화면 조각을 못 받으면 그 주소를 새로 엽니다.
      withNavigationErrorHandler(reloadOnStaleChunk),
    ),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideWmsClient({ latency: [150, 450] }, '현장 앱', 'local'),
    // 앱 파일을 기기에 두어 창고 안 음영 지역에서도 화면이 열리게 합니다.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
