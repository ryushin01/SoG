import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { OrderDetail, OrderSummary, PickRequest, ShipmentOrder } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch } from '@/shared/api';

/** 피킹은 재고 예약과 바로 맞물려 연결된 상태에서만 저장합니다. */
@Injectable({ providedIn: 'root' })
export class PickApi {
  private readonly http = inject(HttpClient);

  list(assigneeId: string): Promise<OrderSummary[]> {
    return firstValueFrom(
      this.http.get<{ items: OrderSummary[] }>('/api/orders', {
        params: { assigneeId, status: 'reserved,picking,picked' },
      }),
    ).then((page) => page.items);
  }

  detail(id: string): Promise<OrderDetail> {
    return firstValueFrom(this.http.get<OrderDetail>(`/api/orders/${encodeURIComponent(id)}`));
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
}
