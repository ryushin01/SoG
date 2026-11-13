import type { ChangeEvent } from '@sog/domain';
import { createWmsServer, verifyToken, type WmsServer } from '@sog/wms-server';
import { createPgBackend } from './pg-backend';
import type { SqlDatabase } from './sql';

const PRESENCE_TTL_SECONDS = 15;
const MAX_BODY_BYTES = 64 * 1024;

export interface ApiHandler {
  handle(request: Request): Promise<Response>;
  close(): Promise<void>;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

/**
 * 실제 서버의 /api. 업무 API는 브라우저 데모 서버와 같은 코드(@sog/wms-server)를 Postgres 위에서 돌리고,
 * 기기 사이의 실시간 반영을 위해 변경 피드(/api/changes)와 접속 표시(/api/presence)를 더합니다.
 */
export interface ApiOptions {
  now?: () => Date;
  /** 로그인 토큰 서명 키(운영은 AUTH_SECRET) */
  authSecret: string;
  /** 매일 밤 초기화(Cloudflare Cron Trigger)를 부를 때 쓰는 키(CRON_SECRET). 없으면 /api/cron/reset을 막습니다. */
  cronSecret?: string;
}

export async function createApiHandler(db: SqlDatabase, options: ApiOptions): Promise<ApiHandler> {
  const backend = createPgBackend(db);
  await backend.migrate();
  let server: WmsServer | null = null;
  const getServer = async () =>
    (server ??= await createWmsServer({
      storage: backend.storage,
      lock: backend.lock,
      publisher: backend.publisher,
      now: options.now,
      authSecret: options.authSecret,
    }));

  /** 변경 피드·접속 표시도 로그인한 사용자만 씁니다. 토큰의 사용자 ID를 돌려줍니다. */
  async function authenticate(request: Request): Promise<string | null> {
    const raw = request.headers.get('authorization');
    const token = raw?.startsWith('Bearer ') ? raw.slice(7).trim() : null;
    if (!token) return null;
    const now = Math.floor((options.now?.() ?? new Date()).getTime() / 1000);
    return verifyToken(options.authSecret, token, now);
  }

  async function readBody(request: Request): Promise<unknown> {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'DELETE')
      return undefined;
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new RangeError('요청 본문이 너무 큽니다.');
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  }

  async function changes(url: URL): Promise<Response> {
    const after = url.searchParams.get('after');
    if (after === null || !/^\d+$/.test(after)) {
      // 처음 연결: 지금까지의 마지막 순번만 알려 주고, 그 뒤부터 이어 받게 합니다.
      const { rows } = await db.query<{ seq: string | null }>(
        'select max(seq)::text as seq from events',
      );
      return json(200, { cursor: rows[0]?.seq ?? '0', items: [] });
    }
    const { rows } = await db.query<{
      seq: string;
      at: Date | string;
      origin: string;
      by_user: string;
      topics: string[];
      message: string;
    }>(
      'select seq::text as seq, at, origin, by_user, topics, message from events where seq > $1 order by seq limit 100',
      [after],
    );
    const items: (ChangeEvent & { seq: string })[] = rows.map((row) => ({
      seq: row.seq,
      at: new Date(row.at).toISOString(),
      origin: row.origin,
      by: row.by_user,
      topics: row.topics,
      message: row.message,
    }));
    // 가끔 하루 지난 변경 기록을 지웁니다.
    if (Math.random() < 0.02)
      void db
        .query("delete from events where at < now() - interval '1 day'")
        .catch(() => undefined);
    return json(200, { cursor: items.at(-1)?.seq ?? after, items });
  }

  async function presence(request: Request, url: URL, userId: string): Promise<Response> {
    const tabId = url.pathname.split('/')[3];
    if (request.method === 'GET') {
      const { rows } = await db.query<{ data: Record<string, unknown> }>(
        `select data from presence where seen_at > now() - interval '${PRESENCE_TTL_SECONDS} seconds'`,
      );
      if (Math.random() < 0.05)
        void db
          .query("delete from presence where seen_at < now() - interval '1 minute'")
          .catch(() => undefined);
      return json(200, { items: rows.map((row) => row.data) });
    }
    if (request.method === 'DELETE' && tabId) {
      await db.query('delete from presence where tab_id = $1', [decodeURIComponent(tabId)]);
      return json(204, null);
    }
    if (request.method === 'POST') {
      const body = (await readBody(request)) as Record<string, unknown> | undefined;
      const peer = {
        tabId: text(body?.['tabId'], 40),
        // 사용자는 본문이 아니라 토큰으로 정합니다(다른 사람인 척 접속 표시를 남기지 못하게).
        userId,
        app: text(body?.['app'], 20) ?? '',
        resource: text(body?.['resource'], 120),
        editing: body?.['editing'] === true,
        detail: (text(body?.['detail'], 200) ?? '').slice(0, 120),
      };
      if (!peer.tabId || !peer.resource) {
        return json(400, { code: 'VALIDATION', message: '접속 정보가 올바르지 않습니다.' });
      }
      await db.query(
        `insert into presence (tab_id, data, seen_at) values ($1, $2::jsonb, now())
         on conflict (tab_id) do update set data = excluded.data, seen_at = now()`,
        [peer.tabId, JSON.stringify(peer)],
      );
      return json(204, null);
    }
    return json(405, { code: 'VALIDATION', message: '지원하지 않는 요청입니다.' });
  }

  return {
    async handle(request) {
      const url = new URL(request.url);
      try {
        if (url.pathname === '/api/health') return json(200, { mode: 'remote' });
        if (url.pathname === '/api/cron/reset') {
          // 예약 작업(Worker의 scheduled)이 Authorization: Bearer <CRON_SECRET>을 붙여 부릅니다.
          if (
            !options.cronSecret ||
            request.headers.get('authorization') !== `Bearer ${options.cronSecret}`
          ) {
            return json(401, { code: 'UNAUTHENTICATED', message: '예약 작업만 부를 수 있습니다.' });
          }
          await (await getServer()).reset();
          return json(200, { reset: true });
        }
        if (url.pathname === '/api/changes' || url.pathname.startsWith('/api/presence')) {
          const userId = await authenticate(request);
          if (!userId)
            return json(401, { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' });
          if (url.pathname === '/api/changes') return await changes(url);
          return await presence(request, url, userId);
        }
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => (headers[key] = value));
        const result = await (
          await getServer()
        ).handle({
          method: request.method,
          url: url.pathname + url.search,
          headers,
          body: await readBody(request),
        });
        return json(result.status, result.body, result.headers);
      } catch (error) {
        const message =
          error instanceof SyntaxError
            ? '요청 본문이 JSON이 아닙니다.'
            : error instanceof RangeError
              ? error.message
              : '서버에서 문제가 생겼습니다.';
        if (!(error instanceof SyntaxError) && !(error instanceof RangeError)) console.error(error);
        return json(error instanceof SyntaxError || error instanceof RangeError ? 400 : 500, {
          code: 'VALIDATION',
          message,
        });
      }
    },
    close: () => db.close(),
  };
}
