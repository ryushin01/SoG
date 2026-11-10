/**
 * 브라우저 안에서 도는 WMS 데모 서버.
 * 실제 백엔드와 같은 HTTP 의미(상태 코드, ETag/If-Match, Idempotency-Key)를 지켜서, 앱은 HttpClient로만 통신합니다.
 */
import {
  accuracyRate,
  available,
  COUNT_STATUS_LABEL,
  movementEffect,
  settledOnHand,
  stockStatus,
  variance,
  type Activity,
  type ActivityKind,
  type AdjustRequest,
  type ApiError,
  type ChangeEvent,
  type CountLine,
  type CountLineView,
  type CountTask,
  type CountTaskDetail,
  type CountTaskSummary,
  type CreateCountRequest,
  type DashboardKpis,
  type Location,
  type LocationDetail,
  type LocationOverview,
  type LocationStatus,
  type Movement,
  type MovementRequest,
  type Page,
  type Sku,
  type SkuDetail,
  type SkuPatch,
  type SkuQuery,
  type SkuSummary,
  type StockLevel,
  type SubmitCountLineRequest,
  type User,
  type ZoneCode,
} from '@sog/domain';
import { Database, STORES, type WriteOp } from './idb';
import { createLock, type Lock } from './lock';
import { createSeed, ZONES } from './seed';

export interface ServerRequest {
  method: string;
  /** /api/... 형태의 경로와 쿼리 */
  url: string;
  headers: Record<string, string | null | undefined>;
  body?: unknown;
}

export interface ServerResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface WmsServerOptions {
  dbName?: string;
  /** 응답 지연 범위(ms). 경쟁 상태를 눈으로 확인할 수 있게 실제 네트워크처럼 늦춥니다. */
  latency?: [number, number];
  now?: () => Date;
  channelName?: string;
}

export interface WmsServer {
  readonly origin: string;
  handle(request: ServerRequest): Promise<ServerResponse>;
  /** 이 탭과 다른 탭에서 일어난 변경을 받습니다. */
  subscribe(listener: (event: ChangeEvent) => void): () => void;
  reset(): Promise<void>;
  close(): void;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['code'],
    message: string,
    readonly current?: unknown,
  ) {
    super(message);
  }
}

interface Context {
  user: User;
  ifMatch: number | null;
  idempotencyKey: string | null;
  query: URLSearchParams;
  body: unknown;
}

interface MutationResult {
  status?: number;
  body: unknown;
  etag?: number;
  ops: WriteOp[];
  topics: string[];
  activity: { kind: ActivityKind; message: string; target: string | null }[];
}

interface IdempotencyRecord {
  id: string;
  status: number;
  body: unknown;
  etag?: number;
  at: string;
}

type Handler = (ctx: Context, params: Record<string, string>) => Promise<ServerResponse>;

const SEED_KEY = 'seed';

