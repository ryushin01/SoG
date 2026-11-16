import { DestroyRef, inject, Injectable } from '@angular/core';
import type { ChangeEvent } from '@sog/domain';
import { AuthSession } from './auth';

/** 실시간 반영 간격(ms): 화면을 보며 조작 중일 때 */
export const LIVE_ACTIVE_MS = 2_500;
/** 화면은 보이지만 1분 넘게 조작이 없을 때 */
export const LIVE_IDLE_MS = 10_000;
/** 다른 탭에 가려져 있을 때 */
export const LIVE_HIDDEN_MS = 15_000;
/** 조작이 없다고 보는 시간 */
export const IDLE_AFTER_MS = 60_000;
/** 이만큼 가려져 있으면 멈췄다가 다시 보이면 곧바로 이어 받습니다(순번으로 이어 받아 빠지는 변경 없음). */
export const STOP_HIDDEN_AFTER_MS = 120_000;
/** 요청 하나(응답 본문까지)를 기다리는 최대 시간. 멈춘 요청이 다음 차례를 영영 막지 않게 합니다. */
export const LIVE_TIMEOUT_MS = 15_000;

/** 접속 신호에 실을 이 탭의 위치. 사용자는 서버가 토큰으로 정합니다. */
export interface LiveHere {
  tabId: string;
  app: string;
  resource: string;
  editing: boolean;
  detail: string;
}

export interface LiveTiming {
  now: number;
  /** 지금 가려져 있는지 */
  hidden: boolean;
  /** 가려진 때(보이면 null) */
  hiddenSince: number | null;
  /** 마지막으로 누르거나 입력한 때 */
  lastInput: number;
}

/** 다음 차례까지 기다릴 시간. null이면 다시 보일 때까지 멈춥니다. */
export function liveDelay({ now, hidden, hiddenSince, lastInput }: LiveTiming): number | null {
  if (hidden) {
    return hiddenSince !== null && now - hiddenSince >= STOP_HIDDEN_AFTER_MS
      ? null
      : LIVE_HIDDEN_MS;
  }
  return now - lastInput >= IDLE_AFTER_MS ? LIVE_IDLE_MS : LIVE_ACTIVE_MS;
}

const INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

/**
 * 실제 서버 모드의 실시간 반영. 변경 피드와 접속 표시를 `POST /api/live` 한 번으로 주고받습니다.
 * - 화면을 보며 조작 중이면 2.5초, 1분 넘게 조작이 없으면 10초, 가려지면 15초 간격.
 * - 2분 넘게 가려져 있으면 멈추고, 다시 보이면 곧바로 놓친 변경을 순번으로 이어 받습니다.
 * 탭마다 변경 피드(2.5초)·접속 표시 받기(3초)·보내기(5초)를 따로 부르던 때는 띄워 두기만 해도 하루 약 8만 건이라
 * Cloudflare·Hyperdrive 무료 한도(하루 10만)를 탭 두 개가 다 썼습니다.
 */
@Injectable({ providedIn: 'root' })
export class LiveSync {
  private readonly auth = inject(AuthSession);
  private readonly eventListeners = new Set<(event: ChangeEvent) => void>();
  private readonly peerListeners = new Set<(peers: unknown[]) => void>();
  private here: (() => LiveHere | null) | null = null;
  private cursor: string | null = null;
  private started = false;
  private stopped = false;
  private wake: (() => void) | null = null;
  /** 보내는 중에 poke()가 오면 끝나자마자 한 번 더 보냅니다. */
  private poked = false;
  private lastInput = Date.now();
  private hiddenSince: number | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.stopped = true;
      this.cleanups.splice(0).forEach((cleanup) => cleanup());
      this.wake?.();
    });
  }

  /** 처음 부를 때 한 번만 시작합니다. */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    if (typeof document !== 'undefined') {
      if (document.visibilityState === 'hidden') this.hiddenSince = Date.now();
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') {
          this.hiddenSince = Date.now();
          return;
        }
        // 다시 보이면 기다리지 않고 곧바로 이어 받습니다.
        this.hiddenSince = null;
        this.lastInput = Date.now();
        this.wake?.();
      };
      const onInput = () => {
        const wasIdle = Date.now() - this.lastInput >= IDLE_AFTER_MS;
        this.lastInput = Date.now();
        // 오래 쉬다 돌아왔으면 10초를 다 기다리지 않습니다.
        if (wasIdle) this.wake?.();
      };
      document.addEventListener('visibilitychange', onVisibility);
      for (const type of INPUT_EVENTS) {
        window.addEventListener(type, onInput, { passive: true, capture: true });
      }
      this.cleanups.push(() => {
        document.removeEventListener('visibilitychange', onVisibility);
        for (const type of INPUT_EVENTS)
          window.removeEventListener(type, onInput, { capture: true });
      });
    }
    void this.run();
  }

  /** 접속 신호에 실을 이 탭의 위치를 정합니다(Presence). */
  setHere(source: () => LiveHere | null): void {
    this.here = source;
  }

  onEvent(listener: (event: ChangeEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onPeers(listener: (peers: unknown[]) => void): () => void {
    this.peerListeners.add(listener);
    return () => this.peerListeners.delete(listener);
  }

  /** 다음 차례를 기다리지 않고 지금 보냅니다(보는 자원이나 수정 중 여부가 바뀌었을 때). */
  poke(): void {
    if (this.wake) this.wake();
    else this.poked = true;
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      this.poked = false;
      await this.tick();
      if (this.stopped) return;
      if (this.poked) continue;
      const delay = liveDelay({
        now: Date.now(),
        hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
        hiddenSince: this.hiddenSince,
        lastInput: this.lastInput,
      });
      await new Promise<void>((resolve) => {
        const timer = delay === null ? undefined : setTimeout(resolve, delay);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = null;
    }
  }

  private async tick(): Promise<void> {
    // 로그인하기 전에는 받지 않습니다.
    const token = this.auth.token();
    if (!token) return;
    try {
      // 기한은 응답 본문을 다 읽을 때까지 걸립니다(멈추면 끊고 다음 차례에 다시 보냄).
      const response = await fetch('/api/live', {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ after: this.cursor, here: this.here?.() ?? null }),
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        cursor: string;
        items: ChangeEvent[];
        peers: unknown[];
      };
      if (this.stopped) return;
      body.items.forEach((event) => this.eventListeners.forEach((listener) => listener(event)));
      this.cursor = body.cursor;
      this.peerListeners.forEach((listener) => listener(body.peers));
    } catch {
      // 오프라인이면 다음 차례에 다시 시도합니다. 순번으로 이어 받아 빠지는 변경이 없습니다.
    }
  }
}
