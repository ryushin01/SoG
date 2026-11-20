import { defineConfig } from 'vitest/config';

// 시드가 품목 120개라, 품목을 차례로 훑는 테스트는 다른 패키지 테스트와 함께 돌면 기본 5초를 넘길 수 있습니다.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
