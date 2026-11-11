// Vercel Build Output API(v3) 형식으로 배포물을 만듭니다: 정적 사이트 + /api 함수 + 라우팅.
// 먼저 두 앱(과 Storybook)을 빌드해 두어야 합니다. https://vercel.com/docs/build-output-api/v3
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel/output');
const run = (script) =>
  execFileSync(process.execPath, [join(root, 'scripts', script)], { stdio: 'inherit' });

run('assemble-site.mjs');
run('build-api.mjs');

rmSync(out, { recursive: true, force: true });
cpSync(join(root, 'site'), join(out, 'static'), { recursive: true });

const fn = join(out, 'functions/api.func');
mkdirSync(fn, { recursive: true });
cpSync(join(root, 'packages/wms-api/dist/vercel.mjs'), join(fn, 'index.mjs'));
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      // DB(Neon)를 둔 싱가포르에서 실행해 쿼리 왕복을 줄입니다.
      regions: ['sin1'],
      maxDuration: 15,
    },
    null,
    2,
  ),
);

const config = {
  version: 3,
  routes: [
    { src: '^/count$', status: 308, headers: { Location: '/count/' } },
    // 폴더 주소를 rewrite하면 상대 경로 파일을 못 찾으므로 index.html로 보냅니다.
    {
      src: '^/storybook/(backoffice|count)/?$',
      status: 307,
      headers: { Location: '/storybook/$1/index.html' },
    },
    {
      src: '^/count/(ngsw-worker\\.js|ngsw\\.json|safety-worker\\.js)$',
      headers: { 'Cache-Control': 'no-cache' },
      continue: true,
    },
    {
      src: '^/(?:count/)?(?:chunk|main|polyfills|styles)-[^/]+\\.(?:js|css)$',
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      continue: true,
    },
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    { src: '^/count/.*$', dest: '/count/index.html' },
    { src: '^/.*$', dest: '/index.html' },
  ],
};
writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log('.vercel/output 준비 완료: static/, functions/api.func, config.json');
