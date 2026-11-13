import type { IncomingMessage, ServerResponse } from 'node:http';
import pg from 'pg';
import { type ApiHandler, createApiHandler } from './api';
import { sendResponse, toRequest } from './node-adapter';
import { fromPgPool } from './sql';

/**
 * Vercel 함수 진입점. DATABASE_URL(Neon 연동이 운영 환경에 넣음)이 있으면 실제 서버로 동작하고,
 * 없으면(미리보기 배포) 503을 돌려줘 앱이 브라우저 안 데모 서버를 쓰게 합니다.
 */
let handler: Promise<ApiHandler> | null = null;

/** Neon 주소의 sslmode=require를 지금과 같은 뜻(인증서 검증)인 verify-full로 바꿔 pg의 경고를 없앱니다. */
function strictSsl(url: string): string {
  return url.replace(/([?&]sslmode=)(require|prefer|verify-ca)\b/, '$1verify-full');
}

function createPool(url: string): pg.Pool {
  const pool = new pg.Pool({ connectionString: strictSsl(url), max: 3, idleTimeoutMillis: 10_000 });
  // 쉬던 연결이 끊기면 풀이 'error'를 냅니다. 듣지 않으면 함수 프로세스가 죽어 처리 중인 요청까지 끊깁니다.
  // 끊긴 연결은 풀이 버리고 다음 요청에서 새로 맺으므로 기록만 남깁니다.
  pool.on('error', (error) => console.error('[sog] 쉬던 DB 연결이 끊겼습니다.', error.message));
  return pool;
}

function getHandler(url: string, authSecret: string): Promise<ApiHandler> {
  handler ??= createApiHandler(fromPgPool(createPool(url)), {
    authSecret,
    cronSecret: process.env['CRON_SECRET'],
  }).catch((error: unknown) => {
    handler = null;
    throw error;
  });
  return handler;
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        mode: 'local',
        code: 'NETWORK',
        message: '이 배포에는 DB가 연결되어 있지 않습니다.',
      }),
    );
    return;
  }
  // 라우팅이 원래 경로를 __path로 넘깁니다.
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  const original = new URL(req.url ?? '/', `https://${host}`);
  const path = original.searchParams.get('__path');
  if (path !== null) {
    original.searchParams.delete('__path');
    req.url = `/api/${path}${original.search}`;
  }
  // 상태 확인은 DB에 묻지 않고 답합니다. DB가 잠시 응답하지 않아도 앱이 데모 모드로 바뀌어
  // 가짜 데이터를 실제처럼 보여 주는 일이 없게 하고, 장애는 각 요청의 오류로 드러나게 합니다.
  if (req.url?.split('?')[0] === '/api/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ mode: 'remote' }));
    return;
  }
  // 서명 키가 없으면 데모용 고정 키로 대신하지 않고 멈춥니다(누구나 토큰을 만들 수 있게 되므로).
  const authSecret = process.env['AUTH_SECRET'];
  if (!authSecret || authSecret.length < 32) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 'VALIDATION', message: '서버 설정(AUTH_SECRET)이 없습니다.' }));
    return;
  }
  try {
    const api = await getHandler(url, authSecret);
    await sendResponse(res, await api.handle(await toRequest(req, `https://${host}`)));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 'VALIDATION', message: '서버에서 문제가 생겼습니다.' }));
  }
}
