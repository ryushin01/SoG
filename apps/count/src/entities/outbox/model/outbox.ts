import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import type { CountLineView, SubmitCountLineRequest } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { AuthSession, idempotencyKey, ifMatch, NetworkState, toApiError } from '@/shared/api';
import { KeyValueStore, LOCAL_DB_NAME } from '@/shared/lib';

export type OutboxState = 'pending' | 'sending' | 'conflict' | 'failed';

export interface OutboxItem {
  /** 멱등 키를 겸합니다. 같은 항목을 몇 번 보내도 서버는 한 번만 반영합니다. */
  id: string;
  taskId: string;
  lineId: string;
  skuName: string;
  locationCode: string;
  /** 셀 때 본 실사 항목의 버전(If-Match) */
  baseVersion: number;
  countedQty: number;
  note: string;
  createdAt: string;
  state: OutboxState;
  message: string | null;
  attempts: number;
}

export type NewOutboxItem = Pick<
  OutboxItem,
  'taskId' | 'lineId' | 'skuName' | 'locationCode' | 'baseVersion' | 'countedQty' | 'note'
>;

const RETRY_MS = 15_000;

/**
 * 보낼함. 센 수량은 먼저 기기(IndexedDB)에 저장하고, 연결되어 있으면 바로, 끊겨 있으면 다시 연결될 때 보냅니다.
 * 한 번에 하나씩 순서대로 보내고, 412(그사이 관리자가 재실사 요청 등)나 409(작업이 이미 제출·취소됨)는 충돌로 남겨
 * 작업자가 직접 다시 세게 합니다. 자동으로 덮어쓰지 않습니다.
 */
@Injectable({ providedIn: 'root' })
export class Outbox {
  private readonly http = inject(HttpClient);
  private readonly network = inject(NetworkState);
  private readonly auth = inject(AuthSession);
  private readonly store = new KeyValueStore<OutboxItem>(inject(LOCAL_DB_NAME), 'outbox');
  private flushing = false;

  readonly items = signal<OutboxItem[]>([]);
  readonly ready = signal(false);
  readonly waiting = computed(() =>
    this.items().filter((item) => item.state === 'pending' || item.state === 'sending'),
  );
  readonly conflicts = computed(() =>
    this.items().filter((item) => item.state === 'conflict' || item.state === 'failed'),
  );
  readonly syncing = signal(false);
  /** 마지막으로 서버에 반영된 항목 */
  readonly lastSynced = signal<{ lineId: string; at: string } | null>(null);

