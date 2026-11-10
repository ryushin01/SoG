import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
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
 * 실사 작업 저장소. 네트워크를 먼저 쓰고, 받은 내용은 기기에 남겨 오프라인에서도 작업을 열 수 있게 합니다.
 */
@Injectable({ providedIn: 'root' })
export class TaskRepository {
  private readonly http = inject(HttpClient);
  private readonly cache = new KeyValueStore<CacheEntry>(inject(LOCAL_DB_NAME), 'cache');

  async list(assigneeId: string): Promise<Cached<CountTaskSummary[]>> {
    const result = await this.networkFirst(`list:${assigneeId}`, async () => {
      const page = await firstValueFrom(
        this.http.get<{ items: CountTaskSummary[] }>('/api/counts', { params: { assigneeId } }),
      );
      return page.items;
    });
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
    return this.networkFirst(`task:${taskId}`, () =>
      firstValueFrom(this.http.get<CountTaskDetail>(`/api/counts/${taskId}`)),
    );
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
      const data = await fetcher();
      const savedAt = new Date().toISOString();
      void this.cache.set(key, { data, savedAt }).catch(() => undefined);
      return { data, fromCache: false, savedAt };
    } catch (error) {
      if (toApiError(error).code !== 'NETWORK') throw error;
      const cached = await this.cache.get(key).catch(() => undefined);
      if (!cached) throw error;
      return { data: cached.data as T, fromCache: true, savedAt: cached.savedAt };
    }
  }
}
