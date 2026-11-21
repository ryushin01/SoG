import { expect, type Page, test } from '@playwright/test';
import { expectAccessibleLayout, loginBackoffice, loginCount, resetDemo } from './helpers';

/**
 * 포트폴리오라 외부 서비스가 끊겨도 두 화면 축이 내용과 함께 보여야 합니다.
 * localhost 밖으로 나가는 요청(Sentry 등)을 모두 막고, 그런 요청이 아예 없는지 봅니다.
 */
const LOCAL = ['localhost', '127.0.0.1'];

async function blockExternal(page: Page): Promise<string[]> {
  const external: string[] = [];
  await page.context().route(
    (url) => !LOCAL.includes(url.hostname),
    async (route) => {
      external.push(route.request().url());
      await route.abort('internetdisconnected');
    },
  );
  return external;
}

test.describe('외부 요청을 모두 막은 상태', () => {
  test('백오피스 주요 화면이 데이터와 함께 열리고 접근성 검사를 통과한다', async ({ page }) => {
    const external = await blockExternal(page);
    await resetDemo(page);
    await loginBackoffice(page);
    for (const [path, heading] of [
      ['/', '운영 현황'],
      ['/inventory', '재고'],
      ['/counts', '재고 실사'],
      ['/orders', '출고 지시'],
      ['/map', '창고 도면'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectAccessibleLayout(page);
    }
    await page.goto('/inventory');
    await expect(page.getByRole('link', { name: '산업용 USB-C 케이블 1m' })).toBeVisible();
    expect(external).toEqual([]);
  });

  test('실사 앱 작업 목록과 작업 화면이 데이터와 함께 열리고 접근성 검사를 통과한다', async ({
    page,
  }) => {
    const external = await blockExternal(page);
    await resetDemo(page);
    await loginCount(page);
    await expect(page.getByRole('link', { name: /A구역 2통로/ })).toBeVisible();
    await expectAccessibleLayout(page);
    await page.getByRole('link', { name: /A구역 2통로/ }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'A구역 2통로 순환 실사' }),
    ).toBeVisible();
    await expect(page.locator('a.line').first()).toBeVisible();
    await expectAccessibleLayout(page);
    expect(external).toEqual([]);
  });
});

test.describe('공개 데모에서 서버 DB가 끊겼을 때', () => {
  // 운영 Worker는 DB에 닿지 않으면 /api/health에 503과 DB_UNAVAILABLE로 답합니다.
  test.beforeEach(async ({ page }) => {
    await page.context().route('**/api/**', (route) =>
      new URL(route.request().url()).pathname === '/api/health'
        ? route.fulfill({
            status: 503,
            json: { mode: 'local', code: 'DB_UNAVAILABLE', message: 'DB에 연결할 수 없습니다.' },
          })
        : route.abort('connectionrefused'),
    );
    await resetDemo(page);
  });

  test('백오피스는 데모 데이터로 대신 보여 주고 상태 안내를 띄운다', async ({ page }) => {
    await loginBackoffice(page, '김하늘', '/inventory');
    await expect(
      page.getByRole('status').filter({ hasText: '서버 DB에 연결되지 않아' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: '산업용 USB-C 케이블 1m' })).toBeVisible();
    await expectAccessibleLayout(page);
  });

  test('실사 앱도 데모 데이터로 대신 보여 주고 상태 안내를 띄운다', async ({ page }) => {
    await loginCount(page);
    await expect(
      page.getByRole('status').filter({ hasText: '서버 DB에 연결되지 않아' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /A구역 2통로/ })).toBeVisible();
    await expectAccessibleLayout(page);
  });
});
