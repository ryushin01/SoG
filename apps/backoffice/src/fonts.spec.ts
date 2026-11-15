/// <reference types="node" />
import { execFileSync } from 'node:child_process';

describe('한글 웹 폰트', () => {
  it('화면 글자 파일에 소스의 한글·기호가 모두 들어 있다 (빠졌으면 pnpm fonts)', () => {
    // ng test는 앱 폴더에서 돌기 때문에 저장소 루트의 스크립트를 부름
    const output = execFileSync(
      'node',
      ['../../scripts/build-fonts.mjs', '--config', 'apps/backoffice/fonts.config.json', '--check'],
      {
        encoding: 'utf8',
      },
    );
    expect(output).toContain('OK');
  });
});
