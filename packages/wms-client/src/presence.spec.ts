import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WmsHost } from './host';
import { ApiIdentity } from './interceptor';
import { Presence } from './presence';

@Component({ selector: 'test-viewer', template: '' })
class Viewer {
  readonly resource = signal<string | null>('skus/sku-1');
  readonly editing = signal(false);
  constructor() {
    inject(Presence).track(
      () => this.resource(),
      () => ({ editing: this.editing() }),
    );
  }
}

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Presence', () => {
  const channels: BroadcastChannel[] = [];
  afterEach(() => {
    channels.splice(0).forEach((c) => c.close());
    TestBed.resetTestingModule();
  });

  /** 다른 탭을 흉내 내는 채널 */
  function otherTab() {
    const channel = new BroadcastChannel('sog-presence');
    const received: unknown[] = [];
    channel.onmessage = (event) => received.push(event.data);
    channels.push(channel);
    return { channel, received };
  }

  it('보는 자원과 수정 중 여부를 다른 탭에 알린다', async () => {
    const other = otherTab();
    TestBed.inject(ApiIdentity).userId.set('u-park');
    const fixture = TestBed.createComponent(Viewer);
    TestBed.tick();
    await wait();
    expect(other.received).toContainEqual(
      expect.objectContaining({
        type: 'here',
        peer: expect.objectContaining({ resource: 'skus/sku-1', userId: 'u-park', editing: false }),
      }),
    );

    fixture.componentInstance.editing.set(true);
    TestBed.tick();
    await wait();
    expect(other.received.at(-1)).toEqual(
      expect.objectContaining({ peer: expect.objectContaining({ editing: true }) }),
    );

    fixture.destroy();
    await wait();
    expect(other.received.at(-1)).toEqual(expect.objectContaining({ type: 'leave' }));
  });

  it('다른 탭이 같은 자원을 보면 목록에 나타나고, 떠나면 사라진다', async () => {
    const presence = TestBed.inject(Presence);
    const peers = TestBed.runInInjectionContext(() => presence.peers(() => 'counts/ct-3'));
    const other = otherTab();
    other.channel.postMessage({
      type: 'here',
      peer: {
        tabId: 't2',
        userId: 'u-lee',
        app: 'count',
        resource: 'counts/ct-3/lines/l1',
        editing: false,
        detail: '주방세제',
        at: 0,
      },
    });
    await wait();
    expect(peers().map((p) => p.userId)).toEqual(['u-lee']);
    expect(peers()[0]!.detail).toBe('주방세제');

    other.channel.postMessage({ type: 'leave', tabId: 't2' });
    await wait();
    expect(peers()).toEqual([]);
  });

  it('모양이 잘못된 메시지는 무시한다', async () => {
    const presence = TestBed.inject(Presence);
    const peers = TestBed.runInInjectionContext(() => presence.peers(() => 'skus/sku-1'));
    const other = otherTab();
    other.channel.postMessage({ type: 'here' });
    other.channel.postMessage({ type: 'here', peer: { tabId: 1, resource: null } });
    other.channel.postMessage('hello');
    other.channel.postMessage({
      type: 'here',
      peer: {
        tabId: 't3',
        userId: 'u-kim',
        app: '백오피스',
        resource: 'skus/sku-1',
        editing: 'yes',
      },
    });
    await wait();
    expect(peers().map((p) => [p.tabId, p.editing])).toEqual([['t3', false]]);
  });
  /** 서버 모드인지 늦게 알려 주는 호스트 */
  function slowHost() {
    let resolve!: (mode: 'remote' | 'local') => void;
    const ready = new Promise<'remote' | 'local'>((r) => (resolve = r));
    TestBed.configureTestingModule({
      providers: [{ provide: WmsHost, useValue: { ready: () => ready, mode: signal(null) } }],
    });
    return (mode: 'remote' | 'local') => resolve(mode);
  }

  it('서버 모드면 다른 기기의 접속 정보를 받아 온다', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetchSpy);
    const answer = slowHost();
    TestBed.inject(Presence);
    answer('remote');
    await wait();
    expect(fetchSpy).toHaveBeenCalledWith('/api/presence', { cache: 'no-store' });
    vi.unstubAllGlobals();
  });

  it('서버 모드인지 알기 전에 정리되면 폴링을 시작하지 않는다', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal('fetch', fetchSpy);
    const answer = slowHost();
    TestBed.inject(Presence);
    // 루트 주입기를 정리하면 Presence의 정리 함수가 불린다.
    TestBed.resetTestingModule();
    answer('remote');
    await wait();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
