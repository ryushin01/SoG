/** 재고 실사: 목록·상세, 만들기, 시작·제출·취소, 항목 입력, 재실사 요청, 승인 정산 */
import {
  COUNT_STATUS_LABEL,
  settledOnHand,
  type ActivityKind,
  type CountLine,
  type CountTask,
  type Movement,
  type Sku,
} from '@sog/domain';
import { createCountRequestSchema, submitCountLineRequestSchema } from '@sog/domain/requests';
import { json, parseBody, row } from '../core/http';
import type { Mutate } from '../core/mutate';
import type { ServerScope } from '../core/scope';
import {
  HttpError,
  type Context,
  type MutationResult,
  type Route,
  type ServerResponse,
} from '../core/types';
import type { Views } from '../core/views';
import type { WriteOp } from '../idb';

export function countRoutes(scope: ServerScope, views: Views, mutate: Mutate): Route[] {
  const { db, load, mustGet, newId, now, requireAssignee, requireVersion, touch } = scope;
  const { lineView, netMoved, taskDetail, taskSummary } = views;

  async function createCount(ctx: Context, body: unknown): Promise<MutationResult> {
    const request = parseBody(createCountRequestSchema(), body);
    const { title } = request;
    const assignee = (await load.users()).find(
      (user) => user.id === request.assigneeId && user.role === 'operator',
    );
    if (!assignee) throw new HttpError(400, 'VALIDATION', '담당 작업자를 선택해 주세요.');
    const [locations, stocks, counts, lines] = await Promise.all([
      load.locations(),
      load.stocks(),
      load.counts(),
      load.lines(),
    ]);
    // 옛 시드가 남은 저장소에는 새 구역의 로케이션이 없을 수 있습니다(기준 정보에도 나오지 않음).
    if (!locations.some((location) => location.zone === request.zone))
      throw new HttpError(400, 'VALIDATION', '구역을 선택해 주세요.');
    const inZone = locations.filter((location) => location.zone === request.zone);
    // 로케이션을 골라 보내면 모두 고른 구역 안의 로케이션이어야 합니다(다른 구역 재고가 섞이지 않게).
    if (request.locationIds !== undefined && request.locationIds !== null) {
      const ids: unknown = request.locationIds;
      if (
        !Array.isArray(ids) ||
        ids.length > inZone.length ||
        ids.some((id) => typeof id !== 'string' || !inZone.some((l) => l.id === id))
      ) {
        throw new HttpError(400, 'VALIDATION', '고른 구역 안의 로케이션만 실사할 수 있습니다.');
      }
    }
    const targetIds = new Set(
      request.locationIds?.length ? request.locationIds : inZone.map((location) => location.id),
    );
    // 진행 중인 다른 실사와 같은 재고를 동시에 세지 않도록 막습니다.
    const busy = new Set(
      lines
        .filter((line) =>
          counts.some(
            (task) =>
              task.id === line.taskId && ['open', 'in_progress', 'submitted'].includes(task.status),
          ),
        )
        .map((line) => line.stockId),
    );
    const targets = stocks.filter((stock) => targetIds.has(stock.locationId));
    const free = targets.filter((stock) => !busy.has(stock.id));
    if (free.length === 0) {
      throw new HttpError(
        409,
        'INVALID_STATE',
        targets.length === 0
          ? '선택한 범위에 재고가 없습니다.'
          : '선택한 재고는 모두 다른 실사 작업에 포함되어 있습니다.',
      );
    }
    const at = now().toISOString();
    const n = counts.length + 1;
    const yymm = at.slice(2, 4) + at.slice(5, 7);
    const task: CountTask = {
      id: newId('ct'),
      code: `CC-${yymm}-${String(n).padStart(3, '0')}`,
      title,
      zone: request.zone,
      assigneeId: assignee.id,
      status: 'open',
      blind: request.blind,
      dueAt: new Date(request.dueAt).toISOString(),
      createdAt: at,
      createdBy: ctx.user.id,
      submittedAt: null,
      approvedAt: null,
      version: 1,
      updatedAt: at,
      updatedBy: ctx.user.id,
    };
    const ops: WriteOp[] = [{ store: 'counts', put: task }];
    free.forEach((stock, index) => {
      const line: CountLine = {
        id: `${task.id}-l${index}`,
        taskId: task.id,
        skuId: stock.skuId,
        locationId: stock.locationId,
        stockId: stock.id,
        expectedQty: stock.onHand,
        snapshotVersion: stock.version,
        snapshotAt: at,
        countedQty: null,
        countedAt: null,
        countedBy: null,
        status: 'pending',
        note: '',
        version: 1,
        updatedAt: at,
        updatedBy: ctx.user.id,
      };
      ops.push({ store: 'countLines', put: line });
    });
    const skipped = targets.length - free.length;
    return {
      status: 201,
      body: { ...task, skipped },
      etag: task.version,
      ops,
      topics: ['counts', 'dashboard'],
      activity: [
        {
          kind: 'count.created',
          message: `${ctx.user.name}님이 실사 작업 ${task.code}(${free.length}건)을 ${assignee.name}님에게 배정했습니다.`,
          target: `/counts/${task.id}`,
        },
      ],
    };
  }

  function transition(
    ctx: Context,
    id: string,
    from: CountTask['status'][],
    to: CountTask['status'],
    kind: ActivityKind,
    describe: (task: CountTask) => string,
    guard?: (task: CountTask) => Promise<void>,
  ): Promise<ServerResponse> {
    return mutate(ctx, `${to}:${id}`, async () => {
      const task = await mustGet<CountTask>('counts', id, '실사 작업');
      if (to === 'in_progress' || to === 'submitted') requireAssignee(ctx, task.assigneeId);
      await requireVersion(ctx, task, () => taskDetail(id));
      if (!from.includes(task.status)) {
        throw new HttpError(
          409,
          'INVALID_STATE',
          `${COUNT_STATUS_LABEL[task.status]} 상태에서는 할 수 없습니다.`,
          await taskDetail(id),
        );
      }
      await guard?.(task);
      const at = now().toISOString();
      const next = touch(
        { ...task, status: to, submittedAt: to === 'submitted' ? at : task.submittedAt },
        ctx.user,
      );
      return {
        body: next,
        etag: next.version,
        ops: [{ store: 'counts', put: next }],
        topics: ['counts', `counts/${id}`, 'dashboard'],
        activity: [
          { kind, message: `${ctx.user.name}님이 ${describe(task)}`, target: `/counts/${id}` },
        ],
      };
    });
  }

  async function submitLine(
    ctx: Context,
    taskId: string,
    lineId: string,
    body: unknown,
  ): Promise<MutationResult> {
    const task = await mustGet<CountTask>('counts', taskId, '실사 작업');
    const line = await mustGet<CountLine>('countLines', lineId, '실사 항목');
    if (line.taskId !== taskId)
      throw new HttpError(404, 'NOT_FOUND', '실사 항목을 찾을 수 없습니다.');
    requireAssignee(ctx, task.assigneeId);
    const current = async () => lineView((await db.get<CountLine>('countLines', lineId))!);
    if (!['open', 'in_progress'].includes(task.status)) {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `작업이 ${COUNT_STATUS_LABEL[task.status]} 상태라 더 입력할 수 없습니다.`,
        await current(),
      );
    }
    await requireVersion(ctx, line, current);
    const { countedQty, note = '' } = parseBody(submitCountLineRequestSchema(), body);
    const at = now().toISOString();
    const next = touch(
      {
        ...line,
        countedQty,
        note,
        countedAt: at,
        countedBy: ctx.user.id,
        status: 'counted' as const,
      },
      ctx.user,
    );
    const ops: WriteOp[] = [{ store: 'countLines', put: next }];
    if (task.status === 'open') {
      ops.push({ store: 'counts', put: touch({ ...task, status: 'in_progress' }, ctx.user) });
    }
    const sku = (await db.get<Sku>('skus', line.skuId))!;
    return {
      body: await lineView(next),
      etag: next.version,
      ops,
      topics: ['counts', `counts/${taskId}`],
      activity: [
        {
          kind: 'count.line',
          message: `${ctx.user.name}님이 ${task.code}에서 ${sku.name} ${countedQty}${sku.unit}을(를) 셌습니다.`,
          target: `/counts/${taskId}`,
        },
      ],
    };
  }

  async function requestRecount(
    ctx: Context,
    taskId: string,
    lineId: string,
  ): Promise<MutationResult> {
    const task = await mustGet<CountTask>('counts', taskId, '실사 작업');
    const line = await mustGet<CountLine>('countLines', lineId, '실사 항목');
    // 주소의 작업에 속한 항목만 바꿉니다. 다른 작업(이미 승인된 작업 등)의 항목을 건드리지 않게 합니다.
    if (line.taskId !== taskId)
      throw new HttpError(404, 'NOT_FOUND', '실사 항목을 찾을 수 없습니다.');
    await requireVersion(ctx, line, async () => lineView(line));
    if (!['in_progress', 'submitted'].includes(task.status) || line.status !== 'counted') {
      throw new HttpError(409, 'INVALID_STATE', '센 항목만 다시 세도록 요청할 수 있습니다.');
    }
    const next = touch({ ...line, status: 'recount' as const }, ctx.user);
    const ops: WriteOp[] = [{ store: 'countLines', put: next }];
    if (task.status === 'submitted') {
      ops.push({
        store: 'counts',
        put: touch({ ...task, status: 'in_progress', submittedAt: null }, ctx.user),
      });
    }
    const sku = (await db.get<Sku>('skus', line.skuId))!;
    return {
      body: await lineView(next),
      etag: next.version,
      ops,
      topics: ['counts', `counts/${taskId}`, 'dashboard'],
      activity: [
        {
          kind: 'count.recount',
          message: `${ctx.user.name}님이 ${task.code}의 ${sku.name}을(를) 다시 세도록 요청했습니다.`,
          target: `/counts/${taskId}`,
        },
      ],
    };
  }

  async function approveCount(ctx: Context, id: string): Promise<MutationResult> {
    const task = await mustGet<CountTask>('counts', id, '실사 작업');
    await requireVersion(ctx, task, () => taskDetail(id));
    if (task.status !== 'submitted') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `${COUNT_STATUS_LABEL[task.status]} 상태에서는 승인할 수 없습니다.`,
        await taskDetail(id),
      );
    }
    const [lines, stocks, movements] = await Promise.all([
      load.lines(),
      load.stocks(),
      load.movements(),
    ]);
    const at = now().toISOString();
    const ops: WriteOp[] = [];
    let adjusted = 0;
    const short: { skuId: string; target: number; reserved: number }[] = [];
    for (const line of lines.filter((l) => l.taskId === id)) {
      const stock = stocks.find((s) => s.id === line.stockId);
      if (!stock || line.countedQty === null) continue;
      // 센 뒤에 일어난 입출고는 실사 수량 위에 그대로 반영합니다.
      const target = settledOnHand(line.countedQty, netMoved(movements, line, line.countedAt));
      // 출고 예약보다 적게 확정하면 피킹·출고가 없는 재고를 내보내게 됩니다.
      if (target < stock.reserved) {
        short.push({ skuId: line.skuId, target, reserved: stock.reserved });
        continue;
      }
      const delta = target - stock.onHand;
      if (delta === 0) continue;
      adjusted++;
      ops.push({ store: 'stocks', put: touch({ ...stock, onHand: target }, ctx.user) });
      ops.push({
        store: 'movements',
        put: row<Movement>({
          id: newId('mv'),
          type: 'count',
          skuId: line.skuId,
          fromLocationId: null,
          toLocationId: line.locationId,
          qty: Math.abs(delta),
          delta,
          reason: '실사 차이 반영',
          ref: task.code,
          at,
          by: ctx.user.id,
        }),
      });
    }
    if (short.length > 0) {
      const skus = await load.skus();
      const list = short
        .map(
          (s) =>
            `${skus.find((k) => k.id === s.skuId)?.name ?? s.skuId}(확정 ${s.target}, 예약 ${s.reserved})`,
        )
        .join(', ');
      throw new HttpError(
        409,
        'INSUFFICIENT_STOCK',
        `실사 수량이 출고 예약보다 적은 품목이 있어 승인할 수 없습니다: ${list}. 출고 지시를 먼저 조정하거나 재실사를 요청해 주세요.`,
        await taskDetail(id),
      );
    }
    const next = touch({ ...task, status: 'approved' as const, approvedAt: at }, ctx.user);
    ops.push({ store: 'counts', put: next });
    const skuIds = new Set(lines.filter((l) => l.taskId === id).map((l) => l.skuId));
    return {
      body: { ...next, adjusted },
      etag: next.version,
      ops,
      topics: [
        'counts',
        `counts/${id}`,
        'skus',
        'dashboard',
        ...[...skuIds].map((skuId) => `skus/${skuId}`),
      ],
      activity: [
        {
          kind: 'count.approved',
          message: `${ctx.user.name}님이 ${task.code}을(를) 승인해 ${adjusted}건의 차이를 재고에 반영했습니다.`,
          target: `/counts/${id}`,
        },
      ],
    };
  }

  return [
    [
      'GET',
      '/api/counts',
      async (ctx) => {
        const status = ctx.query.get('status');
        const assigneeId = ctx.query.get('assigneeId');
        const [counts, lines, users] = await Promise.all([
          load.counts(),
          load.lines(),
          load.users(),
        ]);
        const filtered = counts
          .filter(
            (task) =>
              (!status || status.split(',').includes(task.status)) &&
              (!assigneeId || task.assigneeId === assigneeId),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json(200, {
          items: await Promise.all(filtered.map((task) => taskSummary(task, lines, users))),
        });
      },
    ],
    [
      'GET',
      '/api/counts/:id',
      async (_ctx, { id }) => {
        const detail = await taskDetail(id!);
        return json(200, detail, detail.task.version);
      },
    ],
    ['POST', '/api/counts', (ctx) => mutate(ctx, 'counts', () => createCount(ctx, ctx.body))],
    [
      'POST',
      '/api/counts/:id/start',
      (ctx, { id }) =>
        transition(
          ctx,
          id!,
          ['open'],
          'in_progress',
          'count.started',
          (task) => `${task.code} 실사를 시작했습니다.`,
        ),
    ],
    [
      'POST',
      '/api/counts/:id/submit',
      (ctx, { id }) =>
        transition(
          ctx,
          id!,
          ['in_progress'],
          'submitted',
          'count.submitted',
          (task) => `${task.code} 실사를 제출했습니다.`,
          async (task) => {
            const remaining = (await load.lines()).filter(
              (line) => line.taskId === task.id && line.status !== 'counted',
            );
            if (remaining.length > 0) {
              throw new HttpError(
                409,
                'INVALID_STATE',
                `아직 세지 않은 품목이 ${remaining.length}건 있습니다.`,
              );
            }
          },
        ),
    ],
    [
      'POST',
      '/api/counts/:id/cancel',
      (ctx, { id }) =>
        transition(
          ctx,
          id!,
          ['open', 'in_progress', 'submitted'],
          'cancelled',
          'count.cancelled',
          (task) => `${task.code} 실사를 취소했습니다.`,
        ),
    ],
    [
      'POST',
      '/api/counts/:id/approve',
      (ctx, { id }) => mutate(ctx, `approve:${id}`, () => approveCount(ctx, id!)),
    ],
    [
      'PUT',
      '/api/counts/:id/lines/:lineId',
      (ctx, { id, lineId }) =>
        mutate(ctx, `line:${lineId}`, () => submitLine(ctx, id!, lineId!, ctx.body)),
    ],
    [
      'POST',
      '/api/counts/:id/lines/:lineId/recount',
      (ctx, { id, lineId }) =>
        mutate(ctx, `recount:${lineId}`, () => requestRecount(ctx, id!, lineId!)),
    ],
  ];
}
