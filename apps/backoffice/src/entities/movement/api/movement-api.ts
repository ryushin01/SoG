import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Movement, MovementRequest } from '@sog/domain';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MovementApi {
  private readonly http = inject(HttpClient);

  /** 같은 키로 다시 보내면 서버는 처음 결과를 돌려주고 재고는 한 번만 바뀝니다. */
  create(request: MovementRequest, key: string): Promise<Movement> {
    return firstValueFrom(
      this.http.post<Movement>('/api/movements', request, { headers: { 'Idempotency-Key': key } }),
    );
  }
}
