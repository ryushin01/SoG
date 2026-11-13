import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import type { ChangeEvent } from '@sog/domain';
import { createWmsServer, type WmsServer, type WmsServerOptions } from '@sog/wms-server';
import { AuthSession } from './auth';

export const WMS_SERVER_OPTIONS = new InjectionToken<WmsServerOptions>('WMS_SERVER_OPTIONS', {
  factory: () => ({ latency: [120, 380] }),
});

export type WmsMode = 'local' | 'remote';

const MODE_KEY = 'sog:mode';
const POLL_VISIBLE_MS = 2_500;
const POLL_HIDDEN_MS = 10_000;

function readMode(): WmsMode | null {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === 'remote' || value === 'local' ? value : null;
  } catch {
    return null;
  }
}

function writeMode(mode: WmsMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 저장하지 못하면 다음에 다시 확인합니다.
  }
}

/**
 * 데이터를 어디에 둘지 정하고, 다른 탭·기기의 변경을 신호로 알려 줍니다.
 * - remote: /api/health가 실제 서버를 알리면(운영 배포) 요청을 서버로 보내고, 변경 피드를 이어 받습니다.
 * - local: 실제 서버가 없으면(개발 서버, 미리보기 배포) 브라우저 안 데모 서버를 씁니다.
 */
@Injectable({ providedIn: 'root' })
export class WmsHost {
  private readonly options = inject(WMS_SERVER_OPTIONS);
  private readonly auth = inject(AuthSession);
  private serverPromise: Promise<WmsServer> | null = null;
  private modePromise: Promise<WmsMode> | null = null;
  private feedStarted = false;
  private readonly listeners = new Set<(event: ChangeEvent) => void>();

  readonly mode = signal<WmsMode | null>(null);
  /** 마지막으로 받은 변경 알림 */
  readonly lastChange = signal<ChangeEvent | null>(null);
  /** 이 탭의 식별자. 자기 변경인지 구분합니다. 실제 서버 모드에서는 x-sog-origin으로 보냅니다. */
  readonly origin = signal<string>(Math.random().toString(36).slice(2, 10));

  /** 실제 서버가 있는지 한 번 확인합니다. 연결이 안 되면 마지막으로 확인한 모드를 씁니다. */
  ready(): Promise<WmsMode> {
    this.modePromise ??= (async () => {
      let mode: WmsMode;
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(4000),
        });
        if (response.ok) {
          const body = (await response.json()) as { mode?: string };
          mode = body.mode === 'remote' ? 'remote' : 'local';
          writeMode(mode);
        } else if (response.status === 404 || response.status === 503) {
          // 404: API가 없는 정적 배포, 503: DB를 연결하지 않은 배포. 둘 다 데모 모드입니다.
          mode = 'local';
          writeMode(mode);
        } else {
          // 서버 일시 오류(500 등)로 실제 서버 사용자를 데모 데이터로 보내지 않습니다.
          mode = readMode() ?? 'local';
        }
      } catch {
        // 오프라인으로 연 현장 앱이 데모 데이터로 바뀌지 않도록, 마지막으로 확인한 모드를 씁니다.
        mode = readMode() ?? 'local';
      }
      this.mode.set(mode);
      return mode;
    })();
    return this.modePromise;
  }

  /** 브라우저 안 데모 서버(local 모드에서만) */
  server(): Promise<WmsServer> {
    this.serverPromise ??= createWmsServer(this.options).then((server) => {
      this.origin.set(server.origin);
      server.subscribe((event) => this.dispatch(event));
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
    void this.start();
  }

  isOwn(event: ChangeEvent): boolean {
    return event.origin === this.origin();
  }

  private dispatch(event: ChangeEvent): void {
    this.lastChange.set(event);
    this.listeners.forEach((listener) => listener(event));
  }

  private async start(): Promise<void> {
    const mode = await this.ready();
    if (mode === 'local') {
      await this.server();
      return;
    }
    if (this.feedStarted) return;
    this.feedStarted = true;
    void this.followFeed();
  }

  /** 실제 서버의 변경 피드를 순번으로 이어 받습니다. 끊겨도 놓친 변경은 다음 요청에서 받습니다. */
  private async followFeed(): Promise<void> {
    let cursor: string | null = null;
    for (;;) {
      try {
        const url: string = cursor === null ? '/api/changes' : `/api/changes?after=${cursor}`;
        const token = this.auth.token();
        // 로그인하기 전에는 변경을 받지 않습니다.
        const response = token
          ? await fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
          : null;
        if (response?.ok) {
          const body = (await response.json()) as { cursor: string; items: ChangeEvent[] };
          body.items.forEach((event) => this.dispatch(event));
          cursor = body.cursor;
        }
      } catch {
        // 오프라인이면 다음 차례에 다시 시도합니다.
      }
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      await new Promise((resolve) =>
        setTimeout(resolve, hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS),
      );
    }
  }
}
