import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { ApiError } from '@sog/domain';

/** If-Match 헤더. 마지막으로 받은 버전을 보내 낙관적 잠금에 씁니다. */
export function ifMatch(version: number): Record<string, string> {
  return { 'If-Match': `"${version}"` };
}

/** 같은 작업을 다시 보내도 한 번만 반영되도록 붙이는 키 */
export function idempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ApiError> | null;
    if (body && typeof body === 'object' && typeof body.code === 'string') return body as ApiError;
    if (error.status === 0)
      return { code: 'NETWORK', message: '네트워크에 연결되어 있지 않습니다.' };
    return { code: 'VALIDATION', message: error.message };
  }
  return {
    code: 'VALIDATION',
    message: error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.',
  };
}

export function isVersionConflict(
  error: ApiError,
): error is ApiError & { code: 'VERSION_CONFLICT' } {
  return error.code === 'VERSION_CONFLICT';
}

/**
 * 중복 제출 잠금.
 * 신호(isPending)는 다음 렌더에야 바뀌어 빠른 연속 클릭을 못 막으므로, 동기 플래그로 먼저 막습니다.
 * 성공 후 화면을 떠나는 폼은 keepLockedOnSuccess로 실패했을 때만 잠금을 풉니다.
 */
export class SubmitLock {
  private locked = false;
  readonly pending = signal(false);

  constructor(private readonly options: { keepLockedOnSuccess?: boolean } = {}) {}

  async run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (this.locked) return undefined;
    this.locked = true;
    this.pending.set(true);
    let succeeded = false;
    try {
      const result = await work();
      succeeded = true;
      return result;
    } finally {
      if (!(succeeded && this.options.keepLockedOnSuccess)) {
        this.locked = false;
        this.pending.set(false);
      }
    }
  }

  release(): void {
    this.locked = false;
    this.pending.set(false);
  }
}
