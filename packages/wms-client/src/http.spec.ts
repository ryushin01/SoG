import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { ifMatch, SubmitLock, toApiError } from './http';

describe('SubmitLock', () => {
  it('진행 중에 다시 부르면 무시한다(신호가 바뀌기 전의 빠른 연속 클릭)', async () => {
    const lock = new SubmitLock();
    let calls = 0;
    let finish!: () => void;
    const work = () =>
      new Promise<void>((resolve) => {
        calls++;
        finish = resolve;
      });

    const first = lock.run(work);
    const second = lock.run(work);
    expect(lock.pending()).toBe(true);
    finish();
    await first;
    expect(await second).toBeUndefined();
    expect(calls).toBe(1);
    expect(lock.pending()).toBe(false);
  });

  it('화면을 떠나는 폼은 성공 뒤에도 잠그고, 실패하면 푼다', async () => {
    const lock = new SubmitLock({ keepLockedOnSuccess: true });
    await lock.run(async () => 'ok');
    expect(lock.pending()).toBe(true);

    const failing = new SubmitLock({ keepLockedOnSuccess: true });
    await expect(failing.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(failing.pending()).toBe(false);
  });
});

describe('HTTP 도우미', () => {
  it('If-Match는 따옴표로 감싼 버전', () => {
    expect(ifMatch(4)).toEqual({ 'If-Match': '"4"' });
  });

  it('서버 오류 본문과 네트워크 오류를 ApiError로 바꾼다', () => {
    const conflict = new HttpErrorResponse({
      status: 412,
      error: { code: 'VERSION_CONFLICT', message: '충돌' },
    });
    expect(toApiError(conflict).code).toBe('VERSION_CONFLICT');
    expect(toApiError(new HttpErrorResponse({ status: 0, error: null })).code).toBe('NETWORK');
  });
});
