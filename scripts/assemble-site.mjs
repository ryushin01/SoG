// 두 앱의 프로덕션 빌드를 배포 구조 하나로 합칩니다: 백오피스는 /, 현장 실사 앱은 /count/.
// 같은 출처라야 두 앱이 브라우저 안 데모 서버(IndexedDB)와 변경 알림(BroadcastChannel)을 함께 씁니다.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site');
const backoffice = join(root, 'apps/backoffice/dist/browser');
const count = join(root, 'apps/count/dist/browser');

for (const dir of [backoffice, count]) {
  if (!existsSync(dir)) {
    console.error(`빌드 결과가 없습니다: ${dir}\n먼저 pnpm build를 실행해 주세요.`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
cpSync(backoffice, out, { recursive: true });
cpSync(count, join(out, 'count'), { recursive: true });

// Storybook을 빌드해 두었으면 함께 올립니다: /storybook/backoffice/, /storybook/count/
for (const app of ['backoffice', 'count']) {
  const storybook = join(root, `apps/${app}/storybook-static`);
  if (existsSync(storybook)) cpSync(storybook, join(out, 'storybook', app), { recursive: true });
}
console.log(`site/ 준비 완료: / (백오피스), /count/ (현장 실사 앱)`);
