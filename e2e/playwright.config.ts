import { defineConfig, devices } from '@playwright/test';

/**
 * 프로덕션 빌드(site/)를 배포와 같은 구조로 띄우고 검사합니다.
 * - desktop, mobile: 브라우저 안 데모 서버 모드(4300)
 * - remote: 실제 서버 모드(4310). /api를 PGlite(메모리 Postgres) 위의 서버가 받습니다.
 * E2E_BASE_URL을 주면 로컬 서버 없이 배포된 사이트를 검사합니다(배포된 운영 사이트는 실제 서버 모드).
 */
const liveUrl = process.env['E2E_BASE_URL'];
// README 촬영처럼 다른 포트가 필요하면 E2E_SITE_PORT·E2E_API_PORT로 바꿉니다.
const SITE_PORT = process.env['E2E_SITE_PORT'] ?? '4300';
const API_PORT = process.env['E2E_API_PORT'] ?? '4310';
const LOCAL = `http://localhost:${SITE_PORT}`;
const REMOTE = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 8_000 },
  use: {
    baseURL: liveUrl ?? LOCAL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: liveUrl
    ? [
        {
          name: 'live',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
        },
      ]
    : [
        // README 화면 촬영(pnpm screenshots). 화면 파일을 덮어쓰므로 SCREENSHOTS=1일 때만 넣습니다.
        ...(process.env['SCREENSHOTS'] === '1'
          ? [
              {
                name: 'screenshots',
                testMatch: /readme\.screenshots\.ts/,
                use: { ...devices['Desktop Chrome'] },
              },
            ]
          : []),
        {
          name: 'desktop',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
        },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
        {
          name: 'remote',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1366, height: 900 },
            baseURL: REMOTE,
          },
        },
      ],
  webServer: liveUrl
    ? undefined
    : [
        {
          command: 'node ../scripts/serve-site.mjs',
          url: LOCAL,
          env: { PORT: SITE_PORT },
          reuseExistingServer: !process.env['CI'],
        },
        {
          command: 'node ../scripts/serve-site.mjs --api',
          url: `${REMOTE}/api/health`,
          env: { PORT: API_PORT },
          reuseExistingServer: !process.env['CI'],
        },
      ],
});
