import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import type { WmsServerOptions } from '@sog/wms-server';
import { AUTH_STORAGE } from './auth';
import { WMS_SERVER_OPTIONS } from './host';
import { wmsInterceptor } from './interceptor';
import { PRESENCE_APP } from './presence';

export { AUTH_STORAGE, AuthSession, seedTestSession } from './auth';
export { WMS_SERVER_OPTIONS, WmsHost, type WmsMode } from './host';
export { idempotencyKey, ifMatch, isVersionConflict, SubmitLock, toApiError } from './http';
export { wmsInterceptor } from './interceptor';
export { NetworkState } from './network';
export { type Peer, Presence, PRESENCE_APP, type PresenceState } from './presence';

/**
 * HttpClient와 서버 연결을 한 번에 등록합니다.
 * @param app 접속 표시에 보일 앱 이름
 * @param authStorage 로그인 토큰을 둘 곳(백오피스는 탭마다 session, 현장 앱은 기기에 local)
 */
export function provideWmsClient(
  options?: WmsServerOptions,
  app?: string,
  authStorage?: 'session' | 'local',
): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([wmsInterceptor])),
    ...(app ? [{ provide: PRESENCE_APP, useValue: app }] : []),
    ...(authStorage ? [{ provide: AUTH_STORAGE, useValue: authStorage }] : []),
    ...(options ? [{ provide: WMS_SERVER_OPTIONS, useValue: options }] : []),
  ]);
}