  constructor() {
    void this.restore();
    effect(() => {
      // 연결되어 있고 로그인되어 있으면 보냅니다(다시 로그인하면 남은 기록을 바로 보냄).
      if (this.network.online() && this.ready() && this.auth.signedIn()) void this.flush();
    });
    const timer = setInterval(() => {
      if (this.waiting().length > 0) void this.flush();
    }, RETRY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  forLine(lineId: string): OutboxItem | undefined {
    return this.items().find((item) => item.lineId === lineId);
  }

  forTask(taskId: string): OutboxItem[] {
    return this.items().filter((item) => item.taskId === taskId);
  }

  /** 같은 줄의 보내지 않은 기록은 새 기록으로 바꿉니다(마지막으로 센 수량이 이깁니다). */
  async enqueue(input: NewOutboxItem): Promise<OutboxItem> {
    const previous = this.items().find(
      (item) => item.lineId === input.lineId && item.state !== 'sending',
    );
    const item: OutboxItem = {
      ...input,
      id: idempotencyKey(),
      createdAt: new Date().toISOString(),
      state: 'pending',
      message: null,
      attempts: 0,
    };
    if (previous) {
      // 기기에 쓰는 동안 보내기가 이전 기록을 집어 가지 않도록 목록에서 먼저 뺍니다.
      this.items.update((items) => items.filter((i) => i.id !== previous.id));
      try {
        // 지우기와 쓰기를 한 트랜잭션으로 묶어, 새 기록을 못 쓰면 이전 기록도 남깁니다.
        await this.store.replace(previous.id, item.id, item);
      } catch (error) {
        this.items.update((items) => [...items, previous]);
        throw error;
      }
      this.items.update((items) => [...items, item]);
    } else {
      await this.save(item, true);
    }
    void this.flush();
    return item;
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id).catch(() => undefined);
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  /** 실패한 항목을 다시 보냅니다. 충돌 항목은 다시 세어야 하므로 여기서는 보내지 않습니다. */
  async retry(id: string): Promise<void> {
    const item = this.items().find((i) => i.id === id);
    if (!item || item.state !== 'failed') return;
    await this.save({ ...item, state: 'pending', message: null });
    await this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.network.online() || !this.auth.signedIn()) return;
    this.flushing = true;
    this.syncing.set(true);
    try {
      for (const item of [...this.items()]
        .filter((i) => i.state === 'pending')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (!this.network.online()) break;
        // 보내는 사이 새 기록으로 바뀌었거나 지워졌으면 건너뜁니다.
        const current = this.items().find((i) => i.id === item.id);
        if (current?.state !== 'pending') continue;
        const stop = await this.send(current);
        if (stop) break;
      }
    } finally {
      this.flushing = false;
      this.syncing.set(false);
    }
  }

  /** 보내고, 네트워크가 끊겼으면 true를 돌려 남은 항목 보내기를 멈춥니다. */
  private async send(item: OutboxItem): Promise<boolean> {
    await this.save({ ...item, state: 'sending', attempts: item.attempts + 1 });
    const body: SubmitCountLineRequest = { countedQty: item.countedQty, note: item.note };
    try {
      await firstValueFrom(
        this.http.put<CountLineView>(`/api/counts/${item.taskId}/lines/${item.lineId}`, body, {
          headers: { ...ifMatch(item.baseVersion), 'Idempotency-Key': item.id },
        }),
      );
      await this.remove(item.id);
      this.lastSynced.set({ lineId: item.lineId, at: new Date().toISOString() });
      return false;
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.code === 'UNAUTHENTICATED') {
        // 로그인이 풀렸으면 기록은 그대로 두고, 다시 로그인한 뒤 보냅니다.
        await this.save({
          ...item,
          state: 'pending',
          message: '다시 로그인하면 보냅니다.',
          attempts: item.attempts + 1,
        });
        return true;
      }
      if (apiError.code === 'NETWORK') {
        await this.save({ ...item, state: 'pending', attempts: item.attempts + 1 });
        return true;
      }
      if (apiError.code === 'VERSION_CONFLICT') {
        const current = apiError.current as CountLineView | undefined;
        const message =
          current?.status === 'recount'
            ? '관리자가 이 품목을 다시 세도록 요청했습니다. 다시 세어 저장해 주세요.'
            : '다른 기기에서 먼저 저장했습니다. 수량을 확인하고 다시 저장해 주세요.';
        await this.save({ ...item, state: 'conflict', message, attempts: item.attempts + 1 });
        return false;
      }
      const state: OutboxState = apiError.code === 'INVALID_STATE' ? 'conflict' : 'failed';
      await this.save({ ...item, state, message: apiError.message, attempts: item.attempts + 1 });
      return false;
    }
  }

  /**
   * 기기에 쓰고 목록을 바꿉니다. strict이면 기기 쓰기 실패를 그대로 던져, 새 기록이
   * 저장되지 않았는데 저장된 것처럼 보이지 않게 합니다(상태 전환 같은 내부 갱신은 strict가 아님).
   */
  private async save(item: OutboxItem, strict = false): Promise<void> {
    if (strict) {
      await this.store.set(item.id, item);
    } else {
      // 상태 갱신은 목록에 있는 항목에만 합니다. 그사이 새 기록으로 바뀐 항목을 되살리지 않습니다.
      if (!this.items().some((i) => i.id === item.id)) return;
      // 목록을 먼저 바꿔, 기기에 쓰는 동안 다른 작업이 옛 상태를 보지 않게 합니다.
      this.replaceInList(item);
      await this.store.set(item.id, item).catch(() => undefined);
      return;
    }
    this.replaceInList(item);
  }

  private replaceInList(item: OutboxItem): void {
    this.items.update((items) => {
      const index = items.findIndex((i) => i.id === item.id);
      if (index === -1) return [...items, item];
      const next = [...items];
      next[index] = item;
      return next;
    });
  }

  private async restore(): Promise<void> {
    const saved = await this.store.all().catch(() => [] as OutboxItem[]);
    // 보내던 중에 앱이 닫혔다면 다시 보낼 대상으로 돌립니다. 멱등 키 덕분에 두 번 반영되지 않습니다.
    this.items.set(
      saved.map((item) =>
        item.state === 'sending' ? { ...item, state: 'pending' as const } : item,
      ),
    );
    this.ready.set(true);
  }
}
