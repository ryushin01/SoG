/// <reference types="node" />
import { execFileSync } from 'node:child_process';

describe('한글 웹 폰트', () => {
  // 글꼴 파일을 읽어 글자표를 비교해 몇 초 걸립니다. 다른 테스트와 함께 돌면 기본 5초를 넘길 수 있습니다.
  it(
    '화면 글자 파일에 소스의 한글·기호가 모두 들어 있다 (빠졌으면 pnpm fonts)',
    { timeout: 30_000 },
    () => {
      // ng test는 앱 폴더에서 돌기 때문에 저장소 루트의 스크립트를 부름
      const output = execFileSync(
        'node',
        ['../../scripts/build-fonts.mjs', '--config', 'apps/count/fonts.config.json', '--check'],
        {
          encoding: 'utf8',
        },
      );
      expect(output).toContain('OK');
    },
  );
});
