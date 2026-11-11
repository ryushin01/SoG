import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('출고 지시를 만들고, 현장에서 피킹하고, 출고를 확정하면 재고가 준다', async ({
  page,
  context,
}) => {
  // 1. 백오피스: 출고 지시 만들기
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1, name: '출고 지시' })).toBeVisible();
  await expectAccessibleLayout(page);
  await page.getByRole('button', { name: '새 출고 지시' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('고객사').fill('시험유통');
  await dialog.getByLabel('피킹 작업자').selectOption('u-lee');
  await expect(dialog.getByRole('option', { name: /OPP 테이프 48mm/ })).toBeAttached();
  await dialog
    .getByLabel('품목 1')
    .selectOption({ label: await optionLabel(dialog, /OPP 테이프 48mm/) });
  await dialog.getByLabel('수량').fill('3');
  await dialog.getByRole('button', { name: '출고 지시 만들고 재고 예약' }).click();
  await expect(page).toHaveURL(/\/orders\/so-/);
  await expect(page.getByRole('heading', { level: 1, name: '시험유통' })).toBeVisible();
  await expectAccessibleLayout(page);
  const orderUrl = page.url();

  // 2. 현장 앱: 이서준이 피킹
  const field = await context.newPage();
  await field.setViewportSize({ width: 390, height: 844 });
  await field.goto('/count/');
  await field.getByRole('button', { name: /이서준/ }).click();
  await field.getByRole('link', { name: '피킹' }).click();
  await field.getByRole('link', { name: /시험유통/ }).click();
  await expect(field.getByRole('heading', { level: 1, name: '시험유통' })).toBeVisible();
  await expectAccessibleLayout(field);
  await expect(field.locator('.stop').first()).toBeVisible();
  // 동선 순서대로 하나씩 집고, 다음 할당이 펼쳐지기를 기다립니다(최대 10번).
  for (
    let i = 0;
    i < 10 && (await field.getByRole('button', { name: '집음 확인' }).count()) > 0;
    i++
  ) {
    const before = await field.locator('.stop--done').count();
    await field.getByRole('button', { name: '집음 확인' }).click();
    await expect(field.locator('.stop--done')).toHaveCount(before + 1);
  }
  await expect(field.getByText('피킹을 모두 마쳤습니다.')).toBeVisible();

  // 3. 백오피스: 실시간으로 출고 대기가 되고, 출고 확정
  await page.goto(orderUrl);
  await page.getByRole('button', { name: '출고 확정' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '출고', exact: true }).click();
  await expect(page.getByText('출고 완료').first()).toBeVisible();
});

test('두 관리자가 마지막 재고로 동시에 출고 지시를 만들면 한쪽은 부족 안내를 받는다', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto('/orders');
  await other.getByLabel('사용자').selectOption('u-park');
  await page.goto('/orders');

  async function fill(tab: typeof page, customer: string) {
    await tab.getByRole('button', { name: '새 출고 지시' }).click();
    const dialog = tab.getByRole('dialog');
    await dialog.getByLabel('고객사').fill(customer);
    await dialog.getByLabel('피킹 작업자').selectOption('u-jung');
    await expect(dialog.getByRole('option', { name: /참치 통조림 150g/ })).toBeAttached();
    const label = await optionLabel(dialog, /참치 통조림 150g/);
    await dialog.getByLabel('품목 1').selectOption({ label });
    const free = Number(/가용 (\d+)/.exec(label)![1]);
    await dialog.getByLabel('수량').fill(String(Math.floor(free / 2) + 1));
    return dialog;
  }
  const a = await fill(page, '가상회사');
  const b = await fill(other, '나상회사');
  await Promise.all([
    a.getByRole('button', { name: '출고 지시 만들고 재고 예약' }).click(),
    b.getByRole('button', { name: '출고 지시 만들고 재고 예약' }).click(),
  ]);
  const failed = page.getByRole('alert').filter({ hasText: '가용 재고가 부족합니다' });
  const failedOther = other.getByRole('alert').filter({ hasText: '가용 재고가 부족합니다' });
  // 둘 중 정확히 한쪽만 부족 안내를 받고, 다른 쪽은 상세 화면으로 넘어갑니다.
  await expect.poll(async () => (await failed.count()) + (await failedOther.count())).toBe(1);
  await expect
    .poll(() => [page.url(), other.url()].filter((url) => /\/orders\/so-/.test(url)).length)
    .toBe(1);
});

async function optionLabel(
  scope: import('@playwright/test').Locator,
  name: RegExp,
): Promise<string> {
  return ((await scope.getByRole('option', { name }).first().textContent()) ?? '').trim();
}
