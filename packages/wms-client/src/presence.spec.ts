import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
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
});
