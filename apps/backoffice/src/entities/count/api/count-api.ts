import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { CountLineView, CountTask, CreateCountRequest } from '@sog/domain';
import { firstValueFrom } from 'rxjs';
import { ifMatch } from '@/shared/api';

@Injectable({ providedIn: 'root' })
export class CountApi {
  private readonly http = inject(HttpClient);

  create(request: CreateCountRequest, key: string): Promise<CountTask & { skipped: number }> {
    return firstValueFrom(
      this.http.post<CountTask & { skipped: number }>('/api/counts', request, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  approve(id: string, version: number): Promise<CountTask & { adjusted: number }> {
    return firstValueFrom(
      this.http.post<CountTask & { adjusted: number }>(`/api/counts/${id}/approve`, null, {
        headers: ifMatch(version),
      }),
    );
  }

  cancel(id: string, version: number): Promise<CountTask> {
    return firstValueFrom(
      this.http.post<CountTask>(`/api/counts/${id}/cancel`, null, { headers: ifMatch(version) }),
    );
  }

  recount(taskId: string, lineId: string, version: number): Promise<CountLineView> {
    return firstValueFrom(
      this.http.post<CountLineView>(`/api/counts/${taskId}/lines/${lineId}/recount`, null, {
        headers: ifMatch(version),
      }),
    );
  }
}
