import { HttpClient } from '@angular/common/http';
import { inject, Injectable, type ResourceStreamItem, type Signal, signal } from '@angular/core';
import type { CountTask, CountTaskDetail, CountTaskSummary } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch, toApiError } from '@/shared/api';
import { KeyValueStore, LOCAL_DB_NAME } from '@/shared/lib';

export interface Cached<T> {
  data: T;
  /** 네트워크가 안 돼 기기에 남은 사본을 보여 주는지 */
  fromCache: boolean;
  savedAt: string;
}

interface CacheEntry {
  data: unknown;
  savedAt: string;
}

/**
 * 실사 작업 저장소. 받은 내용은 기기에 남겨 오프라인에서도 작업을 열 수 있게 합니다.
 * 화면은 `watchList`·`watchDetail`로 기기 사본을 먼저 보여 주고 네트워크 응답이 오면 바꿉니다
 * (작업 → 품목으로 갈 때마다 서버 왕복을 기다리지 않게).
 */
@Injectable({ providedIn: 'root' })
export class TaskRepository {
  private readonly http = inject(HttpClient);
  private readonly cache = new KeyValueStore<CacheEntry>(inject(LOCAL_DB_NAME), 'cache');
  /** 이번에 연 앱에서 받은 사본. IndexedDB까지 가지 않고 바로 보여 줍니다. */
  private readonly memory = new Map<string, CacheEntry>();

  async list(assigneeId: string): Promise<Cached<CountTaskSummary[]>> {
    const result = await this.networkFirst(`list:${assigneeId}`, () => this.fetchList(assigneeId));
    if (!result.fromCache) void this.prefetch(result.data);
    return result;
  }

  /** 배정된 진행 중 작업을 미리 받아 두어, 창고 음영 지역에서 처음 여는 작업도 열리게 합니다. */
  private async prefetch(tasks: CountTaskSummary[]): Promise<void> {
    for (const task of tasks.filter((t) => t.status === 'open' || t.status === 'in_progress')) {
      await this.detail(task.id).catch(() => undefined);
    }
  }

  detail(taskId: string): Promise<Cached<CountTaskDetail>> {
    return this.networkFirst(`task:${taskId}`, () => this.fetchDetail(taskId));
  }

  /** 작업 목록: 사본을 먼저 내보내고 새로 받습니다(resource의 stream으로 씀). */
  watchList(assigneeId: string): Promise<Signal<ResourceStreamItem<Cached<CountTaskSummary[]>>>> {
    return this.revalidate(
      `list:${assigneeId}`,
      () => this.fetchList(assigneeId),
      (tasks) => void this.prefetch(tasks),
    );
  }

  /** 작업 상세: 사본을 먼저 내보내고 새로 받습니다(resource의 stream으로 씀). */
  watchDetail(taskId: string): Promise<Signal<ResourceStreamItem<Cached<CountTaskDetail>>>> {
    return this.revalidate(`task:${taskId}`, () => this.fetchDetail(taskId));
  }

  private async fetchList(assigneeId: string): Promise<CountTaskSummary[]> {
    const page = await firstValueFrom(
      this.http.get<{ items: CountTaskSummary[] }>('/api/counts', { params: { assigneeId } }),
    );
    return page.items;
  }

  private fetchDetail(taskId: string): Promise<CountTaskDetail> {
    return firstValueFrom(this.http.get<CountTaskDetail>(`/api/counts/${taskId}`));
  }

  submit(taskId: string, version: number): Promise<CountTask> {
    return firstValueFrom(
      this.http.post<CountTask>(`/api/counts/${taskId}/submit`, null, {
        headers: ifMatch(version),
      }),
    );
  }

  private async networkFirst<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
    try {
      return await this.fetchAndKeep(key, fetcher);
    } catch (error) {
      if (toApiError(error).code !== 'NETWORK') throw error;
      const cached = await this.saved(key);
      if (!cached) throw error;
      return { data: cached.data as T, fromCache: true, savedAt: cached.savedAt };
    }
  }

  /**
   * 사본이 있으면 바로 내보내고(오프라인 안내 없이), 네트워크 응답이 오면 바꿉니다. 네트워크가 끊겼으면 같은 사본에
   * 오프라인 안내를 붙이고, 다른 오류(로그인 만료, 없는 작업 등)는 그대로 알립니다. 사본이 없으면 지금처럼 기다립니다.
   * 저장은 그때의 버전(If-Match)으로 보내므로, 사본이 낡았으면 충돌로 안내됩니다.
   */
  private async revalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    onFresh?: (data: T) => void,
  ): Promise<Signal<ResourceStreamItem<Cached<T>>>> {
    const fresh = this.fetchAndKeep(key, fetcher).then((result) => {
      onFresh?.(result.data);
      return result;
    });
    // 사본을 읽는 사이 먼저 실패해도(오프라인이면 바로 실패) 처리하지 않은 거부로 잡히지 않게 합니다.
    void fresh.catch(() => undefined);
    const cached = await this.saved(key);
    if (!cached) {
      try {
        return signal({ value: await fresh });
      } catch (error) {
        const offline = toApiError(error).code === 'NETWORK';
        const late = offline ? await this.saved(key) : undefined;
        return signal(
          late
            ? { value: { data: late.data as T, fromCache: true, savedAt: late.savedAt } }
            : { error: asError(error) },
        );
      }
    }
    const stream = signal<ResourceStreamItem<Cached<T>>>({
      value: { data: cached.data as T, fromCache: false, savedAt: cached.savedAt },
    });
    fresh.then(
      (value) => stream.set({ value }),
      (error: unknown) =>
        stream.set(
          toApiError(error).code === 'NETWORK'
            ? { value: { data: cached.data as T, fromCache: true, savedAt: cached.savedAt } }
            : { error: asError(error) },
        ),
    );
    return stream;
  }

  private async fetchAndKeep<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
    const data = await fetcher();
    const savedAt = new Date().toISOString();
    this.memory.set(key, { data, savedAt });
    void this.cache.set(key, { data, savedAt }).catch(() => undefined);
    return { data, fromCache: false, savedAt };
  }

  /** 기기 사본(이번에 받은 것이 있으면 그것, 없으면 IndexedDB) */
  private async saved(key: string): Promise<CacheEntry | undefined> {
    return this.memory.get(key) ?? (await this.cache.get(key).catch(() => undefined));
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(toApiError(error).message, { cause: error });
}
