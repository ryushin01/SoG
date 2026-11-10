import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('창고 도면에서 칸을 고르면 그 로케이션의 품목이 보이고 주소에 남는다', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('heading', { level: 1, name: '창고 도면' })).toBeVisible();
  await expectAccessibleLayout(page);

  const cell = page.getByRole('button', { name: /^A-02-02-1\b/ });
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'A-02-02-1' })).toBeVisible();
  await expect(page).toHaveURL(/loc=loc-A-02-02-1/);
  await expect(page.locator('aside').getByRole('link').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'A-02-02-1' })).toBeVisible();
});

test('다른 관리자가 같은 품목을 수정 중이면 미리 알려 준다', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/inventory/sku-10201');
  await other.getByLabel('사용자').selectOption('u-park');
  await page.goto('/inventory/sku-10201');

  const notice = page.getByRole('status').filter({ hasText: '지금 함께 보는 사람' });
  await expect(notice).toContainText('박도윤');
  await expect(notice).not.toContainText('수정 중');

  await other.getByLabel('안전 재고').fill('44');
  await expect(notice).toContainText('수정 중');

  await other.close();
  await expect(notice).toHaveCount(0);
});

test('현장 작업자가 같은 품목을 보고 있으면 다른 작업자에게 알려 준다', async ({
  page,
  context,
}) => {
  const first = page;
  await first.goto('/count/');
  await first.getByRole('button', { name: /이서준/ }).click();
  await first.getByRole('link', { name: /A구역 2통로/ }).click();
  await first.locator('a.line').first().click();
  await expect(first).toHaveURL(/\/lines\//);
  const lineUrl = first.url();

  const second = await context.newPage();
  await second.goto(lineUrl);
  await expect(
    second.getByRole('status').filter({ hasText: '이 품목을 보고 있습니다' }),
  ).toBeVisible();

  // 백오피스 실사 화면에서도 작업자가 어느 품목 앞에 있는지 보입니다.
  const backoffice = await context.newPage();
  await backoffice.goto('/counts/ct-003');
  await expect(
    backoffice.getByRole('status').filter({ hasText: '지금 함께 보는 사람' }),
  ).toContainText('현장 앱');
});

test('재고 목록을 지금 필터 그대로 CSV로 내려받는다', async ({ page }) => {
  await page.goto('/inventory?category=food');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'CSV 내보내기' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sog-재고-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).split('\r\n');
  expect(lines[0]).toContain('품목 코드,바코드,품목명,분류');
  expect(lines).toHaveLength(9);
  expect(lines.slice(1).every((line) => line.includes(',상온식품,'))).toBe(true);
});

test('실사 차이 보고서를 CSV로 내려받는다', async ({ page }) => {
  await page.goto('/counts/ct-002');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '차이 보고서 CSV' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sog-실사-CC-\d{4}-002\.csv$/);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toContain('차이 금액');
  expect(text).toContain('최민아');
});
