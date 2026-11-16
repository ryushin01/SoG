import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideMonitoring } from '@sog/monitoring';
import { provideWmsClient, reloadOnStaleChunk } from '@/shared/api';
import { routes } from './app.routes';
import { PageTitleStrategy } from './title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // DSN은 빌드할 때 --define SENTRY_DSN으로 넣습니다(package.json의 build). 없으면 Sentry를 불러오지 않습니다.
    provideMonitoring(
      '백오피스',
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
    provideWmsClient({ latency: [120, 380] }, '백오피스', 'session'),
  ],
};
