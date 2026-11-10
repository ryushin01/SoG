import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import type { WmsServerOptions } from '@sog/wms-server';
import { WMS_SERVER_OPTIONS } from './host';
import { wmsInterceptor } from './interceptor';

export { WMS_SERVER_OPTIONS, WmsHost } from './host';
export { idempotencyKey, ifMatch, isVersionConflict, SubmitLock, toApiError } from './http';
export { ApiIdentity, wmsInterceptor } from './interceptor';
export { NetworkState } from './network';

/** HttpClient와 데모 서버 연결을 한 번에 등록합니다. */
export function provideWmsClient(options?: WmsServerOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([wmsInterceptor])),
    ...(options ? [{ provide: WMS_SERVER_OPTIONS, useValue: options }] : []),
  ]);
}
