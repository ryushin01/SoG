import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { check, healthSchema, type ChangeEvent } from '@sog/domain';
import type { WmsServer, WmsServerOptions } from '@sog/wms-server';
import { LiveSync } from './live';

export const WMS_SERVER_OPTIONS = new InjectionToken<WmsServerOptions>('WMS_SERVER_OPTIONS', {
  factory: () => ({ latency: [120, 380] }),
});

export type WmsMode = 'local' | 'remote';

const MODE_KEY = 'sog:mode';

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
  private readonly live = inject(LiveSync);
  private serverPromise: Promise<WmsServer> | null = null;
  private modePromise: Promise<WmsMode> | null = null;
  private feedStarted = false;
  private readonly listeners = new Set<(event: ChangeEvent) => void>();

  readonly mode = signal<WmsMode | null>(null);
  /**
   * 공개 데모 배포인데 DB(실제 서버)에 닿지 않아 브라우저 안 데모 서버로 대신 보여 주는 중인지.
   * 화면이 `role="status"` 안내를 띄웁니다.
   */
  readonly fallback = signal(false);
  /** 마지막으로 받은 변경 알림 */
  readonly lastChange = signal<ChangeEvent | null>(null);
  /** 이 탭의 식별자. 자기 변경인지 구분합니다. 실제 서버 모드에서는 x-sog-origin으로 보냅니다. */
  readonly origin = signal<string>(Math.random().toString(36).slice(2, 10));

  /**
   * 데이터를 어디에 둘지 정합니다.
   * - 기기에 마지막으로 확인한 모드가 있으면 그 모드로 바로 시작하고, 상태 확인은 뒤에서 합니다(앱을 열 때마다
   *   왕복 한 번을 기다리지 않게). 뒤에서 확인한 모드가 다르면(배포 구성이 바뀐 드문 경우) 기억하고 다시 엽니다.
   * - 처음 열면 상태 확인을 기다립니다. 연결이 안 되면 데모 모드입니다.
   */
  ready(): Promise<WmsMode> {
    this.modePromise ??= (async () => {
      const remembered = readMode();
      const checked = checkMode().then((result) => {
        if (result?.fallback) this.fallback.set(true);
        return result?.mode ?? null;
      });
      if (remembered) {
        void checked.then((mode) => {
          // 새 모드가 기기에 저장됐을 때만 다시 엽니다. 저장 공간이 가득 차 쓰지 못하면 다시 열어도
          // 옛 모드를 읽어 같은 일이 되풀이되므로(새로 고침 반복), 이번에는 기억한 모드로 계속합니다.
          if (mode && mode !== remembered && readMode() === mode) this.reload();
        });
        this.mode.set(remembered);
        return remembered;
      }
      const mode = (await checked) ?? 'local';
      this.mode.set(mode);
      return mode;
    })();
    return this.modePromise;
  }

  /** 모드가 바뀌어 다시 열 때. 테스트에서 바꿉니다. */
  protected reload(): void {
    if (typeof location !== 'undefined') location.reload();
  }

  /**
   * 브라우저 안 데모 서버(local 모드에서만). 운영(실제 서버 모드)에서는 받지 않도록 따로 나눠 둔 조각을
   * 데모 모드로 정해졌을 때 받습니다(업무 서버·시드 약 60 kB).
   */
  server(): Promise<WmsServer> {
    this.serverPromise ??= import('@sog/wms-server')
      .then(async ({ createWmsServer }) => {
        const server = await createWmsServer(this.options);
        this.origin.set(server.origin);
        server.subscribe((event) => this.dispatch(event));
        return server;
      })
      .catch((error: unknown) => {
        // 조각을 못 받았거나(연결 끊김 등) 서버를 열지 못했으면 기억하지 않고, 다음 요청에서 다시 시도합니다.
        this.serverPromise = null;
        throw error;
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
    // 실제 서버의 변경은 실시간 반영(접속 표시와 한 요청)으로 순번을 이어 받습니다.
    this.live.onEvent((event) => this.dispatch(event));
    this.live.start();
  }
}

/**
 * /api/health로 실제 서버가 있는지 묻습니다. 정할 수 없으면(서버 일시 오류, 오프라인) null.
 * 404(API가 없는 정적 배포)·503(DB를 연결하지 않은 배포)은 데모 모드입니다.
 */
async function checkMode(): Promise<{ mode: WmsMode; fallback: boolean } | null> {
  try {
    const response = await fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const body = check(healthSchema(), await response.json());
      const mode: WmsMode = body.ok && body.value.mode === 'remote' ? 'remote' : 'local';
      writeMode(mode);
      return { mode, fallback: false };
    }
    if (response.status === 404 || response.status === 503) {
      writeMode('local');
      // 공개 데모에서 DB가 끊겼으면 Worker가 503과 DB_UNAVAILABLE을 알립니다(DB를 붙이지 않은 배포와 구분).
      const body = check(healthSchema(), await response.json().catch(() => null));
      return { mode: 'local', fallback: body.ok && body.value.code === 'DB_UNAVAILABLE' };
    }
    // 서버 일시 오류(500 등)로 실제 서버 사용자를 데모 데이터로 보내지 않습니다.
    return null;
  } catch {
    // 오프라인으로 연 현장 앱이 데모 데이터로 바뀌지 않도록, 마지막으로 확인한 모드를 씁니다.
    return null;
  }
}
