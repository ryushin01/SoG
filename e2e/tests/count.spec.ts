import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, loginBackoffice, loginCount, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
  await loginCount(page);
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 실사' })).toBeVisible();
  // 처음 한 번은 연결된 상태에서 목록을 받아 기기에 남깁니다.
  await expect(page.getByRole('link', { name: /A구역 2통로/ })).toBeVisible();
});

test('작업 목록·작업·품목·설정 화면이 접근성 검사를 통과한다', async ({ page }) => {
  await expectAccessibleLayout(page);
  await page.getByRole('link', { name: /A구역 2통로/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'A구역 2통로 순환 실사' }),
  ).toBeVisible();
  await expectAccessibleLayout(page);
  await page.locator('a.line').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessibleLayout(page);
  await page.getByRole('link', { name: '보낼함·설정' }).click();
  await expectAccessibleLayout(page);
});

test('현장에서 센 수량이 같은 브라우저의 백오피스 검토 화면에 바로 나타난다', async ({
  page,
  context,
}) => {
  const backoffice = await context.newPage();
  await loginBackoffice(backoffice, '김하늘', '/counts/ct-003');
  const pendingRows = backoffice.locator('tbody tr', { hasText: '미실사' });
  await expect(pendingRows.first()).toBeVisible();
  const before = await pendingRows.count();

  await page.getByRole('link', { name: /A구역 2통로/ }).click();
  await page.locator('a.line', { hasText: '미실사' }).first().click();
  await page.getByRole('button', { name: '1 더하기' }).click();
  await page.getByRole('button', { name: /저장하고 다음/ }).click();

  await expect(pendingRows).toHaveCount(before - 1);
});

test('오프라인에서 센 수량은 보낼함에 남았다가 연결되면 보내진다', async ({ page }) => {
  // 연결된 곳에서 작업을 한 번 열어 기기에 사본을 받아 둡니다.
  await page.getByRole('link', { name: /A구역 2통로/ }).click();
  await expect(page.locator('a.line').first()).toBeVisible();
  await page.getByRole('link', { name: '보낼함·설정' }).click();
  await page.getByRole('switch', { name: '오프라인 모의' }).check();
  await page.getByRole('link', { name: '실사 작업' }).click();
  await page.getByRole('link', { name: /A구역 2통로/ }).click();
  await expect(page.getByText(/오프라인입니다/)).toBeVisible();
  await page.locator('a.line', { hasText: '미실사' }).first().click();
  await page.getByRole('button', { name: /기기에 저장하고 다음/ }).click();
  await expect(page.getByRole('link', { name: /오프라인 · 대기 1/ })).toBeVisible();

  await page.getByRole('link', { name: /오프라인 · 대기 1/ }).click();
  const offline = page.getByRole('switch', { name: '오프라인 모의' });
  await expect(offline).toBeChecked();
  await offline.uncheck();
  await expect(page.getByText('보낼 기록이 없습니다.')).toBeVisible();
  await expect(page.getByRole('link', { name: /동기화됨/ })).toBeVisible();
});

test('프로덕션 빌드는 서비스 워커를 등록하고 앱 매니페스트를 가진다', async ({ page }) => {
  test.setTimeout(60_000);
  const manifest = await page.request.get('/count/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).start_url).toBe('/count/');
  const scope = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 40_000)),
    ]);
    return registration?.scope ?? null;
  });
  expect(scope).toMatch(/\/count\/$/);
});
