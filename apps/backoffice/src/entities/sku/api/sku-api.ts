import { HttpClient, type HttpResourceRequest } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  type AdjustRequest,
  type Sku,
  type SkuPatch,
  SKU_PAGE_MAX,
  type StockLevel,
} from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch } from '@/shared/api';

/**
 * 품목을 고르는 목록(출고 지시·입출고·도면 품목 찾기)의 요청. 이름순으로 서버의 쪽 크기 상한까지 한 번에 받아
 * 모든 품목을 보여 줍니다(한 쪽 100개로 받으면 품목이 늘었을 때 뒤쪽 품목을 고를 수 없음).
 */
export function skuOptionsRequest(): HttpResourceRequest {
  return { url: '/api/skus', params: { size: SKU_PAGE_MAX, sort: 'name' } };
}

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
