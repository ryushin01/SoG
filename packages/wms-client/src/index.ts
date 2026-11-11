import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import type { WmsServerOptions } from '@sog/wms-server';
import { WMS_SERVER_OPTIONS } from './host';
import { PRESENCE_APP } from './presence';
import { wmsInterceptor } from './interceptor';

export { WMS_SERVER_OPTIONS, WmsHost, type WmsMode } from './host';
export { idempotencyKey, ifMatch, isVersionConflict, SubmitLock, toApiError } from './http';
export { ApiIdentity, wmsInterceptor } from './interceptor';
export { NetworkState } from './network';
export { type Peer, Presence, PRESENCE_APP, type PresenceState } from './presence';

/** HttpClient와 데모 서버 연결을 한 번에 등록합니다. */
export function provideWmsClient(options?: WmsServerOptions, app?: string): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([wmsInterceptor])),
    ...(app ? [{ provide: PRESENCE_APP, useValue: app }] : []),
    ...(options ? [{ provide: WMS_SERVER_OPTIONS, useValue: options }] : []),
  ]);
}