export async function createWmsServer(options: WmsServerOptions = {}): Promise<WmsServer> {
  const dbName = options.dbName ?? 'sog-wms';
  const now = options.now ?? (() => new Date());
  const [minDelay, maxDelay] = options.latency ?? [0, 0];
  const origin = Math.random().toString(36).slice(2, 10);
  const lock: Lock = createLock(`${dbName}:write`);
  const db = await Database.open(dbName);
  const listeners = new Set<(event: ChangeEvent) => void>();
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(options.channelName ?? `${dbName}:changes`)
      : null;
  channel?.addEventListener('message', (message: MessageEvent<ChangeEvent>) => {
    listeners.forEach((listener) => listener(message.data));
  });

  let seq = 0;
  const newId = (prefix: string) =>
    `${prefix}-${now().getTime().toString(36)}${(seq++).toString(36)}${origin.slice(0, 3)}`;

  async function ensureSeed(): Promise<void> {
    if (await db.get('meta', SEED_KEY)) return;
    await lock(async () => {
      // 다른 탭이 잠금을 먼저 잡고 시드를 넣었을 수 있습니다.
      if (await db.get('meta', SEED_KEY)) return;
      await writeSeed();
    });
  }

  async function writeSeed(): Promise<void> {
    const seed = createSeed(now());
    const ops: WriteOp[] = STORES.map((store) => ({ store, clear: true as const }));
    for (const [store, rows] of Object.entries(seed) as [keyof typeof seed, { id: string }[]][]) {
      for (const row of rows) ops.push({ store, put: row });
    }
    ops.push({ store: 'meta', put: { id: SEED_KEY, at: now().toISOString() } as { id: string } });
    await db.write(ops);
  }

  await ensureSeed();

  // ---------- 읽기 도우미 ----------
  const load = {
    users: () => db.all<User>('users'),
    locations: () => db.all<Location>('locations'),
    skus: () => db.all<Sku>('skus'),
    stocks: () => db.all<StockLevel>('stocks'),
    movements: () => db.all<Movement>('movements'),
    counts: () => db.all<CountTask>('counts'),
    lines: () => db.all<CountLine>('countLines'),
  };

  async function mustGet<T>(
    store: Parameters<Database['get']>[0],
    id: string,
    label: string,
  ): Promise<T> {
    const value = await db.get<T>(store, id);
    if (!value) throw new HttpError(404, 'NOT_FOUND', `${label}을(를) 찾을 수 없습니다.`);
    return value;
  }

  function requireVersion(
    ctx: Context,
    resource: { version: number },
    current: () => Promise<unknown>,
  ) {
    if (ctx.ifMatch === null) {
      throw new HttpError(
        428,
        'PRECONDITION_REQUIRED',
        '수정하려면 마지막으로 받은 버전(If-Match)이 필요합니다.',
      );
    }
    if (ctx.ifMatch !== resource.version) {
      return current().then((value) => {
        throw new HttpError(
          412,
          'VERSION_CONFLICT',
          '다른 사용자가 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
          value,
        );
      });
    }
    return Promise.resolve();
  }

  function touch<T extends { version: number; updatedAt: string; updatedBy: string }>(
    value: T,
    user: User,
  ): T {
    return {
      ...value,
      version: value.version + 1,
      updatedAt: now().toISOString(),
      updatedBy: user.id,
    };
  }

  function positiveInt(value: unknown, label: string, allowZero = false): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
      throw new HttpError(
        400,
        'VALIDATION',
        `${label}은(는) ${allowZero ? '0 이상' : '1 이상'}의 정수여야 합니다.`,
      );
    }
    if (value > 1_000_000) throw new HttpError(400, 'VALIDATION', `${label}이(가) 너무 큽니다.`);
    return value;
  }

  function text(value: unknown, label: string, max = 200, required = true): string {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (required && !trimmed)
      throw new HttpError(400, 'VALIDATION', `${label}을(를) 입력해 주세요.`);
    if (trimmed.length > max)
      throw new HttpError(400, 'VALIDATION', `${label}은(는) ${max}자 이내로 입력해 주세요.`);
    return trimmed;
  }

  // ---------- 조합 ----------
  function summarize(sku: Sku, stocks: StockLevel[]): SkuSummary {
    const own = stocks.filter((stock) => stock.skuId === sku.id);
    const onHand = own.reduce((sum, stock) => sum + stock.onHand, 0);
    const reserved = own.reduce((sum, stock) => sum + stock.reserved, 0);
    return {
      ...sku,
      onHand,
      reserved,
      available: available(onHand, reserved),
      locationCount: own.filter((stock) => stock.onHand > 0).length,
      status: stockStatus(onHand, sku.safetyStock),
    };
  }

  async function skuDetail(id: string): Promise<SkuDetail> {
    const sku = await mustGet<Sku>('skus', id, '품목');
    const [stocks, locations, movements] = await Promise.all([
      load.stocks(),
      load.locations(),
      load.movements(),
    ]);
    const own = stocks
      .filter((stock) => stock.skuId === id)
      .map((stock) => ({ ...stock, location: locations.find((l) => l.id === stock.locationId)! }))
      .sort((a, b) => a.location.code.localeCompare(b.location.code));
    const summary = summarize(sku, stocks);
    return {
      sku,
      stocks: own,
      movements: movements
        .filter((movement) => movement.skuId === id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 30),
      status: summary.status,
    };
  }

  function netMoved(movements: Movement[], line: CountLine, since: string | null): number {
    if (!since) return 0;
    return movements
      .filter((movement) => movement.skuId === line.skuId && movement.at > since)
      .reduce((sum, movement) => sum + movementEffect(movement, line.locationId), 0);
  }

  async function taskSummary(
    task: CountTask,
    lines?: CountLine[],
    users?: User[],
  ): Promise<CountTaskSummary> {
    const own = (lines ?? (await load.lines())).filter((line) => line.taskId === task.id);
    const assignee = (users ?? (await load.users())).find((user) => user.id === task.assigneeId)!;
    return {
      ...task,
      assignee,
      lineCount: own.length,
      countedCount: own.filter((line) => line.status === 'counted').length,
      recountCount: own.filter((line) => line.status === 'recount').length,
      varianceCount: own.filter((line) => (variance(line) ?? 0) !== 0).length,
    };
  }

  async function lineView(
    line: CountLine,
    ctx?: { skus: Sku[]; locations: Location[]; movements: Movement[] },
  ): Promise<CountLineView> {
    const skus = ctx?.skus ?? (await load.skus());
    const locations = ctx?.locations ?? (await load.locations());
    const movements = ctx?.movements ?? (await load.movements());
    const sku = skus.find((s) => s.id === line.skuId)!;
    return {
      ...line,
      sku: {
        id: sku.id,
        code: sku.code,
        name: sku.name,
        barcode: sku.barcode,
        unit: sku.unit,
        unitCost: sku.unitCost,
        shape: sku.shape,
        hue: sku.hue,
        category: sku.category,
      },
      location: locations.find((l) => l.id === line.locationId)!,
      movedSinceSnapshot: netMoved(movements, line, line.snapshotAt),
      movedSinceCount: netMoved(movements, line, line.countedAt),
    };
  }

  async function taskDetail(id: string): Promise<CountTaskDetail> {
    const task = await mustGet<CountTask>('counts', id, '실사 작업');
    const [lines, skus, locations, movements] = await Promise.all([
      load.lines(),
      load.skus(),
      load.locations(),
      load.movements(),
    ]);
    const own = lines.filter((line) => line.taskId === id);
    const views = await Promise.all(
      own.map((line) => lineView(line, { skus, locations, movements })),
    );
    views.sort(
      (a, b) =>
        a.location.code.localeCompare(b.location.code) || a.sku.code.localeCompare(b.sku.code),
    );
    return { task: await taskSummary(task, lines), lines: views };
  }

  // ---------- 쓰기 ----------
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
      emit({
        topics: result.topics,
        by: ctx.user.id,
        at,
        origin,
        message: result.activity[0]?.message ?? '',
      });
      return json(status, result.body, result.etag);
    });
  }

  function emit(event: ChangeEvent) {
    listeners.forEach((listener) => listener(event));
    channel?.postMessage(event);
  }

  function json(
    status: number,
    body: unknown,
    etag?: number,
    extra: Record<string, string> = {},
  ): ServerResponse {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
    if (etag !== undefined) headers['ETag'] = `"${etag}"`;
    return { status, headers, body };
  }

  // ---------- 라우트 ----------
  const routes: [method: string, pattern: string, handler: Handler][] = [
    [
      'GET',
      '/api/reference',
      async () =>
        json(200, { zones: ZONES, locations: await load.locations(), users: await load.users() }),
    ],
    ['GET', '/api/dashboard', async () => json(200, await dashboard())],
    ['GET', '/api/locations/overview', async () => json(200, { items: await locationOverview() })],
    ['GET', '/api/locations/:id', async (_ctx, { id }) => json(200, await locationDetail(id!))],
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
          const patch = (ctx.body ?? {}) as SkuPatch;
          const next = touch(
            {
              ...sku,
              name: patch.name !== undefined ? text(patch.name, '품목명', 60) : sku.name,
              safetyStock:
                patch.safetyStock !== undefined
                  ? positiveInt(patch.safetyStock, '안전 재고', true)
                  : sku.safetyStock,
              unitCost:
                patch.unitCost !== undefined
                  ? positiveInt(patch.unitCost, '단가', true)
                  : sku.unitCost,
              description:
                patch.description !== undefined
                  ? text(patch.description, '설명', 500, false)
                  : sku.description,
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
          const body = (ctx.body ?? {}) as AdjustRequest;
          const onHand = positiveInt(body.onHand, '수량', true);
          const reason = text(body.reason, '조정 사유', 100);
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
      (ctx) => mutate(ctx, 'movements', () => createMovement(ctx, ctx.body as MovementRequest)),
    ],
    [
      'GET',
      '/api/movements',
      async (ctx) => {
        const skuId = ctx.query.get('skuId');
        const type = ctx.query.get('type');
        const limit = Number(ctx.query.get('limit') ?? 50);
        const items = (await load.movements())
          .filter(
            (movement) => (!skuId || movement.skuId === skuId) && (!type || movement.type === type),
          )
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit);
        return json(200, { items });
      },
    ],
    [
      'GET',
      '/api/activity',
      async (ctx) => {
        const limit = Number(ctx.query.get('limit') ?? 20);
        const items = (await db.all<Activity>('activity'))
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, limit);
        return json(200, { items });
      },
    ],
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
    [
      'POST',
      '/api/counts',
      (ctx) => mutate(ctx, 'counts', () => createCount(ctx, ctx.body as CreateCountRequest)),
    ],
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
        mutate(ctx, `line:${lineId}`, () =>
          submitLine(ctx, id!, lineId!, (ctx.body ?? {}) as SubmitCountLineRequest),
        ),
    ],
    [
      'POST',
      '/api/counts/:id/lines/:lineId/recount',
      (ctx, { id, lineId }) =>
        mutate(ctx, `recount:${lineId}`, () => requestRecount(ctx, id!, lineId!)),
    ],
    [
      'POST',
      '/api/_reset',
      async (ctx) =>
        lock(async () => {
          await writeSeed();
          emit({
            topics: ['*'],
            by: ctx.user.id,
            at: now().toISOString(),
            origin,
            message: '데모 데이터를 초기화했습니다.',
          });
          return json(204, null);
        }),
    ],
  ];

  async function listSkus(query: URLSearchParams): Promise<Page<SkuSummary>> {
    const q: SkuQuery = {
      q: query.get('q') ?? '',
      category: (query.get('category') ?? '') as SkuQuery['category'],
      status: (query.get('status') ?? '') as SkuQuery['status'],
      zone: (query.get('zone') ?? '') as SkuQuery['zone'],
      sort: (query.get('sort') ?? 'code') as SkuQuery['sort'],
      dir: query.get('dir') === 'desc' ? 'desc' : 'asc',
      page: Math.max(1, Number(query.get('page') ?? 1)),
      size: Math.min(100, Math.max(1, Number(query.get('size') ?? 20))),
    };
    const [skus, stocks, locations] = await Promise.all([
      load.skus(),
      load.stocks(),
      load.locations(),
    ]);
    const needle = q.q!.trim().toLowerCase();
    const zoneOf = new Map(locations.map((location) => [location.id, location.zone]));
    let items = skus.map((sku) => summarize(sku, stocks));
    if (needle) {
      items = items.filter(
        (sku) =>
          sku.name.toLowerCase().includes(needle) ||
          sku.code.toLowerCase().includes(needle) ||
          sku.barcode.includes(needle),
      );
    }
    if (q.category) items = items.filter((sku) => sku.category === q.category);
    if (q.status) items = items.filter((sku) => sku.status === q.status);
    if (q.zone) {
      items = items.filter((sku) =>
        stocks.some((stock) => stock.skuId === sku.id && zoneOf.get(stock.locationId) === q.zone),
      );
    }
    const key = q.sort!;
    const sign = q.dir === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const av = key === 'value' ? a.onHand * a.unitCost : a[key];
      const bv = key === 'value' ? b.onHand * b.unitCost : b[key];
      const order =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'ko');
      return order * sign || a.code.localeCompare(b.code);
    });
    const start = (q.page! - 1) * q.size!;
    return {
      items: items.slice(start, start + q.size!),
      total: items.length,
      page: q.page!,
      size: q.size!,
    };
  }

  async function locationOverview(): Promise<LocationOverview[]> {
    const [locations, stocks, skus, counts, lines] = await Promise.all([
      load.locations(),
      load.stocks(),
      load.skus(),
      load.counts(),
      load.lines(),
    ]);
    const summaries = new Map(skus.map((sku) => [sku.id, summarize(sku, stocks)]));
    const active = new Map(
      counts
        .filter((task) => ['open', 'in_progress', 'submitted'].includes(task.status))
        .map((t) => [t.id, t.code]),
    );
    const counting = new Map<string, string>();
    for (const line of lines) {
      const code = active.get(line.taskId);
      if (code) counting.set(line.locationId, code);
    }
    const rank: Record<LocationStatus, number> = { empty: 0, ok: 1, low: 2, out: 3 };
    return locations
      .map((location) => {
        const here = stocks.filter((stock) => stock.locationId === location.id);
        const own = here.filter((stock) => stock.onHand > 0);
        let status: LocationStatus = own.length ? 'ok' : 'empty';
        for (const stock of here) {
          const sku = summaries.get(stock.skuId);
          if (!sku) continue;
          // 다 나가 0이 된 기록은 수량·품목 수에는 넣지 않지만, 부족·품절 경고에는 넣습니다.
          if (stock.onHand <= 0 && sku.status === 'ok') continue;
          if (rank[sku.status] > rank[status]) status = sku.status;
        }
        return {
          location,
          units: own.reduce((sum, stock) => sum + stock.onHand, 0),
          value: own.reduce(
            (sum, stock) => sum + stock.onHand * (summaries.get(stock.skuId)?.unitCost ?? 0),
            0,
          ),
          skuCount: own.length,
          status,
          countingTask: counting.get(location.id) ?? null,
        };
      })
      .sort((a, b) => a.location.code.localeCompare(b.location.code));
  }

  async function locationDetail(id: string): Promise<LocationDetail> {
    await mustGet<Location>('locations', id, '로케이션');
    const overview = (await locationOverview()).find((item) => item.location.id === id)!;
    const [stocks, skus] = await Promise.all([load.stocks(), load.skus()]);
    const items = stocks
      .filter((stock) => stock.locationId === id && stock.onHand > 0)
      .map((stock) => ({
        sku: summarize(
          skus.find((sku) => sku.id === stock.skuId)!,
          stocks,
        ),
        onHand: stock.onHand,
        reserved: stock.reserved,
        version: stock.version,
      }))
      .sort((a, b) => b.onHand - a.onHand);
    return { overview, items };
  }

  async function dashboard(): Promise<DashboardKpis> {
    const [skus, stocks, movements, counts, lines, locations] = await Promise.all([
      load.skus(),
      load.stocks(),
      load.movements(),
      load.counts(),
      load.lines(),
      load.locations(),
    ]);
    const summaries = skus.map((sku) => summarize(sku, stocks));
    const costOf = new Map(skus.map((sku) => [sku.id, sku.unitCost]));
    const zoneOf = new Map(locations.map((location) => [location.id, location.zone]));
    const today = now();
    const flow: DashboardKpis['flow'] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86_400_000);
      const date = day.toISOString().slice(0, 10);
      const ofDay = movements.filter((movement) => movement.at.slice(0, 10) === date);
      flow.push({
        date,
        receipt: ofDay.filter((m) => m.type === 'receipt').reduce((sum, m) => sum + m.qty, 0),
        shipment: ofDay.filter((m) => m.type === 'shipment').reduce((sum, m) => sum + m.qty, 0),
      });
    }
    const zoneValue = ZONES.map(({ code }) => {
      const own = stocks.filter((stock) => zoneOf.get(stock.locationId) === code);
      return {
        zone: code as ZoneCode,
        units: own.reduce((sum, stock) => sum + stock.onHand, 0),
        value: own.reduce((sum, stock) => sum + stock.onHand * (costOf.get(stock.skuId) ?? 0), 0),
      };
    });
    const lastApproved = counts
      .filter((task) => task.status === 'approved')
      .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? ''))[0];
    return {
      skuCount: skus.length,
      totalUnits: summaries.reduce((sum, sku) => sum + sku.onHand, 0),
      inventoryValue: summaries.reduce((sum, sku) => sum + sku.onHand * sku.unitCost, 0),
      lowStock: summaries.filter((sku) => sku.status === 'low').length,
      outOfStock: summaries.filter((sku) => sku.status === 'out').length,
      openCounts: counts.filter((task) => task.status === 'open' || task.status === 'in_progress')
        .length,
      pendingReview: counts.filter((task) => task.status === 'submitted').length,
      accuracy: lastApproved
        ? accuracyRate(lines.filter((line) => line.taskId === lastApproved.id))
        : null,
      flow,
      zoneValue,
    };
  }

  async function createMovement(ctx: Context, request: MovementRequest): Promise<MutationResult> {
    if (!request || !['receipt', 'shipment', 'transfer'].includes(request.type)) {
      throw new HttpError(400, 'VALIDATION', '이동 유형을 선택해 주세요.');
    }
    const sku = await mustGet<Sku>('skus', request.skuId, '품목');
    const qty = positiveInt(request.qty, '수량');
    const reason = text(request.reason, '사유', 100);
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
      ref:
        'ref' in request && request.ref ? text(request.ref, '참조 번호', 40, false) || null : null,
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

  async function createCount(ctx: Context, request: CreateCountRequest): Promise<MutationResult> {
    if (ctx.user.role !== 'manager')
      throw new HttpError(409, 'INVALID_STATE', '실사 작업은 관리자만 만들 수 있습니다.');
    const title = text(request?.title, '작업 이름', 60);
    if (!ZONES.some((zone) => zone.code === request.zone))
      throw new HttpError(400, 'VALIDATION', '구역을 선택해 주세요.');
    const assignee = (await load.users()).find(
      (user) => user.id === request.assigneeId && user.role === 'operator',
    );
    if (!assignee) throw new HttpError(400, 'VALIDATION', '담당 작업자를 선택해 주세요.');
    if (!request.dueAt || Number.isNaN(Date.parse(request.dueAt))) {
      throw new HttpError(400, 'VALIDATION', '마감일을 입력해 주세요.');
    }
    const [locations, stocks, counts, lines] = await Promise.all([
      load.locations(),
      load.stocks(),
      load.counts(),
      load.lines(),
    ]);
    const targetIds = new Set(
      request.locationIds?.length
        ? request.locationIds
        : locations
            .filter((location) => location.zone === request.zone)
            .map((location) => location.id),
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
      blind: Boolean(request.blind),
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
    request: SubmitCountLineRequest,
  ): Promise<MutationResult> {
    const task = await mustGet<CountTask>('counts', taskId, '실사 작업');
    const line = await mustGet<CountLine>('countLines', lineId, '실사 항목');
    if (line.taskId !== taskId)
      throw new HttpError(404, 'NOT_FOUND', '실사 항목을 찾을 수 없습니다.');
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
    const countedQty = positiveInt(request.countedQty, '센 수량', true);
    const note = text(request.note ?? '', '메모', 120, false);
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
    if (ctx.user.role !== 'manager')
      throw new HttpError(409, 'INVALID_STATE', '관리자만 승인할 수 있습니다.');
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
    for (const line of lines.filter((l) => l.taskId === id)) {
      const stock = stocks.find((s) => s.id === line.stockId);
      if (!stock || line.countedQty === null) continue;
      // 센 뒤에 일어난 입출고는 실사 수량 위에 그대로 반영합니다.
      const target = settledOnHand(line.countedQty, netMoved(movements, line, line.countedAt));
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

  // ---------- 진입점 ----------
  async function handle(request: ServerRequest): Promise<ServerResponse> {
    if (maxDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, minDelay + Math.random() * (maxDelay - minDelay)),
      );
    }
    const url = new URL(request.url, 'http://sog.local');
    const method = request.method.toUpperCase();
    const header = (name: string) => {
      const key = Object.keys(request.headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? (request.headers[key] ?? null) : null;
    };
    try {
      await ensureSeed();
      for (const [routeMethod, pattern, handler] of routes) {
        if (routeMethod !== method) continue;
        const params = match(pattern, url.pathname);
        if (!params) continue;
        const users = await load.users();
        const userId = header('x-sog-user') ?? 'u-kim';
        const user = users.find((u) => u.id === userId) ?? users[0]!;
        const rawIfMatch = header('if-match');
        const ifMatch =
          rawIfMatch === null ? null : Number(rawIfMatch.replace(/^W\//, '').replaceAll('"', ''));
        return await handler(
          {
            user,
            ifMatch: ifMatch === null || Number.isNaN(ifMatch) ? null : ifMatch,
            idempotencyKey: header('idempotency-key'),
            query: url.searchParams,
            body: request.body,
          },
          params,
        );
      }
      throw new HttpError(404, 'NOT_FOUND', `${method} ${url.pathname} 경로가 없습니다.`);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.code === 'VERSION_CONFLICT') {
          const userId = header('x-sog-user') ?? 'u-kim';
          void db.write([
            {
              store: 'activity',
              put: row<Activity>({
                id: newId('ac'),
                kind: 'conflict',
                message: `동시 수정 충돌을 막았습니다: ${method} ${url.pathname} (보낸 버전 ${header('if-match')})`,
                at: now().toISOString(),
                by: userId,
                target: null,
              }),
            },
          ]);
        }
        const body: ApiError = { code: error.code, message: error.message };
        if (error.current !== undefined) body.current = error.current;
        return json(error.status, body);
      }
      const body: ApiError = {
        code: 'VALIDATION',
        message: error instanceof Error ? error.message : String(error),
      };
      return json(500, body);
    }
  }

  return {
    origin,
    handle,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reset() {
      await lock(writeSeed);
      emit({
        topics: ['*'],
        by: 'system',
        at: now().toISOString(),
        origin,
        message: '데모 데이터를 초기화했습니다.',
      });
    },
    close() {
      channel?.close();
      db.close();
    },
  };
}

/** 쓰기 목록에 넣을 행. 타입을 확인한 뒤 저장소 공통 형태로 넘깁니다. */
function row<T extends { id: string }>(value: T): { id: string } {
  return value;
}

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.replace(/\/$/, '').split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const part = a[i]!;
    if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(b[i]!);
    else if (part !== b[i]) return null;
  }
  return params;
}
