import type {
  ChangeEvent,
  CountTaskDetail,
  LocationDetail,
  LocationOverview,
  Movement,
  OrderDetail,
  OrderSummary,
  ShipmentOrder,
  StockLevel,
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

  it('마지막 수량까지 출고해 0이 된 로케이션은 비어 있음이 아니라 품절로 표시한다', async () => {
    const [server] = await tabs(1);
    const list = (await call(server!, 'GET', '/api/skus?size=100')).body as Page<SkuSummary>;
    // 로케이션 한 곳에만 있는 품목을 골라 그 재고를 모두 출고합니다.
    for (const sku of list.items) {
      const detail = (await call(server!, 'GET', `/api/skus/${sku.id}`)).body as SkuDetail;
      if (
        detail.stocks.length !== 1 ||
        detail.stocks[0]!.reserved > 0 ||
        detail.stocks[0]!.onHand < 1
      )
        continue;
      const stock = detail.stocks[0]!;
      const others = (
        (await call(server!, 'GET', `/api/locations/${stock.locationId}`)).body as LocationDetail
      ).items;
      if (others.length !== 1) continue;
      const shipped = await call(server!, 'POST', '/api/movements', {
        body: {
          type: 'shipment',
          skuId: sku.id,
          fromLocationId: stock.locationId,
          qty: stock.onHand,
          reason: '전량 출고',
        },
      });
      expect(shipped.body).toEqual(expect.objectContaining({ type: 'shipment' }));
      const { items } = (await call(server!, 'GET', '/api/locations/overview')).body as {
        items: LocationOverview[];
      };
      const cell = items.find((item) => item.location.id === stock.locationId)!;
      expect(cell.units).toBe(0);
      expect(cell.skuCount).toBe(0);
      expect(cell.status).toBe('out');
      return;
    }
    throw new Error('조건에 맞는 품목이 없습니다.');
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

describe('출고 지시', () => {
  async function stocksOf(server: WmsServer, skuId: string): Promise<StockLevel[]> {
    return ((await call(server, 'GET', `/api/skus/${skuId}`)).body as SkuDetail).stocks;
  }

  it('시드의 출고 지시 수량은 열린 출고 지시의 할당 합계와 같다', async () => {
    const [server] = await tabs(1);
    const { items } = (await call(server!, 'GET', '/api/orders?status=reserved,picking,picked'))
      .body as {
      items: OrderSummary[];
    };
    expect(items.length).toBeGreaterThanOrEqual(2);
    const expected = new Map<string, number>();
    for (const summary of items) {
      const detail = (await call(server!, 'GET', `/api/orders/${summary.id}`)).body as OrderDetail;
      for (const a of detail.route) expected.set(a.stockId, (expected.get(a.stockId) ?? 0) + a.qty);
    }
    const list = (await call(server!, 'GET', '/api/skus?size=100')).body as Page<SkuSummary>;
    for (const sku of list.items) {
      for (const stock of await stocksOf(server!, sku.id)) {
        expect(stock.reserved).toBe(expected.get(stock.id) ?? 0);
      }
    }
  });

  it('두 탭이 마지막 재고로 동시에 출고 지시를 만들면 하나만 예약된다', async () => {
    const [a, b] = await tabs(2);
    const { sku } = await firstStock(a!);
    const free = (await stocksOf(a!, sku.id)).reduce(
      (sum, s) => sum + Math.max(0, s.onHand - s.reserved),
      0,
    );
    const qty = Math.floor(free / 2) + 1;
    const body = (customer: string) => ({
      customer,
      dueAt: new Date().toISOString(),
      assigneeId: 'u-lee',
      lines: [{ skuId: sku.id, qty }],
    });
    const results = await Promise.all([
      call(a!, 'POST', '/api/orders', { body: body('가'), user: 'u-kim' }),
      call(b!, 'POST', '/api/orders', { body: body('나'), user: 'u-park' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const reserved = (await stocksOf(a!, sku.id)).reduce((sum, s) => sum + s.reserved, 0);
    const before = free; // 가용 재고에서 한 번만 빠졌는지
    const after = (await stocksOf(a!, sku.id)).reduce(
      (sum, s) => sum + Math.max(0, s.onHand - s.reserved),
      0,
    );
    expect(before - after).toBe(qty);
    expect(reserved).toBeGreaterThanOrEqual(qty);
  });

  it('피킹을 마치고 출고하면 집은 만큼 재고가 줄고, 덜 집은 예약은 풀린다', async () => {
    const [server] = await tabs(1);
    const { sku } = await firstStock(server!, 6);
    const created = await call(server!, 'POST', '/api/orders', {
      body: {
        customer: '시험상사',
        dueAt: new Date().toISOString(),
        assigneeId: 'u-lee',
        lines: [{ skuId: sku.id, qty: 5 }],
      },
      key: 'order-1',
    });
    expect(created.status).toBe(201);
    const order = created.body as ShipmentOrder;
    const before = await stocksOf(server!, sku.id);

    // 작업자가 할당마다 집습니다. 마지막 할당은 하나 덜 집습니다.
    let detail = (await call(server!, 'GET', `/api/orders/${order.id}`)).body as OrderDetail;
    const route = detail.route;
    for (const [index, a] of route.entries()) {
      const last = index === route.length - 1;
      const picked = await call(server!, 'PUT', `/api/orders/${order.id}/allocations/${a.id}`, {
        body: { pickedQty: last ? a.qty - 1 : a.qty, note: last ? '파손 1개' : '' },
        ifMatch: detail.order.version,
        user: 'u-lee',
      });
      expect(picked.status).toBe(200);
      detail = (await call(server!, 'GET', `/api/orders/${order.id}`)).body as OrderDetail;
    }
    expect(detail.order.status).toBe('picked');

    // 오래된 버전으로 출고하면 412
    const stale = await call(server!, 'POST', `/api/orders/${order.id}/ship`, { ifMatch: 1 });
    expect(stale.status).toBe(412);
    const shipped = await call(server!, 'POST', `/api/orders/${order.id}/ship`, {
      ifMatch: detail.order.version,
    });
    expect(shipped.status).toBe(200);

    const after = await stocksOf(server!, sku.id);
    const sum = (list: StockLevel[], key: 'onHand' | 'reserved') =>
      list.reduce((s, x) => s + x[key], 0);
    expect(sum(before, 'onHand') - sum(after, 'onHand')).toBe(4);
    expect(sum(before, 'reserved') - sum(after, 'reserved')).toBe(5);
  });

  it('작업자는 출고 지시를 만들거나 출고할 수 없고, 덜 집으면 사유가 필요하다', async () => {
    const [server] = await tabs(1);
    const made = await call(server!, 'POST', '/api/orders', {
      body: {
        customer: 'x',
        dueAt: new Date().toISOString(),
        assigneeId: 'u-lee',
        lines: [{ skuId: 'sku-10201', qty: 1 }],
      },
      user: 'u-lee',
    });
    expect(made.status).toBe(409);
    const detail = (await call(server!, 'GET', '/api/orders/so-003')).body as OrderDetail;
    const a = detail.route[0]!;
    const noReason = await call(server!, 'PUT', `/api/orders/so-003/allocations/${a.id}`, {
      body: { pickedQty: a.qty - 1 },
      ifMatch: detail.order.version,
      user: 'u-jung',
    });
    expect(noReason.status).toBe(400);

    // 예약 수량을 그대로 집으면 사유 없이 저장됩니다.
    const full = await call(server!, 'PUT', `/api/orders/so-003/allocations/${a.id}`, {
      body: { pickedQty: a.qty },
      ifMatch: detail.order.version,
      user: 'u-jung',
    });
    expect(full.status).toBe(200);
  });

  it('취소하면 예약을 모두 푼다', async () => {
    const [server] = await tabs(1);
    const detail = (await call(server!, 'GET', '/api/orders/so-003')).body as OrderDetail;
    const stockIds = new Set(detail.route.map((a) => a.stockId));
    const skuIds = new Set(detail.lines.map((l) => l.sku.id));
    const reservedOf = async () => {
      let total = 0;
      for (const skuId of skuIds) {
        for (const s of await stocksOf(server!, skuId)) if (stockIds.has(s.id)) total += s.reserved;
      }
      return total;
    };
    const before = await reservedOf();
    const cancelled = await call(server!, 'POST', '/api/orders/so-003/cancel', {
      ifMatch: detail.order.version,
    });
    expect(cancelled.status).toBe(200);
    expect(before - (await reservedOf())).toBe(detail.route.reduce((s, a) => s + a.qty, 0));
  });
});
