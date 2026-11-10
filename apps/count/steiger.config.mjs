import fsd from '@feature-sliced/steiger-plugin';
import { defineConfig } from 'steiger';

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // 한 곳에서만 쓰는 슬라이스 경고. 화면이 더 늘어날 기능 단위로 나눠 둔 것이라 끕니다.
    rules: { 'fsd/insignificant-slice': 'off' },
  },
]);
