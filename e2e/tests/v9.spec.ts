import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, loginBackoffice, loginCount, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('품목 상세에서 도면으로 가면 그 품목이 있는 칸을 표시하고 주소에 남긴다', async ({ page }) => {
  await loginBackoffice(page, '김하늘', '/inventory/sku-10201');
  await expect(
    page.getByRole('heading', { level: 1, name: '산업용 USB-C 케이블 1m' }),
  ).toBeVisible();
  await page.getByRole('link', { name: '도면에서 보기' }).click();
  await expect(page).toHaveURL(/\/map\?sku=sku-10201$/);
  await expect(page.getByRole('status').filter({ hasText: '산업용 USB-C 케이블 1m:' })).toHaveText(
    /\d+칸에 [\d,]+/,
  );
  // 칸의 이름에 찾는 품목의 수량이 붙어 화면 낭독기로도 찾습니다.
  const found = page.getByRole('button', { name: /찾는 품목 \d+개/ });
  await expect(found.first()).toBeVisible();
  await expectAccessibleLayout(page);

  // 칸을 골라도 찾는 품목은 주소에 남습니다.
  await found.first().click();
  await expect(page).toHaveURL(/sku=sku-10201/);
  await expect(page).toHaveURL(/loc=loc-/);
  await page.getByLabel('품목 찾기').selectOption('');
  await expect(page.getByRole('button', { name: /찾는 품목/ })).toHaveCount(0);
  await expect(page).not.toHaveURL(/sku=/);
});

test('활동 기록을 종류·사람으로 거르고, 조건이 주소에 남는다', async ({ page }) => {
  await loginBackoffice(page, '김하늘', '/activity');
  await expect(page.getByRole('heading', { level: 1, name: '활동 기록' })).toBeVisible();
  const count = page.getByRole('status').filter({ hasText: /건 중/ });
  await expect(count).toBeVisible();
  const all = Number((await count.textContent())!.match(/(\d+)건 중/)![1]);

  await page.getByLabel('종류').selectOption('order');
  await expect(page).toHaveURL(/kind=order/);
  await expect
    .poll(async () => Number((await count.textContent())!.match(/(\d+)건 중/)![1]))
    .toBeLessThan(all);
  const items = page.locator('ol.feed > li');
  for (const text of await items.allTextContents()) expect(text).toContain('SO-');

  await page.getByLabel('사람').selectOption('u-kim');
  await expect(page).toHaveURL(/by=u-kim/);
  await expectAccessibleLayout(page);

  // 주소로 다시 열어도 조건이 그대로입니다.
  await page.reload();
  await expect(page.getByLabel('종류')).toHaveValue('order');
  await expect(page.getByLabel('사람')).toHaveValue('u-kim');
  await page.getByRole('button', { name: '필터 지우기' }).click();
  await expect(page).not.toHaveURL(/kind=|by=/);
});

test('피킹 목록과 동선은 받은 사본으로 오프라인에서도 보인다', async ({ page }) => {
  await loginCount(page);
  await page.getByRole('link', { name: '피킹' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '피킹' })).toBeVisible();
  const card = page.locator('a.card[href*="/picks/"]').first();
  await expect(card).toBeVisible();
  const customer = (await card.locator('.card__title').textContent())!.trim();
  // 연결된 곳에서 동선을 한 번 열어 기기에 사본을 받아 둡니다(실사 작업과 같은 사용법).
  await card.click();
  await expect(page.getByRole('heading', { level: 1, name: customer })).toBeVisible();

  await page.getByRole('link', { name: '보낼함·설정' }).click();
  await page.getByRole('switch', { name: '오프라인 모의' }).check();
  await page.getByRole('link', { name: '피킹' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '피킹' })).toBeVisible();
  await expect(page.getByText(/오프라인입니다\..*받은 목록/)).toBeVisible();
  await page.locator('a.card', { hasText: customer }).click();
  await expect(page.getByRole('heading', { level: 1, name: customer })).toBeVisible();
  await expect(page.getByText(/받은 동선을 보여 줍니다/)).toBeVisible();
  await expectAccessibleLayout(page);
});
