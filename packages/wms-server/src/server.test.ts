import type {
  ChangeEvent,
  CountTaskDetail,
  LocationDetail,
  LocationOverview,
  Movement,
  Page,
  SkuDetail,
  SkuSummary,
} from '@sog/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createWmsServer, type WmsServer } from './server';

const opened: WmsServer[] = [];
let dbSeq = 0;

/** 같은 DB를 여는 서버 여러 개 = 같은 브라우저의 탭 여러 개 */
async function tabs(count: number) {
  const dbName = `test-${dbSeq++}`;
  const servers: WmsServer[] = [];
  for (let i = 0; i < count; i++) servers.push(await createWmsServer({ dbName }));
  opened.push(...servers);
  return servers;
}

function call(
  server: WmsServer,
  method: string,
  url: string,
  options: { body?: unknown; ifMatch?: number; user?: string; key?: string } = {},
) {
  return server.handle({
    method,
    url,
    body: options.body,
    headers: {
      'x-sog-user': options.user ?? 'u-kim',
      'If-Match': options.ifMatch === undefined ? undefined : `"${options.ifMatch}"`,
      'Idempotency-Key': options.key,
    },
  });
}

afterEach(() => {
  opened.splice(0).forEach((server) => server.close());
});

async function firstStock(server: WmsServer, minAvailable = 10) {
  const list = (await call(server, 'GET', '/api/skus?size=100')).body as Page<SkuSummary>;
  for (const sku of list.items) {
    const detail = (await call(server, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
    const stock = detail.stocks.find((s) => s.onHand - s.reserved >= minAvailable);
    if (stock) return { sku, stock };
  }
  throw new Error('재고가 있는 품목이 없습니다.');
}

describe('조회', () => {
  it('처음 열면 데모 데이터를 넣고 품목을 페이지로 돌려준다', async () => {
    const [server] = await tabs(1);
    const response = await call(server!, 'GET', '/api/skus?size=10&sort=onHand&dir=desc');
    const page = response.body as Page<SkuSummary>;
    expect(response.status).toBe(200);
    expect(page.total).toBe(48);
    expect(page.items).toHaveLength(10);
    expect(page.items[0]!.onHand).toBeGreaterThanOrEqual(page.items[9]!.onHand);
  });

  it('바코드로 품목을 찾는다', async () => {
    const [server] = await tabs(1);
    const all = (await call(server!, 'GET', '/api/skus?size=1')).body as Page<SkuSummary>;
    const barcode = all.items[0]!.barcode;
    const found = (await call(server!, 'GET', `/api/skus?q=${barcode}`)).body as Page<SkuSummary>;
    expect(found.items.map((sku) => sku.barcode)).toEqual([barcode]);
  });
});

describe('창고 도면', () => {
  it('로케이션마다 수량·상태·실사 중 여부를 돌려준다', async () => {
    const [server] = await tabs(1);
    const { items } = (await call(server!, 'GET', '/api/locations/overview')).body as {
      items: LocationOverview[];
    };
    expect(items).toHaveLength(42);
    expect(items.some((item) => item.status === 'empty')).toBe(true);
    // ct-003(A구역 2통로)이 진행 중
    expect(
      items.find((item) => item.location.code.startsWith('A-02-') && item.units > 0)!.countingTask,
    ).toMatch(/^CC-/);
    expect(
      items
        .filter((item) => item.location.zone === 'A' && item.location.aisle === 1)
        .every((i) => i.countingTask === null),
    ).toBe(true);
  });

  it('로케이션 상세는 수량이 많은 품목부터 보여 준다', async () => {
    const [server] = await tabs(1);
    const { items } = (await call(server!, 'GET', '/api/locations/overview')).body as {
      items: LocationOverview[];
    };
    const busy = items.find((item) => item.skuCount > 1)!;
    const detail = (await call(server!, 'GET', `/api/locations/${busy.location.id}`))
      .body as LocationDetail;
    expect(detail.items).toHaveLength(busy.skuCount);
    expect(detail.items[0]!.onHand).toBeGreaterThanOrEqual(detail.items.at(-1)!.onHand);
  });
});

describe('낙관적 잠금', () => {
  it('버전 없이 수정하면 428로 거절한다', async () => {
    const [server] = await tabs(1);
    const response = await call(server!, 'PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 5 },
    });
    expect(response.status).toBe(428);
  });

  it('두 사용자가 같은 버전으로 저장하면 뒤의 저장은 412와 최신 값을 받는다', async () => {
    const [a, b] = await tabs(2);
    const detail = (await call(a!, 'GET', '/api/skus/sku-10201')).body as SkuDetail;
    const version = detail.sku.version;

    const first = await call(a!, 'PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 11 },
      ifMatch: version,
    });
    const second = await call(b!, 'PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 99 },
      ifMatch: version,
      user: 'u-park',
    });

    expect(first.status).toBe(200);
    expect(first.headers['ETag']).toBe(`"${version + 1}"`);
    expect(second.status).toBe(412);
    const conflict = second.body as { code: string; current: SkuDetail };
    expect(conflict.code).toBe('VERSION_CONFLICT');
    expect(conflict.current.sku.safetyStock).toBe(11);
  });
});

