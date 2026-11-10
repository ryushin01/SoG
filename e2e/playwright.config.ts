import { defineConfig, devices } from '@playwright/test';

/**
 * 프로덕션 빌드(site/)를 배포와 같은 구조로 띄우고 검사합니다.
 * E2E_BASE_URL을 주면 로컬 서버 없이 배포된 사이트를 검사합니다.
 */
const liveUrl = process.env['E2E_BASE_URL'];

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: liveUrl ?? 'http://localhost:4300',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: liveUrl
    ? undefined
    : {
        command: 'node ../scripts/serve-site.mjs',
        url: 'http://localhost:4300',
        reuseExistingServer: !process.env['CI'],
      },
});
