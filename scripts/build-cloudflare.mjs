// Cloudflare Workers 정적 자산(site/)을 만듭니다: 두 앱(과 Storybook)을 합치고, 라우팅·캐시 규칙을 넣습니다.
// 먼저 두 앱(과 Storybook)을 빌드해 두어야 합니다. /api는 wrangler가 packages/wms-api/src/cloudflare.ts를 묶어 올립니다.
// https://developers.cloudflare.com/workers/static-assets/
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
execFileSync(process.execPath, [join(root, 'scripts/assemble-site.mjs')], { stdio: 'inherit' });

const redirects = [
  '/count /count/ 308',
  // 폴더 주소로 열면 상대 경로 파일을 못 찾으므로 index.html로 보냅니다.
  '/storybook/backoffice /storybook/backoffice/index.html 307',
  '/storybook/backoffice/ /storybook/backoffice/index.html 307',
  '/storybook/count /storybook/count/index.html 307',
  '/storybook/count/ /storybook/count/index.html 307',
];
writeFileSync(join(site, '_redirects'), `${redirects.join('\n')}\n`);

const immutable = ['chunk', 'main', 'polyfills', 'styles'].flatMap((name) => [
  `/${name}-*`,
  `/count/${name}-*`,
]);
const headers = [
  // 서비스 워커와 그 목록은 늘 새로 받아야 새 버전을 알아챕니다.
  ...['ngsw-worker.js', 'ngsw.json', 'safety-worker.js'].flatMap((file) => [
    `/count/${file}`,
    '  Cache-Control: no-cache',
  ]),
  // 이름에 해시가 붙은 빌드 파일은 내용이 바뀌면 이름도 바뀝니다.
  ...immutable.flatMap((pattern) => [
    pattern,
    '  Cache-Control: public, max-age=31536000, immutable',
  ]),
];
writeFileSync(join(site, '_headers'), `${headers.join('\n')}\n`);
console.log('site/ 준비 완료: _redirects, _headers');
