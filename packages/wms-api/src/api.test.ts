import { PGlite } from '@electric-sql/pglite';
import type { Movement, Page, SkuDetail, SkuSummary } from '@sog/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueToken } from '@sog/wms-server';
import { type ApiHandler, createApiHandler } from './api';

const SECRET = 'test-secret-test-secret-test-secret';
import { fromPglite } from './sql';

let api: ApiHandler;

beforeEach(async () => {
  api = await createApiHandler(fromPglite(await PGlite.create()), {
    authSecret: SECRET,
    cronSecret: 'cron-test',
  });
});

afterEach(async () => {
  await api.close();
});

async function call<T = unknown>(
  method: string,
  path: string,
  options: {
    body?: unknown;
    ifMatch?: number;
    user?: string | null;
    key?: string;
    origin?: string;
  } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const user = options.user === undefined ? 'u-kim' : options.user;
  const headers = new Headers();
  if (user) {
    const { token } = await issueToken(SECRET, user, Math.floor(Date.now() / 1000));
    headers.set('authorization', `Bearer ${token}`);
  }
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

  it('시드 버전이 바뀌어도 실제 서버의 데이터는 지우지 않는다', async () => {
    // 배포 중에는 옛 함수와 새 함수가 함께 돌 수 있어, 버전 차이로 다시 채우면 운영 데이터를 거듭 지웁니다.
    await api.close();
    const pglite = await PGlite.create();
    api = await createApiHandler(fromPglite(pglite), { authSecret: SECRET });
    await call('GET', '/api/reference', { user: null });
    await pglite.query(`insert into docs values ('skus', 'sku-marker', '{"id":"sku-marker"}')`);
    await pglite.query(
      `update docs set data = jsonb_set(data, '{version}', '1') where store = 'meta' and id = 'seed'`,
    );

    // 새 인스턴스(새 배포)가 같은 DB로 첫 요청을 받습니다.
    api = await createApiHandler(fromPglite(pglite), { authSecret: SECRET });
    await call('GET', '/api/reference', { user: null });
    const marker = await pglite.query(
      `select 1 from docs where store = 'skus' and id = 'sku-marker'`,
    );
    expect(marker.rows).toHaveLength(1);
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

  it('변경 피드는 순번의 자릿수가 바뀌어도 숫자 순서로 주고, 커서는 받은 마지막 순번이다', async () => {
    const start = Number((await call<{ cursor: string }>('GET', '/api/changes')).body.cursor);
    // 순번이 다음 10의 거듭제곱(예: 9 → 10)을 넘도록 변경을 쌓습니다.
    const next = 10 ** String(start + 1).length;
    const count = next - start + 1;
    for (let i = 0; i < count; i++) {
      const detail = (await call<SkuDetail>('GET', '/api/skus/sku-10201')).body;
      const response = await call('PATCH', '/api/skus/sku-10201', {
        body: { safetyStock: 20 + i },
        ifMatch: detail.sku.version,
      });
      expect(response.status).toBe(200);
    }
    const feed = (
      await call<{ cursor: string; items: { seq: string }[] }>('GET', `/api/changes?after=${start}`)
    ).body;
    const seqs = feed.items.map((item) => Number(item.seq));
    expect(seqs).toHaveLength(count);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(Number(feed.cursor)).toBe(Math.max(...seqs));
    const after = (await call<{ items: unknown[] }>('GET', `/api/changes?after=${feed.cursor}`))
      .body;
    expect(after.items).toHaveLength(0);
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
    // 본문에 다른 사용자를 적어도 토큰의 사용자(이서준)로 남습니다.
    expect(
      (await call('POST', '/api/presence', { body: { ...peer, userId: 'u-kim' }, user: 'u-lee' }))
        .status,
    ).toBe(204);
    expect((await call<{ items: unknown[] }>('GET', '/api/presence')).body.items).toEqual([peer]);
    expect((await call('POST', '/api/presence', { body: { tabId: 't2' } })).status).toBe(400);
    await call('DELETE', '/api/presence/t1');
    expect((await call<{ items: unknown[] }>('GET', '/api/presence')).body.items).toEqual([]);
  });

  it('변경 피드·접속 표시는 로그인이 필요하고, 초기화 예약 작업은 CRON_SECRET이 필요하다', async () => {
    expect((await call('GET', '/api/changes', { user: null })).status).toBe(401);
    expect((await call('GET', '/api/presence', { user: null })).status).toBe(401);
    expect((await call('GET', '/api/skus', { user: null })).status).toBe(401);
    const denied = await api.handle(new Request('https://sog.test/api/cron/reset'));
    expect(denied.status).toBe(401);
    const allowed = await api.handle(
      new Request('https://sog.test/api/cron/reset', {
        headers: { authorization: 'Bearer cron-test' },
      }),
    );
    expect(allowed.status).toBe(200);
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
