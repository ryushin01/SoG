import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { type ApiHandler, createApiHandler } from './api';
import { fromPgPool, type SqlDatabase, type SqlExecutor } from './sql';

/**
 * Cloudflare Worker 진입점. 화면 파일(site/)은 Cloudflare가 바로 내보내고, `/api/*`만 이 Worker가 받습니다
 * (wrangler.jsonc의 `assets.run_worker_first`).
 *
 * Workers에서는 한 요청에서 연 DB 연결을 다른 요청에서 쓸 수 없습니다. 그래서 API 처리기와 업무 서버는
 * 실행 환경(isolate)마다 한 번만 만들고, DB 연결만 요청마다 새로 엽니다. 처리기는 AsyncLocalStorage로
 * 지금 요청의 연결을 찾아 씁니다. 연결은 Hyperdrive가 Neon 가까이에 모아 두므로 새로 열어도 빠르고,
 * 마이그레이션·시드 확인이 요청마다 돌지 않아 쿼리 수(Hyperdrive 무료 한도)도 아낍니다.
 */
export interface Env {
  /** Hyperdrive(Neon 연결 풀). 없으면 /api가 503을 돌려주고 앱은 브라우저 안 데모 서버를 씁니다. */
  HYPERDRIVE?: { connectionString: string };
  /** 로그인 토큰 서명 키(Worker 비밀 값) */
  AUTH_SECRET?: string;
  /** 매일 밤 초기화를 부를 때 쓰는 키(Worker 비밀 값). 예약 작업(scheduled)이 붙여 부릅니다. */
  CRON_SECRET?: string;
  /** 정적 자산(site/) */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** 요청마다 DB를 엽니다. 운영은 Hyperdrive, 테스트는 PGlite입니다. */
export type OpenDatabase = (env: Env & { HYPERDRIVE: { connectionString: string } }) => SqlDatabase;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** 지금 요청의 DB로 이어 주는 DB. 처리기·업무 서버가 붙들고 있어도 실제 연결은 요청마다 바뀝니다. */
function requestScoped(current: AsyncLocalStorage<SqlDatabase>): SqlDatabase {
  const get = (): SqlDatabase => {
    const db = current.getStore();
    if (!db) throw new Error('요청 밖에서 DB를 쓰려고 했습니다.');
    return db;
  };
  return {
    query: <R = Record<string, unknown>>(text: string, params?: unknown[]) =>
      get().query<R>(text, params),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) => get().transaction(work),
    // 요청마다 연 연결은 진입점이 닫습니다.
    close: async () => undefined,
  };
}

/**
 * 응답을 보낸 뒤에도 끝나지 않은 쿼리(가끔 지우는 오래된 변경 기록 등)를 기다렸다가 닫습니다.
 * 그냥 닫으면 아직 줄 서 있던 쿼리가 "끝난 풀" 오류로 버려집니다.
 */
function closeAfterPending(db: SqlDatabase): SqlDatabase {
  const pending = new Set<Promise<unknown>>();
  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    );
    return promise;
  };
  return {
    query: <R = Record<string, unknown>>(text: string, params?: unknown[]) =>
      track(db.query<R>(text, params)),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) => track(db.transaction(work)),
    async close() {
      while (pending.size) await Promise.allSettled([...pending]);
      await db.close();
    },
  };
}

export function createWorker(openDatabase: OpenDatabase) {
  const current = new AsyncLocalStorage<SqlDatabase>();
  const db = requestScoped(current);
  let handler: Promise<ApiHandler> | null = null;

  function getHandler(authSecret: string, cronSecret: string | undefined): Promise<ApiHandler> {
    handler ??= createApiHandler(db, { authSecret, cronSecret }).catch((error: unknown) => {
      handler = null;
      throw error;
    });
    return handler;
  }

  async function handleApi(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    const { HYPERDRIVE: hyperdrive, AUTH_SECRET: authSecret } = env;
    if (!hyperdrive) {
      return json(503, {
        mode: 'local',
        code: 'NETWORK',
        message: '이 배포에는 DB가 연결되어 있지 않습니다.',
      });
    }
    // 상태 확인은 DB에 묻지 않고 답합니다. DB가 잠시 응답하지 않아도 앱이 데모 모드로 바뀌어
    // 가짜 데이터를 실제처럼 보여 주는 일이 없게 하고, 장애는 각 요청의 오류로 드러나게 합니다.
    if (new URL(request.url).pathname === '/api/health') return json(200, { mode: 'remote' });
    if (!authSecret) {
      console.error(
        '[sog] AUTH_SECRET이 없습니다. wrangler secret put AUTH_SECRET으로 넣어 주세요.',
      );
      return json(500, { code: 'VALIDATION', message: '서버 설정(AUTH_SECRET)이 없습니다.' });
    }
    const database = closeAfterPending(openDatabase({ ...env, HYPERDRIVE: hyperdrive }));
    try {
      return await current.run(database, async () =>
        (await getHandler(authSecret, env.CRON_SECRET)).handle(request),
      );
    } catch (error) {
      console.error(error);
      return json(500, { code: 'VALIDATION', message: '서버에서 문제가 생겼습니다.' });
    } finally {
      ctx.waitUntil(database.close().catch((error: unknown) => console.error(error)));
    }
  }

  return {
    fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) return handleApi(request, env, ctx);
      // 현장 실사 앱의 화면 주소(/count/tasks/… 등, 파일이 아닌 주소)는 실사 앱 첫 화면으로 답합니다.
      // 새로 고치거나 링크로 바로 들어와도 실사 앱이 열리게 합니다(wrangler.jsonc의 run_worker_first).
      if (url.pathname.startsWith('/count/')) {
        return env.ASSETS.fetch(new Request(new URL('/count/', url), request));
      }
      return env.ASSETS.fetch(request);
    },

    /** 매일 03:00(KST) 데모 데이터를 처음 상태로 되돌립니다(wrangler.jsonc의 triggers.crons). */
    async scheduled(_controller: unknown, env: Env, ctx: WorkerContext): Promise<void> {
      const response = await handleApi(
        new Request('https://sog.internal/api/cron/reset', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.CRON_SECRET ?? ''}` },
        }),
        env,
        ctx,
      );
      if (!response.ok) {
        throw new Error(`데모 초기화 실패: ${response.status} ${await response.text()}`);
      }
    },
  };
}

/** Hyperdrive 주소로 요청마다 작은 풀을 엽니다(트랜잭션 하나와 다른 쿼리가 함께 돌 수 있게 3개). */
function openHyperdrive(env: { HYPERDRIVE: { connectionString: string } }): SqlDatabase {
  const pool = new pg.Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 3 });
  pool.on('error', (error) => console.error('[sog] DB 연결이 끊겼습니다.', error.message));
  return fromPgPool(pool);
}

export default createWorker(openHyperdrive);
