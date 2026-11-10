import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AdjustRequest, Sku, SkuPatch, StockLevel } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch } from '@/shared/api';

@Injectable({ providedIn: 'root' })
export class SkuApi {
  private readonly http = inject(HttpClient);

  update(id: string, version: number, patch: SkuPatch): Promise<Sku> {
    return firstValueFrom(
      this.http.patch<Sku>(`/api/skus/${id}`, patch, { headers: ifMatch(version) }),
    );
  }

  adjust(stockId: string, version: number, body: AdjustRequest): Promise<StockLevel> {
    return firstValueFrom(
      this.http.post<StockLevel>(`/api/stocks/${stockId}/adjust`, body, {
        headers: ifMatch(version),
      }),
    );
  }
}
