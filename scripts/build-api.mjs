// 실제 서버(/api) 코드를 Node용 파일 하나로 묶습니다.
// - vercel.mjs: Vercel 함수(node-postgres → Neon)
// - local.mjs: 로컬 미리보기·E2E(PGlite, 메모리 Postgres). PGlite는 wasm 파일을 옆에서 읽으므로 묶지 않습니다.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'packages/wms-api');
const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  // CommonJS 의존성(pg)의 require가 ESM 안에서도 동작하게 합니다.
  banner: {
    js: "import { createRequire as __sogRequire } from 'node:module'; const require = __sogRequire(import.meta.url);",
  },
};

await build({
  ...common,
  entryPoints: [join(pkg, 'src/vercel.ts')],
  outfile: join(pkg, 'dist/vercel.mjs'),
  external: ['pg-native', 'cloudflare:sockets'],
});
await build({
  ...common,
  entryPoints: [join(pkg, 'src/local-server.ts')],
  outfile: join(pkg, 'dist/local.mjs'),
  external: ['@electric-sql/pglite'],
});
console.log('packages/wms-api/dist: vercel.mjs, local.mjs');
