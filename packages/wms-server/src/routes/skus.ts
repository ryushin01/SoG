/** 품목(목록·상세·변경 이력·수정), 재고 조정, 입출고 */
import {
  available,
  type HistoryEntry,
  type Location,
  type Movement,
  type Sku,
  type StockLevel,
} from '@sog/domain';
import { adjustRequestSchema, movementRequestSchema, skuPatchSchema } from '@sog/domain/requests';
import { intParam, json, MAX_LIST_LIMIT, parseBody } from '../core/http';
import type { Mutate } from '../core/mutate';
import type { ServerScope } from '../core/scope';
import { HttpError, type Context, type MutationResult, type Route } from '../core/types';
import type { Views } from '../core/views';
import type { WriteOp } from '../idb';

export function skuRoutes(scope: ServerScope, views: Views, mutate: Mutate): Route[] {
  const { db, load, mustGet, newId, now, requireVersion, touch } = scope;
  const { listSkus, skuDetail } = views;

  async function createMovement(ctx: Context, body: unknown): Promise<MutationResult> {
    const request = parseBody(movementRequestSchema(), body);
    const sku = await mustGet<Sku>('skus', request.skuId, '품목');
    const { qty, reason } = request;
    const stocks = (await load.stocks()).filter((stock) => stock.skuId === sku.id);
    const locations = await load.locations();
    const codeOf = (id: string) => locations.find((location) => location.id === id)?.code;
    const ops: WriteOp[] = [];
    const at = now().toISOString();

    const take = (locationId: string): StockLevel => {
      const stock = stocks.find((s) => s.locationId === locationId);
      if (!stock)
        throw new HttpError(
          409,
          'INSUFFICIENT_STOCK',
          `${codeOf(locationId) ?? locationId}에는 이 품목 재고가 없습니다.`,
        );
      const free = available(stock.onHand, stock.reserved);
      if (free < qty) {
        throw new HttpError(
          409,
          'INSUFFICIENT_STOCK',
          `가용 재고가 부족합니다. ${codeOf(locationId)}의 가용 재고는 ${free}${sku.unit}입니다.`,
          { available: free },
        );
      }
      return touch({ ...stock, onHand: stock.onHand - qty }, ctx.user);
    };
    const give = (locationId: string): StockLevel => {
      if (!codeOf(locationId))
        throw new HttpError(400, 'VALIDATION', '로케이션을 찾을 수 없습니다.');
      const stock = stocks.find((s) => s.locationId === locationId);
      if (stock) return touch({ ...stock, onHand: stock.onHand + qty }, ctx.user);
      return {
        id: `st-${sku.id}-${codeOf(locationId)}`,
        skuId: sku.id,
        locationId,
        onHand: qty,
        reserved: 0,
        version: 1,
        updatedAt: at,
        updatedBy: ctx.user.id,
      };
    };

    let message: string;
    let from: string | null = null;
    let to: string | null = null;
    if (request.type === 'receipt') {
      to = request.toLocationId;
      ops.push({ store: 'stocks', put: give(to) });
      message = `${ctx.user.name}님이 ${sku.name} ${qty}${sku.unit}을(를) ${codeOf(to)}에 입고했습니다.`;
    } else if (request.type === 'shipment') {
      from = request.fromLocationId;
      ops.push({ store: 'stocks', put: take(from) });
      message = `${ctx.user.name}님이 ${sku.name} ${qty}${sku.unit}을(를) ${codeOf(from)}에서 출고했습니다.`;
    } else {
      from = request.fromLocationId;
      to = request.toLocationId;
      if (from === to) throw new HttpError(400, 'VALIDATION', '출발지와 도착지가 같습니다.');
      ops.push({ store: 'stocks', put: take(from) }, { store: 'stocks', put: give(to) });
      message = `${ctx.user.name}님이 ${sku.name} ${qty}${sku.unit}을(를) ${codeOf(from)} → ${codeOf(to)}로 옮겼습니다.`;
    }
    const movement: Movement = {
      id: newId('mv'),
      type: request.type,
      skuId: sku.id,
      fromLocationId: from,
      toLocationId: to,
      qty,
      delta: 0,
      reason,
      ref: 'ref' in request && request.ref ? request.ref : null,
      at,
      by: ctx.user.id,
    };
    ops.push({ store: 'movements', put: movement });
    return {
      status: 201,
      body: movement,
      ops,
      topics: ['skus', `skus/${sku.id}`, 'dashboard', 'counts'],
      activity: [{ kind: 'movement', message, target: `/inventory/${sku.id}` }],
    };
  }

  return [
    [
      'GET',
      '/api/skus/:id/history',
      async (_ctx, { id }) => {
        await mustGet<Sku>('skus', id!, '품목');
        const items = (await db.all<HistoryEntry>('history'))
          .filter((entry) => entry.skuId === id)
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 60);
        return json(200, { items });
      },
    ],
    ['GET', '/api/skus', async (ctx) => json(200, await listSkus(ctx.query))],
    [
      'GET',
      '/api/skus/:id',
      async (_ctx, { id }) => {
        const detail = await skuDetail(id!);
        return json(200, detail, detail.sku.version);
      },
    ],
    [
      'PATCH',
      '/api/skus/:id',
      (ctx, { id }) =>
        mutate(ctx, `sku:${id}`, async () => {
          const sku = await mustGet<Sku>('skus', id!, '품목');
          await requireVersion(ctx, sku, () => skuDetail(id!));
          const patch = parseBody(skuPatchSchema(), ctx.body);
          const next = touch(
            {
              ...sku,
              name: patch.name ?? sku.name,
              safetyStock: patch.safetyStock ?? sku.safetyStock,
              unitCost: patch.unitCost ?? sku.unitCost,
              description: patch.description ?? sku.description,
            },
            ctx.user,
          );
          return {
            body: next,
            etag: next.version,
            ops: [{ store: 'skus', put: next }],
            topics: ['skus', `skus/${id}`],
            activity: [
              {
                kind: 'sku.updated',
                message: `${ctx.user.name}님이 ${sku.name} 정보를 수정했습니다.`,
                target: `/inventory/${id}`,
              },
            ],
          };
        }),
    ],
    [
      'POST',
      '/api/stocks/:id/adjust',
      (ctx, { id }) =>
        mutate(ctx, `adjust:${id}`, async () => {
          const stock = await mustGet<StockLevel>('stocks', id!, '재고');
          await requireVersion(ctx, stock, () => skuDetail(stock.skuId));
          const { onHand, reason } = parseBody(adjustRequestSchema(), ctx.body);
          const delta = onHand - stock.onHand;
          if (delta === 0) throw new HttpError(400, 'VALIDATION', '현재 수량과 같습니다.');
          if (onHand < stock.reserved) {
            throw new HttpError(
              409,
              'INSUFFICIENT_STOCK',
              `출고 지시로 묶인 ${stock.reserved}개보다 적게 조정할 수 없습니다.`,
            );
          }
          const next = touch({ ...stock, onHand }, ctx.user);
          const sku = (await db.get<Sku>('skus', stock.skuId))!;
          const location = (await db.get<Location>('locations', stock.locationId))!;
          const movement: Movement = {
            id: newId('mv'),
            type: 'adjustment',
            skuId: stock.skuId,
            fromLocationId: null,
            toLocationId: stock.locationId,
            qty: Math.abs(delta),
            delta,
            reason,
            ref: null,
            at: now().toISOString(),
            by: ctx.user.id,
          };
          return {
            body: next,
            etag: next.version,
            ops: [
              { store: 'stocks', put: next },
              { store: 'movements', put: movement },
            ],
            topics: ['skus', `skus/${stock.skuId}`, 'dashboard', 'counts'],
            activity: [
              {
                kind: 'movement',
                message: `${ctx.user.name}님이 ${sku.name}(${location.code}) 재고를 ${stock.onHand} → ${onHand}${sku.unit}로 조정했습니다.`,
                target: `/inventory/${stock.skuId}`,
              },
            ],
          };
        }),
    ],
    [
      'POST',
      '/api/movements',
      (ctx) => mutate(ctx, 'movements', () => createMovement(ctx, ctx.body)),
    ],
    [
      'GET',
      '/api/movements',
      async (ctx) => {
        const skuId = ctx.query.get('skuId');
        const type = ctx.query.get('type');
        const limit = intParam(ctx.query.get('limit'), 50, 1, MAX_LIST_LIMIT);
        const items = (await load.movements())
          .filter(
            (movement) => (!skuId || movement.skuId === skuId) && (!type || movement.type === type),
          )
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit);
        return json(200, { items });
      },
    ],
  ];
}
