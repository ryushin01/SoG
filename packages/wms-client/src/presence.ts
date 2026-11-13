import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  InjectionToken,
  type Signal,
  signal,
} from '@angular/core';
import { WmsHost } from './host';
import { ApiIdentity } from './interceptor';

export interface PresenceState {
  /** 수정 중인지. 저장하지 않은 입력이 있으면 true */
  editing?: boolean;
  /** 화면에 덧붙여 보여 줄 짧은 설명(예: 세고 있는 품목 이름) */
  detail?: string;
}

export interface Peer {
  tabId: string;
  userId: string;
  app: string;
  resource: string;
  editing: boolean;
  detail: string;
  at: number;
}

type Message = { type: 'here'; peer: Peer } | { type: 'leave'; tabId: string } | { type: 'ping' };

/** 앱 이름(백오피스, 현장 앱). 다른 사람이 어느 앱에서 보고 있는지 보여 줄 때 씁니다. */
export const PRESENCE_APP = new InjectionToken<string>('PRESENCE_APP', { factory: () => 'app' });

const CHANNEL = 'sog-presence';
const HEARTBEAT_MS = 5_000;
const EXPIRE_MS = 15_000;
const REMOTE_POLL_MS = 3_000;

/**
 * 실시간 접속 표시. 같은 브라우저의 다른 탭(다른 사용자, 현장 앱)이 어느 자원을 보고 있는지,
 * 수정 중인지를 BroadcastChannel로 주고받습니다. 충돌이 나기 전에 미리 알 수 있게 하는 장치로,
 * 저장의 정합성은 여전히 버전 검사(If-Match)가 지킵니다.
 */
@Injectable({ providedIn: 'root' })
export class Presence {
  private readonly identity = inject(ApiIdentity);
  private readonly app = inject(PRESENCE_APP);
  private readonly host = inject(WmsHost);
  private readonly tabId = Math.random().toString(36).slice(2, 10);
  private readonly channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  private readonly peersById = signal<ReadonlyMap<string, Peer>>(new Map());
  private readonly now = signal(Date.now());
  private mine: Omit<Peer, 'tabId' | 'userId' | 'app' | 'at'> | null = null;

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent<unknown>) =>
      this.receive(event.data),
    );
    const timer = setInterval(() => {
      this.now.set(Date.now());
      this.announce();
    }, HEARTBEAT_MS);
    const leave = () => this.send({ type: 'leave', tabId: this.tabId });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', leave);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      leave();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', leave);
      this.channel?.close();
    });
    // 새로 연 탭이 다른 탭의 현재 위치를 바로 알 수 있게 물어봅니다.
    this.send({ type: 'ping' });
    // 실제 서버 모드에서는 다른 기기의 접속 정보를 서버에서 받아 옵니다.
    // 모드를 알기 전에 이 서비스가 정리될 수 있으므로, 정리된 뒤에는 폴링을 시작하지 않습니다.
    let poll: ReturnType<typeof setInterval> | undefined;
    let destroyed = false;
    void this.host.ready().then((mode) => {
      if (destroyed || mode !== 'remote') return;
      void this.pull();
      poll = setInterval(() => void this.pull(), REMOTE_POLL_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      clearInterval(poll);
    });
  }

  /**
   * 이 화면이 어떤 자원을 보고 있는지 알립니다. 컴포넌트가 사라지면 자동으로 떠납니다.
   * @param resource 예: `skus/sku-10201`, `counts/ct-003`
   */
  track(resource: () => string | null, state: () => PresenceState = () => ({})): void {
    effect(() => {
      const current = resource();
      const { editing = false, detail = '' } = state();
      this.identity.userId();
      this.mine = current ? { resource: current, editing, detail } : null;
      if (this.mine) this.announce();
      else this.send({ type: 'leave', tabId: this.tabId });
    });
    inject(DestroyRef).onDestroy(() => {
      this.mine = null;
      this.send({ type: 'leave', tabId: this.tabId });
    });
  }

  /** 같은 자원(앞부분이 같은 자원 포함)을 보고 있는 다른 탭. 같은 사람이 연 다른 탭도 따로 셉니다. */
  peers(resource: () => string): Signal<Peer[]> {
    return computed(() => {
      const target = resource();
      const now = this.now();
      return [...this.peersById().values()]
        .filter((peer) => now - peer.at < EXPIRE_MS)
        .filter((peer) => peer.resource === target || peer.resource.startsWith(`${target}/`))
        .sort((a, b) => Number(b.editing) - Number(a.editing) || a.userId.localeCompare(b.userId));
    });
  }

  private announce(): void {
    if (!this.mine) return;
    this.send({
      type: 'here',
      peer: {
        ...this.mine,
        tabId: this.tabId,
        userId: this.identity.userId(),
        app: this.app,
        at: Date.now(),
      },
    });
  }

  private receive(raw: unknown): void {
    // 같은 출처의 어떤 코드든 이 채널에 보낼 수 있으므로 모양을 확인한 뒤 씁니다.
    const message = parseMessage(raw);
    if (!message) return;
    if (message.type === 'ping') {
      this.announce();
      return;
    }
    const next = new Map(this.peersById());
    if (message.type === 'leave') next.delete(message.tabId);
    else if (message.peer.tabId !== this.tabId)
      next.set(message.peer.tabId, { ...message.peer, at: Date.now() });
    this.peersById.set(next);
    this.now.set(Date.now());
  }

  private send(message: Message): void {
    if (this.host.mode() === 'remote') {
      this.sendRemote(message);
      return;
    }
    try {
      this.channel?.postMessage(message);
    } catch {
      // 닫힌 채널에는 보내지 않습니다.
    }
  }

  private sendRemote(message: Message): void {
    if (message.type === 'here') {
      const { at: _at, ...peer } = message.peer;
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(peer),
        keepalive: true,
      }).catch(() => undefined);
    } else if (message.type === 'leave') {
      void fetch(`/api/presence/${encodeURIComponent(message.tabId)}`, {
        method: 'DELETE',
        keepalive: true,
      }).catch(() => undefined);
    }
  }

  private async pull(): Promise<void> {
    try {
      const response = await fetch('/api/presence', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as { items: unknown[] };
      const next = new Map<string, Peer>();
      for (const raw of body.items) {
        const message = parseMessage({ type: 'here', peer: raw });
        if (message?.type === 'here' && message.peer.tabId !== this.tabId)
          next.set(message.peer.tabId, message.peer);
      }
      this.peersById.set(next);
      this.now.set(Date.now());
    } catch {
      // 오프라인이면 다음 차례에 다시 받습니다.
    }
  }
}

function parseMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value['type'] === 'ping') return { type: 'ping' };
  if (value['type'] === 'leave' && typeof value['tabId'] === 'string') {
    return { type: 'leave', tabId: value['tabId'] };
  }
  const peer = value['peer'] as Record<string, unknown> | undefined;
  if (
    value['type'] === 'here' &&
    peer &&
    typeof peer === 'object' &&
    typeof peer['tabId'] === 'string' &&
    typeof peer['userId'] === 'string' &&
    typeof peer['resource'] === 'string'
  ) {
    return {
      type: 'here',
      peer: {
        tabId: peer['tabId'],
        userId: peer['userId'],
        resource: peer['resource'],
        app: typeof peer['app'] === 'string' ? peer['app'] : '',
        editing: peer['editing'] === true,
        detail: typeof peer['detail'] === 'string' ? peer['detail'].slice(0, 120) : '',
        at: Date.now(),
      },
    };
  }
  return null;
}
