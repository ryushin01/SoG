import {
  HttpErrorResponse,
  HttpHeaders,
  type HttpEvent,
  type HttpInterceptorFn,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ApiError } from '@sog/domain';
import { Observable } from 'rxjs';
import { WmsHost } from './host';
import { NetworkState } from './network';

/** 요청을 보내는 사용자. 실제 서비스의 인증 토큰 대신 x-sog-user 헤더로 보냅니다. */
@Injectable({ providedIn: 'root' })
export class ApiIdentity {
  readonly userId = signal('u-kim');
}

/**
 * /api로 가는 요청을 브라우저 안의 데모 서버로 보냅니다.
 * 응답은 실제 HTTP처럼 HttpResponse/HttpErrorResponse로 돌려주므로 화면 코드는 서버 위치를 모릅니다.
 */
export const wmsInterceptor: HttpInterceptorFn = (request, next) => {
  const path = request.url.replace(/^https?:\/\/[^/]+/, '');
  if (!path.startsWith('/api/')) return next(request);

  const host = inject(WmsHost);
  const network = inject(NetworkState);
  const identity = inject(ApiIdentity);

  return new Observable<HttpEvent<unknown>>((subscriber) => {
    let cancelled = false;
    if (!network.online()) {
      const body: ApiError = { code: 'NETWORK', message: '네트워크에 연결되어 있지 않습니다.' };
      subscriber.error(
        new HttpErrorResponse({ status: 0, statusText: 'Offline', error: body, url: request.url }),
      );
      return;
    }
    const headers: Record<string, string> = { 'x-sog-user': identity.userId() };
    for (const key of request.headers.keys()) headers[key] = request.headers.get(key) ?? '';
    const query = request.params.toString();

    host
      .server()
      .then((server) =>
        server.handle({
          method: request.method,
          url: query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path,
          headers,
          body: request.body,
        }),
      )
      .then((response) => {
        if (cancelled) return;
        const responseHeaders = new HttpHeaders(response.headers);
        if (response.status >= 200 && response.status < 300) {
          subscriber.next(
            new HttpResponse({
              status: response.status,
              body: response.body,
              headers: responseHeaders,
              url: request.url,
            }),
          );
          subscriber.complete();
        } else {
          subscriber.error(
            new HttpErrorResponse({
              status: response.status,
              error: response.body,
              headers: responseHeaders,
              url: request.url,
            }),
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        subscriber.error(
          new HttpErrorResponse({
            status: 500,
            error: {
              code: 'VALIDATION',
              message: error instanceof Error ? error.message : String(error),
            },
            url: request.url,
          }),
        );
      });

    // 구독을 끊으면(예: 검색어가 바뀌어 이전 요청 취소) 결과를 버립니다.
    return () => {
      cancelled = true;
    };
  });
};
