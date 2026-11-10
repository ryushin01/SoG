import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { ChangeEvent } from '@sog/domain';
import { createWmsServer, type WmsServer, type WmsServerOptions } from '@sog/wms-server';

export const WMS_SERVER_OPTIONS = new InjectionToken<WmsServerOptions>('WMS_SERVER_OPTIONS', {
  factory: () => ({ latency: [120, 380] }),
});

/** 브라우저 안의 데모 서버를 한 번만 띄우고, 다른 탭의 변경을 신호로 알려 줍니다. */
@Injectable({ providedIn: 'root' })
export class WmsHost {
  private readonly options = inject(WMS_SERVER_OPTIONS);
  private serverPromise: Promise<WmsServer> | null = null;
  private readonly listeners = new Set<(event: ChangeEvent) => void>();

  /** 마지막으로 받은 변경 알림 */
  readonly lastChange = signal<ChangeEvent | null>(null);
  /** 이 탭의 서버 식별자. 자기 변경인지 구분합니다. */
  readonly origin = signal<string | null>(null);

  server(): Promise<WmsServer> {
    this.serverPromise ??= createWmsServer(this.options).then((server) => {
      this.origin.set(server.origin);
      server.subscribe((event) => {
        this.lastChange.set(event);
        this.listeners.forEach((listener) => listener(event));
      });
      return server;
    });
    return this.serverPromise;
  }

  /** 주제(topic)가 겹치는 변경이 오면 콜백을 부릅니다. 컴포넌트가 사라지면 자동으로 끊습니다. */
  onChange(
    topics: readonly string[],
    listener: (event: ChangeEvent) => void,
    destroyRef = inject(DestroyRef),
  ): void {
    const handler = (event: ChangeEvent) => {
      if (event.topics.includes('*') || event.topics.some((topic) => topics.includes(topic)))
        listener(event);
    };
    this.listeners.add(handler);
    destroyRef.onDestroy(() => this.listeners.delete(handler));
    void this.server();
  }

  isOwn(event: ChangeEvent): boolean {
    return event.origin === this.origin();
  }
}
