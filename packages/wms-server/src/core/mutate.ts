/** 쓰기 공통 처리: 쓰기 잠금, 멱등 재전송, 변경 이력·활동 기록, 변경 알림 */
import type { Activity, HistoryEntry } from '@sog/domain';
import type { WriteOp } from '../idb';
import { diff, STORE_KIND } from './history';
import { json, row } from './http';
import type { ServerScope } from './scope';
import type { Context, IdempotencyRecord, MutationResult, ServerResponse } from './types';

export function createMutate(scope: ServerScope) {
  const { db, emit, load, lock, newId, now } = scope;

  async function mutate(
    ctx: Context,
    scope: string,
    work: () => Promise<MutationResult>,
  ): Promise<ServerResponse> {
    return lock(async () => {
      const idemId = ctx.idempotencyKey ? `${ctx.user.id}:${scope}:${ctx.idempotencyKey}` : null;
      if (idemId) {
        const replay = await db.get<IdempotencyRecord>('idempotency', idemId);
        if (replay) {
          return json(replay.status, replay.body, replay.etag, { 'Idempotent-Replayed': 'true' });
        }
      }
      const result = await work();
      const at = now().toISOString();
      const ops = [...result.ops];
      // 품목·재고·실사 항목이 바뀌면 이전 문서와 비교해 변경 이력을 남깁니다(어느 업무로 바뀌었든 빠짐없이).
      const reason = result.activity[0]?.message ?? '';
      const tracked = result.ops.filter(
        (op): op is Extract<WriteOp, { put: { id: string } }> =>
          'put' in op && STORE_KIND[op.store] !== undefined,
      );
      // 이전 문서는 저장소마다 한 번에 읽습니다. 하나씩 읽으면 실사 승인처럼 문서가 많은 쓰기가
      // 모든 쓰기를 한 줄로 세우는 잠금을 그만큼 오래 붙잡습니다.
      const previous = new Map<string, Record<string, unknown>>();
      for (const store of new Set(tracked.map((op) => op.store))) {
        const ids = tracked.filter((op) => op.store === store).map((op) => op.put.id);
        for (const doc of await db.getMany<{ id: string }>(store, ids)) {
          previous.set(`${store}/${doc.id}`, doc as Record<string, unknown>);
        }
      }
      const locations = tracked.some((op) => op.store !== 'skus') ? await load.locations() : [];
      for (const op of tracked) {
        const kind = STORE_KIND[op.store]!;
        const after = op.put as Record<string, unknown> & { id: string; version?: number };
        const before = previous.get(`${op.store}/${after.id}`);
        const changes = diff(kind, before, after);
        if (changes.length === 0) continue;
        const skuId = kind === 'sku' ? after.id : String(after['skuId']);
        const locationId = kind === 'sku' ? null : String(after['locationId']);
        ops.push({
          store: 'history',
          put: row<HistoryEntry>({
            id: newId('hi'),
            kind,
            docId: after.id,
            skuId,
            version: after.version ?? 0,
            at,
            by: ctx.user.id,
            reason,
            locationCode: locationId
              ? (locations.find((l) => l.id === locationId)?.code ?? null)
              : null,
            changes,
            blocked: false,
          }),
        });
      }
      for (const item of result.activity) {
        ops.push({
          store: 'activity',
          put: row<Activity>({ id: newId('ac'), ...item, at, by: ctx.user.id }),
        });
      }
      const status = result.status ?? 200;
      if (idemId) {
        ops.push({
          store: 'idempotency',
          put: row<IdempotencyRecord>({
            id: idemId,
            status,
            body: result.body,
            etag: result.etag,
            at,
          }),
        });
      }
      await db.write(ops);
      await emit({
        topics: result.topics,
        by: ctx.user.id,
        at,
        origin: ctx.origin,
        message: result.activity[0]?.message ?? '',
      });
      return json(status, result.body, result.etag);
    });
  }

  return mutate;
}

export type Mutate = ReturnType<typeof createMutate>;
