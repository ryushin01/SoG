import { defineConfig } from 'vitest/config';

// PGlite(WASM Postgres)를 테스트마다 새로 띄웁니다. CI처럼 여러 패키지 테스트가 함께 돌면 준비(beforeEach)가
// 기본 10초를 넘길 수 있어, 준비 시간도 테스트 시간과 같게 둡니다.
export default defineConfig({
  test: { environment: 'node', testTimeout: 30_000, hookTimeout: 30_000 },
});
