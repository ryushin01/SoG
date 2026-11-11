import { PGlite } from '@electric-sql/pglite';
import type { Movement, Page, SkuDetail, SkuSummary } from '@sog/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ApiHandler, createApiHandler } from './api';
import { fromPglite } from './sql';

let api: ApiHandler;

beforeEach(async () => {
  api = await createApiHandler(fromPglite(await PGlite.create()));
});

afterEach(async () => {
  await api.close();
});

async function call<T = unknown>(
  method: string,
  path: string,
  options: { body?: unknown; ifMatch?: number; user?: string; key?: string; origin?: string } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const headers = new Headers({ 'x-sog-user': options.user ?? 'u-kim' });
  if (options.body !== undefined) headers.set('content-type', 'application/json');
  if (options.ifMatch !== undefined) headers.set('if-match', `"${options.ifMatch}"`);
  if (options.key) headers.set('idempotency-key', options.key);
  if (options.origin) headers.set('x-sog-origin', options.origin);
  const response = await api.handle(
    new Request(`https://sog.test${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    headers: response.headers,
  };
}

async function stockWithFree(min: number) {
  const list = (await call<Page<SkuSummary>>('GET', '/api/skus?size=100')).body;
  for (const sku of list.items) {
    const detail = (await call<SkuDetail>('GET', `/api/skus/${sku.id}`)).body;
    const stock = detail.stocks.find((s) => s.onHand - s.reserved >= min);
    if (stock) return { sku, stock };
  }
  throw new Error('재고가 있는 품목이 없습니다.');
}

describe('실제 서버(Postgres)', () => {
  it('상태 확인은 remote를 알리고, 처음 요청에 스키마와 시드를 만든다', async () => {
    expect((await call<{ mode: string }>('GET', '/api/health')).body.mode).toBe('remote');
    const page = (await call<Page<SkuSummary>>('GET', '/api/skus?size=5')).body;
    expect(page.total).toBe(48);
  });

  it('동시에 가용 재고를 넘게 출고하면 트랜잭션 잠금으로 하나만 성공한다', async () => {
    const { sku, stock } = await stockWithFree(10);
    const qty = Math.floor((stock.onHand - stock.reserved) / 2) + 1;
    const body = {
      type: 'shipment',
      skuId: sku.id,
      fromLocationId: stock.locationId,
      qty,
      reason: '동시 출고',
    };
    const results = await Promise.all([
      call('POST', '/api/movements', { body }),
      call('POST', '/api/movements', { body, user: 'u-park' }),
      call('POST', '/api/movements', { body, user: 'u-park' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const after = (await call<SkuDetail>('GET', `/api/skus/${sku.id}`)).body;
    expect(after.stocks.find((s) => s.id === stock.id)!.onHand).toBe(stock.onHand - qty);
  });

  it('같은 멱등 키로 다시 보내면 한 번만 반영한다', async () => {
    const { sku, stock } = await stockWithFree(1);
    const body = {
      type: 'receipt',
      skuId: sku.id,
      toLocationId: stock.locationId,
      qty: 7,
      reason: '재전송',
    };
    const first = await call<Movement>('POST', '/api/movements', { body, key: 'k-1' });
    const again = await call<Movement>('POST', '/api/movements', { body, key: 'k-1' });
    expect(again.body.id).toBe(first.body.id);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
    const after = (await call<SkuDetail>('GET', `/api/skus/${sku.id}`)).body;
    expect(after.stocks.find((s) => s.id === stock.id)!.onHand).toBe(stock.onHand + 7);
  });

  it('412 충돌에는 최신 값을 담아 돌려준다', async () => {
    const detail = (await call<SkuDetail>('GET', '/api/skus/sku-10201')).body;
    await call('PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 11 },
      ifMatch: detail.sku.version,
    });
    const stale = await call<{ code: string; current: SkuDetail }>('PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 99 },
      ifMatch: detail.sku.version,
      user: 'u-park',
    });
    expect(stale.status).toBe(412);
    expect(stale.body.current.sku.safetyStock).toBe(11);
  });

  it('변경 피드는 순번으로 놓친 변경을 이어 주고, 보낸 탭을 알려 준다', async () => {
    const start = (await call<{ cursor: string }>('GET', '/api/changes')).body.cursor;
    const detail = (await call<SkuDetail>('GET', '/api/skus/sku-10201')).body;
    await call('PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 12 },
      ifMatch: detail.sku.version,
      origin: 'tab-a',
    });
    const feed = (
      await call<{ cursor: string; items: { origin: string; topics: string[] }[] }>(
        'GET',
        `/api/changes?after=${start}`,
      )
    ).body;
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.origin).toBe('tab-a');
    expect(feed.items[0]!.topics).toContain('skus/sku-10201');
    const next = (await call<{ items: unknown[] }>('GET', `/api/changes?after=${feed.cursor}`))
      .body;
    expect(next.items).toHaveLength(0);
  });

  it('접속 표시를 저장하고 떠나면 지운다', async () => {
    const peer = {
      tabId: 't1',
      userId: 'u-lee',
      app: '현장 앱',
      resource: 'counts/ct-003',
      editing: false,
      detail: 'A-02-01-1',
    };
    expect((await call('POST', '/api/presence', { body: peer })).status).toBe(204);
    expect((await call<{ items: unknown[] }>('GET', '/api/presence')).body.items).toEqual([peer]);
    expect((await call('POST', '/api/presence', { body: { tabId: 't2' } })).status).toBe(400);
    await call('DELETE', '/api/presence/t1');
    expect((await call<{ items: unknown[] }>('GET', '/api/presence')).body.items).toEqual([]);
  });

  it('JSON이 아닌 본문은 400', async () => {
    const response = await api.handle(
      new Request('https://sog.test/api/movements', {
        method: 'POST',
        body: '{nope',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
  });
});
