// site/를 배포 환경(Vercel)과 같은 규칙으로 띄웁니다. 파일이 없으면 각 앱의 index.html로 보냅니다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const port = Number(process.env.PORT ?? 4300);
// --api: 실제 서버 모드. /api를 PGlite(메모리 Postgres) 위의 서버가 받습니다(먼저 node scripts/build-api.mjs).
const withApi = process.argv.includes('--api');
const api = withApi ? await import('../packages/wms-api/dist/local.mjs') : null;
const handler = api ? await api.createLocalApi() : null;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (!handler) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"code":"NOT_FOUND","message":"데모 모드에는 /api가 없습니다."}');
      return;
    }
    await api.sendResponse(
      response,
      await handler.handle(await api.toRequest(request, `http://localhost:${port}`)),
    );
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path === '/count') {
    response.writeHead(308, { Location: '/count/' });
    response.end();
    return;
  }
  let file = join(root, path);
  if (!file.startsWith(root)) {
    response.writeHead(400);
    response.end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const index = join(file, 'index.html');
    file = existsSync(index)
      ? index
      : join(root, path.startsWith('/count/') ? 'count/index.html' : 'index.html');
  }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' };
  // 서비스 워커와 문서는 늘 새로 받아야 업데이트가 퍼집니다.
  if (/ngsw|index\.html$/.test(file)) headers['Cache-Control'] = 'no-cache';
  response.writeHead(200, headers);
  createReadStream(file).pipe(response);
}).listen(port, () =>
  console.log(
    `http://localhost:${port} (백오피스) · http://localhost:${port}/count/ (현장 실사 앱) · ${withApi ? '실제 서버 모드(PGlite)' : '데모 모드'}`,
  ),
);
