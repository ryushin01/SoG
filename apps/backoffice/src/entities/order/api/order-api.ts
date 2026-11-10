import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CreateOrderRequest, ShipmentOrder } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch } from '@/shared/api';

@Injectable({ providedIn: 'root' })
export class OrderApi {
  private readonly http = inject(HttpClient);

  create(request: CreateOrderRequest, key: string): Promise<ShipmentOrder> {
    return firstValueFrom(
      this.http.post<ShipmentOrder>('/api/orders', request, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  ship(id: string, version: number): Promise<ShipmentOrder> {
    return firstValueFrom(
      this.http.post<ShipmentOrder>(`/api/orders/${id}/ship`, null, { headers: ifMatch(version) }),
    );
  }

  cancel(id: string, version: number): Promise<ShipmentOrder> {
    return firstValueFrom(
      this.http.post<ShipmentOrder>(`/api/orders/${id}/cancel`, null, {
        headers: ifMatch(version),
      }),
    );
  }
}
