import { PGlite } from '@electric-sql/pglite';
import { issueToken } from '@sog/wms-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker, type Env, type WorkerContext } from './cloudflare';
import { fromPglite, type SqlDatabase, type SqlExecutor } from './sql';

const SECRET = 'test-secret-test-secret-test-secret';

let pglite: PGlite;
/** 요청마다 연 DB에서 일어난 일: `<요청 번호>:<쿼리 앞부분>` 또는 `<요청 번호>:close` */
let log: string[];
let opened: number;
let worker: ReturnType<typeof createWorker>;
let waits: Promise<unknown>[];
const ctx: WorkerContext = { waitUntil: (promise) => void waits.push(promise) };

/** 같은 PGlite를 요청마다 새 연결처럼 열어, 무슨 쿼리가 어느 요청에서 돌았는지 남깁니다. */
function openDatabase(): SqlDatabase {
  const id = ++opened;
  const db = fromPglite(pglite);
  const record = (text: string) => log.push(`${id}:${text.trim().toLowerCase().slice(0, 40)}`);
  return {
    query<R = Record<string, unknown>>(text: string, params?: unknown[]) {
      record(text);
      return db.query<R>(text, params);
    },
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>) {
      return db.transaction(work);
    },
    async close() {
      log.push(`${id}:close`);
    },
  };
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    HYPERDRIVE: { connectionString: 'postgres://hyperdrive.test/neondb' },
    AUTH_SECRET: SECRET,
    CRON_SECRET: 'cron-test',
    ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
    ...overrides,
  };
}

async function get(path: string, environment = env()): Promise<Response> {
  const { token } = await issueToken(SECRET, 'u-kim', Math.floor(Date.now() / 1000));
  const response = await worker.fetch(
    new Request(`https://sog.test${path}`, { headers: { authorization: `Bearer ${token}` } }),
    environment,
    ctx,
  );
  await Promise.all(waits);
  return response;
}

beforeEach(async () => {
  pglite = await PGlite.create();
  log = [];
  opened = 0;
  waits = [];
  worker = createWorker(openDatabase);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await pglite.close();
});

describe('Cloudflare Worker 진입점', () => {
  it('상태 확인은 DB를 열지 않고 실제 서버 모드라고 답한다', async () => {
    const response = await get('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: 'remote' });
    expect(opened).toBe(0);
  });

  it('Hyperdrive가 없으면 503으로 앱이 브라우저 안 데모 서버를 쓰게 한다', async () => {
    const response = await get('/api/skus', env({ HYPERDRIVE: undefined }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ mode: 'local' });
  });

  it('AUTH_SECRET이 없으면 500으로 설정이 빠졌음을 알린다', async () => {
    const response = await get('/api/skus', env({ AUTH_SECRET: undefined }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ message: '서버 설정(AUTH_SECRET)이 없습니다.' });
  });

  it('마이그레이션은 한 번만 돌고, 연결은 요청마다 열고 닫는다', async () => {
    expect((await get('/api/skus?size=1')).status).toBe(200);
    expect((await get('/api/skus?size=1')).status).toBe(200);

    const migrations = (id: number) =>
      log.filter((entry) => entry.startsWith(`${id}:create table`)).length;
    expect(migrations(1)).toBeGreaterThan(0);
    expect(migrations(2)).toBe(0);
    expect(log).toContain('1:close');
    expect(log).toContain('2:close');
    // 두 번째 요청의 쿼리는 두 번째 연결에서 돕니다.
    expect(log.some((entry) => entry.startsWith('2:') && entry !== '2:close')).toBe(true);
  });

  it('응답 뒤에 남은 쿼리(오래된 변경 기록 지우기)가 끝난 다음에 연결을 닫는다', async () => {
    await get('/api/skus?size=1');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect((await get('/api/changes?after=0')).status).toBe(200);

    const cleanup = log.findIndex((entry) => entry.startsWith('2:delete from events'));
    expect(cleanup).toBeGreaterThan(-1);
    expect(log.indexOf('2:close')).toBeGreaterThan(cleanup);
  });

  it('API가 아닌 주소는 정적 자산으로 넘긴다', async () => {
    const environment = env();
    const response = await worker.fetch(new Request('https://sog.test/count/'), environment, ctx);
    expect(await response.text()).toBe('asset');
    expect(environment.ASSETS.fetch).toHaveBeenCalledOnce();
    expect(opened).toBe(0);
  });

  it('예약 작업은 CRON_SECRET으로 데모 데이터를 처음 상태로 되돌린다', async () => {
    await expect(worker.scheduled(undefined, env(), ctx)).resolves.toBeUndefined();
    await Promise.all(waits);
    expect(log.some((entry) => entry.startsWith('1:') && entry !== '1:close')).toBe(true);
  });

  it('CRON_SECRET이 없으면 예약 작업이 실패를 알린다', async () => {
    await expect(worker.scheduled(undefined, env({ CRON_SECRET: undefined }), ctx)).rejects.toThrow(
      '데모 초기화 실패: 401',
    );
    await Promise.all(waits);
  });
});
