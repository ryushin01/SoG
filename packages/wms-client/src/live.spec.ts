import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ChangeEvent } from '@sog/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedTestSession } from './auth';
import {
  IDLE_AFTER_MS,
  LIVE_ACTIVE_MS,
  LIVE_HIDDEN_MS,
  LIVE_IDLE_MS,
  liveDelay,
  LiveSync,
  STOP_HIDDEN_AFTER_MS,
} from './live';

describe('liveDelay', () => {
  const now = 1_000_000;

  it('조작 중이면 2.5초, 1분 넘게 조작이 없으면 10초', () => {
    expect(liveDelay({ now, hidden: false, hiddenSince: null, lastInput: now - 1000 })).toBe(
      LIVE_ACTIVE_MS,
    );
    expect(
      liveDelay({ now, hidden: false, hiddenSince: null, lastInput: now - IDLE_AFTER_MS }),
    ).toBe(LIVE_IDLE_MS);
  });

  it('가려지면 15초, 2분 넘게 가려져 있으면 다시 보일 때까지 멈춘다', () => {
    expect(liveDelay({ now, hidden: true, hiddenSince: now - 5000, lastInput: now })).toBe(
      LIVE_HIDDEN_MS,
    );
    expect(
      liveDelay({ now, hidden: true, hiddenSince: now - STOP_HIDDEN_AFTER_MS, lastInput: now }),
    ).toBeNull();
  });

  it('띄워 둔 탭 하나의 하루 요청 수가 무료 한도(10만)보다 한참 적다', () => {
    const perDay = (ms: number) => Math.round(86_400_000 / ms);
    // 따로 부르던 때: 변경 피드 2.5초 + 접속 표시 받기 3초 + 보내기 5초 = 약 8만 건
    expect(perDay(2_500) + perDay(3_000) + perDay(5_000)).toBe(80_640);
    expect(perDay(LIVE_ACTIVE_MS)).toBe(34_560);
    expect(perDay(LIVE_IDLE_MS)).toBe(8_640);
  });
});

describe('LiveSync', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function respond(bodies: object[]) {
    const fetchSpy = vi.fn(async () =>
      Response.json(bodies.length > 1 ? bodies.shift() : bodies[0]),
    );
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  async function signedIn(): Promise<LiveSync> {
    await seedTestSession({ id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' });
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    return TestBed.inject(LiveSync);
  }

  it('한 요청으로 내 위치를 보내고, 순번을 이어 가며 변경과 접속자를 받는다', async () => {
    const event: ChangeEvent = {
      topics: ['skus', 'skus/sku-1'],
      by: 'u-park',
      at: '2026-11-16T00:00:00.000Z',
      origin: 'other',
      message: '박도윤님이 수정했습니다.',
    };
    const fetchSpy = respond([
      { cursor: '41', items: [], peers: [] },
      { cursor: '42', items: [event], peers: [{ tabId: 'p1' }] },
    ]);
    const live = await signedIn();
    const events: ChangeEvent[] = [];
    const peers: unknown[][] = [];
    live.onEvent((e) => events.push(e));
    live.onPeers((p) => peers.push(p));
    live.setHere(() => ({
      tabId: 't1',
      app: '백오피스',
      resource: 'skus/sku-1',
      editing: true,
      detail: '',
    }));
    live.start();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    live.poke();
    await vi.waitFor(() => expect(events).toEqual([event]));

    const bodies = fetchSpy.mock.calls.map(
      (call) =>
        JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as {
          after: string | null;
          here: { resource: string } | null;
        },
    );
    expect(bodies.map((body) => body.after)).toEqual([null, '41']);
    expect(bodies[0]!.here?.resource).toBe('skus/sku-1');
    expect(peers.at(-1)).toEqual([{ tabId: 'p1' }]);
  });

  it('로그인하기 전에는 부르지 않고, 정리되면 멈춘다', async () => {
    const fetchSpy = respond([{ cursor: '1', items: [], peers: [] }]);
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const live = TestBed.inject(LiveSync);
    live.start();
    live.poke();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    live.poke();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