describe('재고 이동의 동시성', () => {
  it('두 탭이 동시에 가용 재고를 넘게 출고하면 하나만 성공한다', async () => {
    const [a, b] = await tabs(2);
    const { sku, stock } = await firstStock(a!);
    const free = stock.onHand - stock.reserved;
    const qty = Math.floor(free / 2) + 1;
    const body = {
      type: 'shipment',
      skuId: sku.id,
      fromLocationId: stock.locationId,
      qty,
      reason: '동시 출고',
    };

    const results = await Promise.all([
      call(a!, 'POST', '/api/movements', { body }),
      call(b!, 'POST', '/api/movements', { body, user: 'u-park' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const after = (await call(a!, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
    expect(after.stocks.find((s) => s.id === stock.id)!.onHand).toBe(stock.onHand - qty);
  });

  it('같은 멱등 키로 다시 보내면 이동을 한 번만 반영한다', async () => {
    const [server] = await tabs(1);
    const { sku, stock } = await firstStock(server!);
    const body = {
      type: 'receipt',
      skuId: sku.id,
      toLocationId: stock.locationId,
      qty: 5,
      reason: '재전송 확인',
    };

    const first = await call(server!, 'POST', '/api/movements', { body, key: 'k-1' });
    const replay = await call(server!, 'POST', '/api/movements', { body, key: 'k-1' });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.headers['Idempotent-Replayed']).toBe('true');
    expect((replay.body as Movement).id).toBe((first.body as Movement).id);
    const after = (await call(server!, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
    expect(after.stocks.find((s) => s.id === stock.id)!.onHand).toBe(stock.onHand + 5);
  });

  it('이동은 출발지와 도착지 재고를 함께 바꾸고 총량은 그대로 둔다', async () => {
    const [server] = await tabs(1);
    const { sku, stock } = await firstStock(server!);
    const total = (detail: SkuDetail) => detail.stocks.reduce((sum, s) => sum + s.onHand, 0);
    const before = (await call(server!, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
    const destination = 'loc-D-01-04-1';
    const destBefore = before.stocks.find((s) => s.locationId === destination)?.onHand ?? 0;

    const response = await call(server!, 'POST', '/api/movements', {
      body: {
        type: 'transfer',
        skuId: sku.id,
        fromLocationId: stock.locationId,
        toLocationId: destination,
        qty: 3,
        reason: '출고 대기',
      },
    });

    expect(response.status).toBe(201);
    const after = (await call(server!, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
    expect(after.stocks.find((s) => s.id === stock.id)!.onHand).toBe(stock.onHand - 3);
    expect(after.stocks.find((s) => s.locationId === destination)!.onHand).toBe(destBefore + 3);
    expect(total(after)).toBe(total(before));
  });
});

describe('실사 흐름', () => {
  it('재실사 요청 뒤 옛 버전으로 저장하면 충돌, 최신 버전으로 저장하면 성공한다', async () => {
    const [backoffice, field] = await tabs(2);
    const detail = (await call(field!, 'GET', '/api/counts/ct-003')).body as CountTaskDetail;
    const line = detail.lines.find((l) => l.status === 'counted')!;

    const recount = await call(backoffice!, 'POST', `/api/counts/ct-003/lines/${line.id}/recount`, {
      ifMatch: line.version,
    });
    expect(recount.status).toBe(200);

    const stale = await call(field!, 'PUT', `/api/counts/ct-003/lines/${line.id}`, {
      body: { countedQty: 1 },
      ifMatch: line.version,
      user: 'u-lee',
    });
    expect(stale.status).toBe(412);
    const latest = (stale.body as { current: { version: number; status: string } }).current;
    expect(latest.status).toBe('recount');

    const retry = await call(field!, 'PUT', `/api/counts/ct-003/lines/${line.id}`, {
      body: { countedQty: 1 },
      ifMatch: latest.version,
      user: 'u-lee',
    });
    expect(retry.status).toBe(200);
  });

  it('승인하면 센 뒤에 일어난 입출고까지 더해 재고를 맞춘다', async () => {
    const [server] = await tabs(1);
    const detail = (await call(server!, 'GET', '/api/counts/ct-004')).body as CountTaskDetail;
    const target = detail.lines[0]!;

    // 모든 줄을 장부대로 세고, 첫 줄만 2개 적게 셉니다.
    for (const line of detail.lines) {
      const counted = line.id === target.id ? Math.max(0, line.expectedQty - 2) : line.expectedQty;
      const response = await call(server!, 'PUT', `/api/counts/ct-004/lines/${line.id}`, {
        body: { countedQty: counted },
        ifMatch: line.version,
        user: 'u-lee',
      });
      expect(response.status).toBe(200);
    }
    // 센 뒤에 같은 로케이션에 4개 입고
    await call(server!, 'POST', '/api/movements', {
      body: {
        type: 'receipt',
        skuId: target.skuId,
        toLocationId: target.locationId,
        qty: 4,
        reason: '실사 중 입고',
      },
    });

    const task = ((await call(server!, 'GET', '/api/counts/ct-004')).body as CountTaskDetail).task;
    const submit = await call(server!, 'POST', '/api/counts/ct-004/submit', {
      ifMatch: task.version,
      user: 'u-lee',
    });
    expect(submit.status).toBe(200);

    const review = (await call(server!, 'GET', '/api/counts/ct-004')).body as CountTaskDetail;
    expect(review.lines.find((l) => l.id === target.id)!.movedSinceCount).toBe(4);

    const approve = await call(server!, 'POST', '/api/counts/ct-004/approve', {
      ifMatch: review.task.version,
    });
    expect(approve.status).toBe(200);

    const sku = (await call(server!, 'GET', `/api/skus/${target.skuId}`)).body as SkuDetail;
    const counted = Math.max(0, target.expectedQty - 2);
    expect(sku.stocks.find((s) => s.id === target.stockId)!.onHand).toBe(counted + 4);
  });

  it('아직 세지 않은 줄이 있으면 제출할 수 없다', async () => {
    const [server] = await tabs(1);
    const detail = (await call(server!, 'GET', '/api/counts/ct-003')).body as CountTaskDetail;
    const response = await call(server!, 'POST', '/api/counts/ct-003/submit', {
      ifMatch: detail.task.version,
    });
    expect(response.status).toBe(409);
  });

  it('다른 실사에 들어 있는 재고는 새 작업에서 뺀다', async () => {
    const [server] = await tabs(1);
    const response = await call(server!, 'POST', '/api/counts', {
      body: {
        title: '중복 확인',
        zone: 'B',
        assigneeId: 'u-jung',
        blind: false,
        dueAt: new Date().toISOString(),
      },
    });
    expect(response.status).toBe(409);
  });
});

describe('변경 알림', () => {
  it('한 탭의 변경을 다른 탭이 받는다', async () => {
    const [a, b] = await tabs(2);
    const received = new Promise<ChangeEvent>((resolve) => b!.subscribe(resolve));
    const detail = (await call(a!, 'GET', '/api/skus/sku-10201')).body as SkuDetail;
    await call(a!, 'PATCH', '/api/skus/sku-10201', {
      body: { safetyStock: 7 },
      ifMatch: detail.sku.version,
    });
    const event = await received;
    expect(event.topics).toContain('skus/sku-10201');
    expect(event.origin).toBe(a!.origin);
  });
});
