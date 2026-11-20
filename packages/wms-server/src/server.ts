/**
 * 브라우저 안에서 도는 WMS 데모 서버. 실제 서버(Postgres)도 저장 계층만 바꿔 같은 코드를 씁니다.
 * 실제 백엔드와 같은 HTTP 의미(상태 코드, ETag/If-Match, Idempotency-Key)를 지켜서, 앱은 HttpClient로만 통신합니다.
 *
 * 구성: 이 파일은 저장소·잠금·시드를 준비하고 요청을 라우트로 나눕니다(로그인·권한·오류 응답).
 * - core/: 공통 타입·HTTP 도우미, 공통 범위(scope), 조회 모델(views), 쓰기 공통 처리(mutate), 변경 이력
 * - routes/: 시스템(기준 정보·로그인·운영 현황·도면·활동 기록·초기화), 품목·입출고, 재고 실사, 출고 지시
 */
import type {
  Activity,
  ApiError,
  ChangeEvent,
  CountLine,
  CountTask,
  Location,
  Movement,
  ShipmentOrder,
  Sku,
  StockLevel,
  User,
} from '@sog/domain';
import { LOCAL_AUTH_SECRET, verifyToken } from './auth';
import { blockedHistory } from './core/history';
import { json, match, row } from './core/http';
import { createMutate } from './core/mutate';
import { createScope, type Loaders } from './core/scope';
import {
  HttpError,
  RETENTION_DAYS,
  type PruneResult,
  type ServerRequest,
  type ServerResponse,
  type WmsServer,
  type WmsServerOptions,
} from './core/types';
import { createViews } from './core/views';
import { Database, STORES, type WriteOp } from './idb';
import { createLock, type Lock } from './lock';
import { createRoutes, MANAGER_ROUTES, PUBLIC_ROUTES } from './routes';
import { createSeed } from './seed';
import { broadcastPublisher, type Storage } from './storage';

export type {
  PruneResult,
  ServerRequest,
  ServerResponse,
  WmsServer,
  WmsServerOptions,
} from './core/types';
export { HttpError, RETENTION_DAYS } from './core/types';

const SEED_KEY = 'seed';
/** 시드 구성이 바뀌면 올립니다. 데모 모드는 저장된 시드 버전이 다르면 처음 상태로 다시 채웁니다. */
const SEED_VERSION = 4;

/** 사용자 목록을 기억하는 시간 */
const USERS_CACHE_MS = 60_000;

