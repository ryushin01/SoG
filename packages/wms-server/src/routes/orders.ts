/** 출고 지시: 목록·상세, 만들기(재고 예약), 피킹, 출고 확정, 취소 */
import {
  allocate,
  available,
  ORDER_STATUS_LABEL,
  type CreateOrderRequest,
  type Movement,
  type PickRequest,
  type ShipmentOrder,
  type Sku,
  type StockLevel,
} from '@sog/domain';
import { json, positiveInt, row, text } from '../core/http';
import type { Mutate } from '../core/mutate';
import type { ServerScope } from '../core/scope';
import { HttpError, type Context, type MutationResult, type Route } from '../core/types';
import type { Views } from '../core/views';
import type { WriteOp } from '../idb';

export function orderRoutes(scope: ServerScope, views: Views, mutate: Mutate): Route[] {
  const { db, load, mustGet, newId, now, requireAssignee, requireVersion, touch } = scope;
  const { orderDetail, orderSummary } = views;

  async function createOrder(ctx: Context, request: CreateOrderRequest): Promise<MutationResult> {
    const customer = text(request?.customer, '고객사', 40);
    const users = await load.users();
    const assignee = users.find(
      (user) => user.id === request.assigneeId && user.role === 'operator',
    );
    if (!assignee) throw new HttpError(400, 'VALIDATION', '피킹 작업자를 선택해 주세요.');
    if (!request.dueAt || Number.isNaN(Date.parse(request.dueAt))) {
      throw new HttpError(400, 'VALIDATION', '출고 마감을 입력해 주세요.');
    }
    if (!Array.isArray(request.lines) || request.lines.length === 0) {
      throw new HttpError(400, 'VALIDATION', '품목을 하나 이상 넣어 주세요.');
    }
    if (request.lines.length > 20)
      throw new HttpError(400, 'VALIDATION', '품목은 20개까지 넣을 수 있습니다.');
    const ids = request.lines.map((line) => line.skuId);
    if (new Set(ids).size !== ids.length)
      throw new HttpError(400, 'VALIDATION', '같은 품목이 두 번 들어 있습니다.');

    const [skus, stocks, orders] = await Promise.all([load.skus(), load.stocks(), load.orders()]);
    const touched = new Map<string, StockLevel>();
    const shortages: string[] = [];
    const at = now().toISOString();
    const id = newId('so');
    const lines: ShipmentOrder['lines'] = [];
    request.lines.forEach((want, index) => {
      const sku = skus.find((s) => s.id === want.skuId);
      if (!sku) throw new HttpError(400, 'VALIDATION', '없는 품목이 들어 있습니다.');
      const qty = positiveInt(want.qty, `${sku.name} 수량`);
      // 잠금 안에서 최신 재고로 계산하므로, 동시에 만든 다른 출고 지시와 같은 수량을 두 번 잡지 않습니다.
      const candidates = stocks
        .filter((stock) => stock.skuId === sku.id)
        .map((stock) => touched.get(stock.id) ?? stock);
      const picks = allocate(candidates, qty);
      if (!picks) {
        const free = candidates.reduce(
          (sum, stock) => sum + available(stock.onHand, stock.reserved),
          0,
        );
        shortages.push(`${sku.name}(가용 ${free}${sku.unit}, 요청 ${qty}${sku.unit})`);
        return;
      }
      lines.push({
        id: `${id}-l${index}`,
        skuId: sku.id,
        qty,
        allocations: picks.map((pick, i) => {
          touched.set(
            pick.stock.id,
            touch({ ...pick.stock, reserved: pick.stock.reserved + pick.qty }, ctx.user),
          );
          return {
            id: `${id}-l${index}-a${i}`,
            stockId: pick.stock.id,
            locationId: pick.stock.locationId,
            qty: pick.qty,
            pickedQty: null,
            pickedBy: null,
            pickedAt: null,
            note: '',
          };
        }),
      });
    });
    if (shortages.length > 0) {
      throw new HttpError(
        409,
        'INSUFFICIENT_STOCK',
        `가용 재고가 부족합니다: ${shortages.join(', ')}`,
      );
    }
    const yymm = at.slice(2, 4) + at.slice(5, 7);
    const order: ShipmentOrder = {
      id,
      code: `SO-${yymm}-${String(orders.length + 1).padStart(4, '0')}`,
      customer,
      status: 'reserved',
      assigneeId: assignee.id,
      dueAt: new Date(request.dueAt).toISOString(),
      createdAt: at,
      createdBy: ctx.user.id,
      shippedAt: null,
      lines,
      version: 1,
      updatedAt: at,
      updatedBy: ctx.user.id,
    };
    const ops: WriteOp[] = [
      { store: 'orders', put: order },
      ...[...touched.values()].map((stock) => ({ store: 'stocks' as const, put: stock })),
    ];
    return {
      status: 201,
      body: order,
      etag: order.version,
      ops,
      topics: [
        'orders',
        `orders/${id}`,
        'skus',
        'dashboard',
        ...lines.map((line) => `skus/${line.skuId}`),
      ],
      activity: [
        {
          kind: 'order.created',
          message: `${ctx.user.name}님이 ${customer} 출고 지시 ${order.code}(${lines.length}품목)를 만들고 재고를 예약했습니다.`,
          target: `/orders/${id}`,
        },
      ],
    };
  }

  async function pickAllocation(
    ctx: Context,
    orderId: string,
    allocationId: string,
    request: PickRequest,
  ): Promise<MutationResult> {
    const order = await mustGet<ShipmentOrder>('orders', orderId, '출고 지시');
    requireAssignee(ctx, order.assigneeId);
    await requireVersion(ctx, order, () => orderDetail(orderId));
    if (order.status !== 'reserved' && order.status !== 'picking') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `${ORDER_STATUS_LABEL[order.status]} 상태라 피킹할 수 없습니다.`,
        await orderDetail(orderId),
      );
    }
    const line = order.lines.find((l) => l.allocations.some((a) => a.id === allocationId));
    const allocation = line?.allocations.find((a) => a.id === allocationId);
    if (!line || !allocation)
      throw new HttpError(404, 'NOT_FOUND', '피킹 항목을 찾을 수 없습니다.');
    const pickedQty = positiveInt(request.pickedQty, '집은 수량', true);
    if (pickedQty > allocation.qty) {
      throw new HttpError(
        400,
        'VALIDATION',
        `할당된 ${allocation.qty}개보다 많이 집을 수 없습니다.`,
      );
    }
    const note = text(request.note ?? '', '메모', 100, false);
    if (pickedQty < allocation.qty && !note) {
      throw new HttpError(400, 'VALIDATION', '덜 집었으면 사유를 적어 주세요.');
    }
    const at = now().toISOString();
    const lines = order.lines.map((l) => ({
      ...l,
      allocations: l.allocations.map((a) =>
        a.id === allocationId ? { ...a, pickedQty, pickedBy: ctx.user.id, pickedAt: at, note } : a,
      ),
    }));
    const done = lines.every((l) => l.allocations.every((a) => a.pickedQty !== null));
    const next = touch(
      { ...order, lines, status: done ? ('picked' as const) : ('picking' as const) },
      ctx.user,
    );
    const sku = (await db.get<Sku>('skus', line.skuId))!;
    return {
      body: next,
      etag: next.version,
      ops: [{ store: 'orders', put: next }],
      topics: ['orders', `orders/${orderId}`, 'dashboard'],
      activity: done
        ? [
            {
              kind: 'order.picked',
              message: `${ctx.user.name}님이 ${order.code} 피킹을 마쳤습니다.`,
              target: `/orders/${orderId}`,
            },
          ]
        : [
            {
              kind: 'order.picked',
              message: `${ctx.user.name}님이 ${order.code}에서 ${sku.name} ${pickedQty}${sku.unit}을(를) 집었습니다.`,
              target: `/orders/${orderId}`,
            },
          ],
    };
  }

  async function shipOrder(ctx: Context, id: string): Promise<MutationResult> {
    const order = await mustGet<ShipmentOrder>('orders', id, '출고 지시');
    await requireVersion(ctx, order, () => orderDetail(id));
    if (order.status !== 'picked') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `${ORDER_STATUS_LABEL[order.status]} 상태에서는 출고할 수 없습니다. 피킹을 먼저 마쳐 주세요.`,
        await orderDetail(id),
      );
    }
    const stocks = await load.stocks();
    const at = now().toISOString();
    const changed = new Map<string, StockLevel>();
    const ops: WriteOp[] = [];
    for (const line of order.lines) {
      for (const a of line.allocations) {
        const stock = changed.get(a.stockId) ?? stocks.find((s) => s.id === a.stockId)!;
        const picked = a.pickedQty ?? 0;
        changed.set(
          a.stockId,
          touch(
            {
              ...stock,
              onHand: Math.max(0, stock.onHand - picked),
              reserved: Math.max(0, stock.reserved - a.qty),
            },
            ctx.user,
          ),
        );
        if (picked > 0) {
          ops.push({
            store: 'movements',
            put: row<Movement>({
              id: newId('mv'),
              type: 'shipment',
              skuId: line.skuId,
              fromLocationId: a.locationId,
              toLocationId: null,
              qty: picked,
              delta: 0,
              reason: `${order.customer} 출고`,
              ref: order.code,
              at,
              by: ctx.user.id,
            }),
          });
        }
      }
    }
    for (const stock of changed.values()) ops.push({ store: 'stocks', put: stock });
    const next = touch({ ...order, status: 'shipped' as const, shippedAt: at }, ctx.user);
    ops.push({ store: 'orders', put: next });
    const short = order.lines
      .flatMap((l) => l.allocations)
      .reduce((sum, a) => sum + (a.qty - (a.pickedQty ?? 0)), 0);
    return {
      body: next,
      etag: next.version,
      ops,
      topics: [
        'orders',
        `orders/${id}`,
        'skus',
        'dashboard',
        ...order.lines.map((l) => `skus/${l.skuId}`),
      ],
      activity: [
        {
          kind: 'order.shipped',
          message: `${ctx.user.name}님이 ${order.code}을(를) 출고했습니다.${short > 0 ? ` 덜 집은 ${short}개는 예약을 풀었습니다.` : ''}`,
          target: `/orders/${id}`,
        },
      ],
    };
  }

  async function cancelOrder(ctx: Context, id: string): Promise<MutationResult> {
    const order = await mustGet<ShipmentOrder>('orders', id, '출고 지시');
    await requireVersion(ctx, order, () => orderDetail(id));
    if (order.status === 'shipped' || order.status === 'cancelled') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `${ORDER_STATUS_LABEL[order.status]} 상태라 취소할 수 없습니다.`,
        await orderDetail(id),
      );
    }
    const stocks = await load.stocks();
    const changed = new Map<string, StockLevel>();
    for (const a of order.lines.flatMap((l) => l.allocations)) {
      const stock = changed.get(a.stockId) ?? stocks.find((s) => s.id === a.stockId)!;
      changed.set(
        a.stockId,
        touch({ ...stock, reserved: Math.max(0, stock.reserved - a.qty) }, ctx.user),
      );
    }
    const next = touch({ ...order, status: 'cancelled' as const }, ctx.user);
    return {
      body: next,
      etag: next.version,
      ops: [
        { store: 'orders', put: next },
        ...[...changed.values()].map((stock) => ({ store: 'stocks' as const, put: stock })),
      ],
      topics: [
        'orders',
        `orders/${id}`,
        'skus',
        'dashboard',
        ...order.lines.map((l) => `skus/${l.skuId}`),
      ],
      activity: [
        {
          kind: 'order.cancelled',
          message: `${ctx.user.name}님이 ${order.code}을(를) 취소하고 예약을 풀었습니다.`,
          target: `/orders/${id}`,
        },
      ],
    };
  }

  return [
    [
      'GET',
      '/api/orders',
      async (ctx) => {
        const status = ctx.query.get('status');
        const assigneeId = ctx.query.get('assigneeId');
        const [orders, users] = await Promise.all([load.orders(), load.users()]);
        const items = orders
          .filter(
            (order) =>
              (!status || status.split(',').includes(order.status)) &&
              (!assigneeId || order.assigneeId === assigneeId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((order) => orderSummary(order, users));
        return json(200, { items });
      },
    ],
    [
      'GET',
      '/api/orders/:id',
      async (_ctx, { id }) => {
        const detail = await orderDetail(id!);
        return json(200, detail, detail.order.version);
      },
    ],
    [
      'POST',
      '/api/orders',
      (ctx) => mutate(ctx, 'orders', () => createOrder(ctx, ctx.body as CreateOrderRequest)),
    ],
    [
      'PUT',
      '/api/orders/:id/allocations/:allocationId',
      (ctx, { id, allocationId }) =>
        mutate(ctx, `pick:${allocationId}`, () =>
          pickAllocation(ctx, id!, allocationId!, (ctx.body ?? {}) as PickRequest),
        ),
    ],
    [
      'POST',
      '/api/orders/:id/ship',
      (ctx, { id }) => mutate(ctx, `ship:${id}`, () => shipOrder(ctx, id!)),
    ],
    [
      'POST',
      '/api/orders/:id/cancel',
      (ctx, { id }) => mutate(ctx, `cancel-order:${id}`, () => cancelOrder(ctx, id!)),
    ],
  ];
}
