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

  it('API가 없거나(404) DB가 없으면(503) 데모 모드로 정한다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new Response(null, { status: 503 }));
    expect(await host.ready()).toBe('local');
    expect(localStorage.getItem('sog:mode')).toBe('local');
  });

  it('서버 일시 오류(500)면 마지막 모드를 쓰고 덮어쓰지 않는다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new Response(null, { status: 500 }));
    expect(await host.ready()).toBe('remote');
    expect(localStorage.getItem('sog:mode')).toBe('remote');
  });

  it('연결이 안 되면(오프라인) 마지막 모드를 쓴다', async () => {
    localStorage.setItem('sog:mode', 'remote');
    const host = hostWith(new TypeError('Failed to fetch'));
    expect(await host.ready()).toBe('remote');
  });
});