export async function createWmsServer(options: WmsServerOptions = {}): Promise<WmsServer> {
  const dbName = options.dbName ?? 'sog-wms';
  const now = options.now ?? (() => new Date());
  const [minDelay, maxDelay] = options.latency ?? [0, 0];
  const origin = Math.random().toString(36).slice(2, 10);
  const lock: Lock = options.lock ?? createLock(`${dbName}:write`);
  const db: Storage = options.storage ?? (await Database.open(dbName));
  const authSecret = options.authSecret ?? LOCAL_AUTH_SECRET;
  const nowSeconds = () => Math.floor(now().getTime() / 1000);
  const publisher =
    options.publisher ?? broadcastPublisher(options.channelName ?? `${dbName}:changes`);

  let seq = 0;
  const newId = (prefix: string) =>
    `${prefix}-${now().getTime().toString(36)}${(seq++).toString(36)}${origin.slice(0, 3)}`;

  const reseedOnVersionChange = options.reseedOnVersionChange ?? !options.storage;
  /**
   * 실제 서버는 시드가 있는 것을 한 번 확인하면 이 실행 환경에서는 다시 묻지 않습니다(요청마다 쿼리 하나를 아낌).
   * 시드는 지우지 않고 덮어쓰기만 하므로(초기화도 다시 채움) 한 번 있으면 계속 있습니다.
   * 브라우저 데모는 다른 탭이 새 시드 버전으로 바꿀 수 있어 매번 확인합니다(IndexedDB라 빠름).
   */
  let seedKnown = false;

  async function ensureSeed(): Promise<void> {
    if (seedKnown) return;
    const seeded = async () => {
      const meta = await db.get<{ version?: number }>('meta', SEED_KEY);
      return reseedOnVersionChange
        ? meta?.version === SEED_VERSION
        : meta !== undefined && meta !== null;
    };
    if (!(await seeded())) {
      await lock(async () => {
        // 다른 탭이 잠금을 먼저 잡고 시드를 넣었을 수 있습니다.
        if (await seeded()) return;
        await writeSeed();
      });
    }
    if (!reseedOnVersionChange) seedKnown = true;
  }

  async function writeSeed(): Promise<void> {
    const seed = createSeed(now());
    const ops: WriteOp[] = STORES.map((store) => ({ store, clear: true as const }));
    for (const [store, rows] of Object.entries(seed) as [keyof typeof seed, { id: string }[]][]) {
      for (const row of rows) ops.push({ store, put: row });
    }
    ops.push({
      store: 'meta',
      put: { id: SEED_KEY, version: SEED_VERSION, at: now().toISOString() } as { id: string },
    });
    await db.write(ops);
    usersCache = null;
  }

  /**
   * 사용자 목록은 시드로만 바뀌므로 잠깐 기억합니다. 모든 요청이 로그인한 사용자를 찾으려고 읽어서,
   * 실제 서버의 쿼리 수(Hyperdrive 무료 한도)를 요청마다 하나씩 아낍니다.
   */
  let usersCache: { at: number; users: Promise<User[]> } | null = null;
  function cachedUsers(): Promise<User[]> {
    const at = Date.now();
    if (!usersCache || at - usersCache.at > USERS_CACHE_MS) {
      const users = db.all<User>('users');
      usersCache = { at, users };
      // 읽기에 실패하면 기억하지 않고 다음 요청에서 다시 읽습니다.
      users.catch(() => {
        if (usersCache?.users === users) usersCache = null;
      });
    }
    return usersCache.users;
  }

  await ensureSeed();

  // ---------- 읽기 도우미 ----------
  const load: Loaders = {
    users: cachedUsers,
    locations: () => db.all<Location>('locations'),
    skus: () => db.all<Sku>('skus'),
    stocks: () => db.all<StockLevel>('stocks'),
    movements: () => db.all<Movement>('movements'),
    counts: () => db.all<CountTask>('counts'),
    lines: () => db.all<CountLine>('countLines'),
    orders: () => db.all<ShipmentOrder>('orders'),
  };

  function emit(event: ChangeEvent): void | Promise<void> {
    return publisher.publish(event);
  }

  const scope = createScope({
    db,
    lock,
    load,
    now,
    nowSeconds,
    newId,
    origin,
    authSecret,
    emit,
    writeSeed,
  });
  const views = createViews(scope);
  const mutate = createMutate(scope);
  const routes = createRoutes(scope, views, mutate);

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
    let caller: User | null = null;
    try {
      await ensureSeed();
      for (const [routeMethod, pattern, handler] of routes) {
        if (routeMethod !== method) continue;
        const params = match(pattern, url.pathname);
        if (!params) continue;
        const users = await load.users();
        const key = `${method} ${pattern}`;
        if (!PUBLIC_ROUTES.has(key)) {
          // Authorization: Bearer <토큰>. 서명·만료를 확인해 사용자를 정합니다.
          const raw = header('authorization');
          const token = raw?.startsWith('Bearer ') ? raw.slice(7).trim() : null;
          const userId = token ? await verifyToken(authSecret, token, nowSeconds()) : null;
          caller = users.find((u) => u.id === userId) ?? null;
          if (!caller)
            throw new HttpError(
              401,
              'UNAUTHENTICATED',
              '로그인이 필요합니다. 다시 로그인해 주세요.',
            );
          if (MANAGER_ROUTES.has(key) && caller.role !== 'manager') {
            throw new HttpError(403, 'FORBIDDEN', '관리자만 할 수 있습니다.');
          }
        }
        const rawIfMatch = header('if-match');
        const ifMatch =
          rawIfMatch === null ? null : Number(rawIfMatch.replace(/^W\//, '').replaceAll('"', ''));
        return await handler(
          {
            user: caller ?? users[0]!,
            origin: header('x-sog-origin') ?? origin,
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
        if (error.code === 'VERSION_CONFLICT' && caller) {
          const at = now().toISOString();
          const ops: WriteOp[] = [
            {
              store: 'activity',
              put: row<Activity>({
                id: newId('ac'),
                kind: 'conflict',
                message: `${caller.name}님의 저장을 동시 수정 충돌로 막았습니다: ${method} ${url.pathname} (보낸 버전 ${header('if-match')})`,
                at,
                by: caller.id,
                target: null,
              }),
            },
          ];
          const blocked = blockedHistory(
            newId,
            url.pathname,
            request.body,
            error.current,
            header('if-match'),
            caller,
            at,
          );
          if (blocked) ops.push({ store: 'history', put: blocked });
          void db.write(ops).catch(() => undefined);
        }
        const body: ApiError = { code: error.code, message: error.message };
        if (error.current !== undefined) body.current = error.current;
        return json(error.status, body);
      }
      // DB 오류 같은 내부 문구는 응답에 싣지 않고 서버 로그(운영은 Workers 로그)에만 남깁니다.
      console.error(`[sog] 처리하지 못한 오류: ${method} ${url.pathname}`, error);
      const body: ApiError = {
        code: 'INTERNAL',
        message: '서버에서 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.',
      };
      return json(500, body);
    }
  }

  return {
    origin,
    handle,
    subscribe(listener) {
      return publisher.subscribe(listener);
    },
    async reset() {
      await lock(async () => {
        await writeSeed();
      });
      await emit({
        topics: ['*'],
        by: 'system',
        at: now().toISOString(),
        origin,
        message: '데모 데이터를 초기화했습니다.',
      });
    },
    async prune() {
      // 오래된 기록만 지우므로 쓰기 잠금이나 변경 알림이 필요 없습니다(열린 화면의 최근 기록은 그대로).
      const cutoff = (days: number) => new Date(now().getTime() - days * 86_400_000).toISOString();
      const result = {} as PruneResult;
      for (const [store, days] of Object.entries(RETENTION_DAYS) as [keyof PruneResult, number][]) {
        result[store] = await db.deleteOlderThan(store, cutoff(days));
      }
      return result;
    },
    close() {
      publisher.close();
      db.close();
    },
  };
}
