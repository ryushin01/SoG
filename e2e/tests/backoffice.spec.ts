import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, loginBackoffice, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
  await loginBackoffice(page);
});

test('주요 화면이 열리고 접근성 검사를 통과한다', async ({ page }) => {
  for (const [path, heading] of [
    ['/', '운영 현황'],
    ['/inventory', '재고'],
    ['/inventory/sku-10201', '산업용 USB-C 케이블 1m'],
    ['/counts', '재고 실사'],
    ['/counts/ct-002', '냉장 구역 월말 실사'],
    ['/activity', '활동 기록'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/SoG 백오피스/);
    await expectAccessibleLayout(page);
  }
});

test('재고 검색과 상태 필터가 주소에 남는다', async ({ page }) => {
  await page.goto('/inventory');
  await page.getByLabel('검색').fill('테이프');
  await expect(page.getByRole('link', { name: 'OPP 테이프 48mm' })).toBeVisible();
  await expect(page).toHaveURL(/q=%ED%85%8C%EC%9D%B4%ED%94%84|q=테이프/);
  await page.getByLabel('검색').fill('');
  await page.getByLabel('상태').selectOption('out');
  await expect(page).toHaveURL(/status=out/);
});

test('두 관리자가 같은 품목을 고치면 늦게 저장한 쪽이 충돌을 보고 고를 수 있다', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await loginBackoffice(other, '박도윤', '/inventory/sku-10201');
  await page.goto('/inventory/sku-10201');
  await expect(page.getByRole('form', { name: '기본 정보' }).getByText('v1')).toBeVisible();
  await expect(other.getByRole('form', { name: '기본 정보' }).getByText('v1')).toBeVisible();

  // 김하늘이 먼저 고치기 시작합니다.
  await page.getByLabel('안전 재고', { exact: true }).fill('12');

  // 그사이 박도윤 탭이 저장합니다.
  await other.getByLabel('안전 재고', { exact: true }).fill('77');
  await other.getByRole('button', { name: '저장', exact: true }).click();
  await expect(other.getByRole('form', { name: '기본 정보' }).getByText('v2')).toBeVisible();

  // 김하늘 탭은 입력을 덮어쓰지 않고, 다른 사람이 바꿨다고 알려 줍니다.
  await expect(page.getByText(/이 품목을 방금 수정했습니다/)).toBeVisible();
  await expect(page.getByLabel('안전 재고', { exact: true })).toHaveValue('12');

  await page.getByRole('button', { name: '저장', exact: true }).click();
  const conflict = page.getByRole('alert').filter({ hasText: '동시 수정 충돌' });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole('row', { name: /안전 재고/ })).toContainText('77');

  await conflict.getByRole('button', { name: '내 입력으로 다시 저장' }).click();
  await expect(page.getByRole('form', { name: '기본 정보' }).getByText('v3')).toBeVisible();
  // 박도윤 탭은 고치던 중이 아니므로 최신 값으로 저절로 바뀝니다.
  await expect(other.getByLabel('안전 재고', { exact: true })).toHaveValue('12');
});

test('실사 검토 화면에서 승인하면 재고에 반영된다', async ({ page }) => {
  await page.goto('/counts/ct-002');
  await page.getByRole('button', { name: '승인하고 재고 반영' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '승인', exact: true }).click();
  await expect(page.getByText('승인', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '승인하고 재고 반영' })).toHaveCount(0);
});
