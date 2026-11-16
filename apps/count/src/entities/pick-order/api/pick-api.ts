import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { OrderDetail, OrderSummary, PickRequest, ShipmentOrder } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch, toApiError } from '@/shared/api';
import { KeyValueStore, LOCAL_DB_NAME } from '@/shared/lib';

/** 받은 내용. 네트워크가 안 되면 기기에 남은 사본을 씁니다. */
export interface PickCopy<T> {
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
 * 출고 지시(피킹). 받은 목록과 동선은 기기에 남겨 창고 음영 지역에서도 볼 수 있게 합니다.
 * 집음 확인은 재고 예약과 바로 맞물려 연결된 상태에서만 저장합니다(오프라인 보낼함에 넣지 않음).
 */
@Injectable({ providedIn: 'root' })
export class PickApi {
  private readonly http = inject(HttpClient);
  private readonly cache = new KeyValueStore<CacheEntry>(inject(LOCAL_DB_NAME), 'cache');

  async list(assigneeId: string): Promise<PickCopy<OrderSummary[]>> {
    const result = await this.networkFirst(`picks:${assigneeId}`, () =>
      firstValueFrom(
        this.http.get<{ items: OrderSummary[] }>('/api/orders', {
          params: { assigneeId, status: 'reserved,picking,picked' },
        }),
      ).then((page) => page.items),
    );
    if (!result.fromCache) void this.prefetch(result.data);
    return result;
  }

  detail(id: string): Promise<PickCopy<OrderDetail>> {
    return this.networkFirst(`pick:${id}`, () =>
      firstValueFrom(this.http.get<OrderDetail>(`/api/orders/${encodeURIComponent(id)}`)),
    );
  }

  pick(
    orderId: string,
    allocationId: string,
    version: number,
    body: PickRequest,
    key: string,
  ): Promise<ShipmentOrder> {
    return firstValueFrom(
      this.http.put<ShipmentOrder>(`/api/orders/${orderId}/allocations/${allocationId}`, body, {
        headers: { ...ifMatch(version), 'Idempotency-Key': key },
      }),
    );
  }

  /** 아직 집을 것이 남은 출고 지시의 동선을 미리 받아, 음영 지역에서 처음 여는 지시도 보이게 합니다. */
  private async prefetch(orders: OrderSummary[]): Promise<void> {
    for (const order of orders.filter((o) => o.status === 'reserved' || o.status === 'picking')) {
      await this.detail(order.id).catch(() => undefined);
    }
  }

  private async networkFirst<T>(key: string, fetcher: () => Promise<T>): Promise<PickCopy<T>> {
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
