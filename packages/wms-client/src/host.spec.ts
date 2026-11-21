import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WmsHost } from './host';

function hostWith(response: Response | Error): WmsHost {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );
  TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  return TestBed.inject(WmsHost);
}

describe('WmsHost.ready', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('실제 서버가 응답하면 remote로 정하고 기억한다', async () => {
    const host = hostWith(Response.json({ mode: 'remote' }));
    expect(await host.ready()).toBe('remote');
    expect(localStorage.getItem('sog:mode')).toBe('remote');
  });

  it('처음 열 때 API가 없거나(404) DB가 없으면(503) 데모 모드로 정한다', async () => {
    const host = hostWith(new Response(null, { status: 503 }));
    expect(await host.ready()).toBe('local');
    expect(localStorage.getItem('sog:mode')).toBe('local');
  });

  it('공개 데모에서 DB가 끊겼다고(503, DB_UNAVAILABLE) 알리면 데모 모드로 대신 보여 주며 표시한다', async () => {
    const host = hostWith(
      Response.json({ mode: 'local', code: 'DB_UNAVAILABLE' }, { status: 503 }),
    );
    expect(await host.ready()).toBe('local');
    expect(host.fallback()).toBe(true);
  });

  it('DB를 붙이지 않은 배포(503, 본문 없음)는 대신 보여 주는 중으로 표시하지 않는다', async () => {
    const host = hostWith(new Response(null, { status: 503 }));
    expect(await host.ready()).toBe('local');
    expect(host.fallback()).toBe(false);
  });

  it('기억한 모드가 있으면 상태 확인을 기다리지 않고 바로 시작한다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const host = TestBed.inject(WmsHost);
    expect(await host.ready()).toBe('remote');
    expect(host.mode()).toBe('remote');
  });

  it('뒤에서 확인한 모드가 기억한 모드와 다르면 기억하고 다시 연다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new Response(null, { status: 503 }));
    const reload = vi
      .spyOn(host as unknown as { reload(): void }, 'reload')
      .mockImplementation(() => undefined);
    expect(await host.ready()).toBe('remote');
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(localStorage.getItem('sog:mode')).toBe('local');
  });

  it('새 모드를 기기에 저장하지 못하면 다시 열지 않는다(새로 고침 반복 방지)', async () => {
    localStorage.setItem('sog:mode', 'local');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('가득 참', 'QuotaExceededError');
    });
    const host = hostWith(Response.json({ mode: 'remote' }));
    const reload = vi
      .spyOn(host as unknown as { reload(): void }, 'reload')
      .mockImplementation(() => undefined);
    expect(await host.ready()).toBe('local');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reload).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('서버 일시 오류(500)면 마지막 모드를 쓰고 덮어쓰지 않는다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new Response(null, { status: 500 }));
    const reload = vi
      .spyOn(host as unknown as { reload(): void }, 'reload')
      .mockImplementation(() => undefined);
    expect(await host.ready()).toBe('remote');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(localStorage.getItem('sog:mode')).toBe('remote');
    expect(reload).not.toHaveBeenCalled();
  });

  it('연결이 안 되면(오프라인) 마지막 모드를 쓰고, 처음이면 데모 모드다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new TypeError('Failed to fetch'));
    expect(await host.ready()).toBe('remote');
    TestBed.resetTestingModule();
    localStorage.clear();
    const fresh = hostWith(new TypeError('Failed to fetch'));
    expect(await fresh.ready()).toBe('local');
  });
});
