import { expect, test } from '@playwright/test';
import { expectAccessibleLayout, loginBackoffice, resetDemo } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('품목 상세에서 바코드 라벨을 열고, 크기·장수를 주소에 남기고 인쇄한다', async ({ page }) => {
  await loginBackoffice(page, '김하늘', '/inventory/sku-10201');
  await page.getByRole('link', { name: '라벨 인쇄' }).click();
  await expect(page).toHaveURL(/\/labels\?sku=sku-10201$/);
  await expect(page.getByRole('heading', { level: 1, name: '바코드 라벨' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: '현재 위치' })
      .getByRole('link', { name: '산업용 USB-C 케이블 1m' }),
  ).toBeVisible();

  const summary = page.getByRole('status').filter({ hasText: /품목 \d+개/ });
  await expect(summary).toHaveText(/품목 1개 · 라벨 1장\s*· A4 1쪽/);
  // 막대는 그림 이름(바코드 숫자)으로 읽힙니다.
  await expect(page.getByRole('img', { name: '바코드 8800102010004' })).toBeVisible();
  await expectAccessibleLayout(page);

  await page.getByLabel('품목당 장수').fill('3');
  await page.getByLabel('품목당 장수').press('Tab');
  await expect(summary).toHaveText(/라벨 3장/);
  await expect(page).toHaveURL(/copies=3/);
  // 범위를 벗어나면 고친 값으로 바꿔 보여 줍니다.
  await page.getByLabel('품목당 장수').fill('99');
  await page.getByLabel('품목당 장수').press('Tab');
  await expect(page.getByLabel('품목당 장수')).toHaveValue('20');

  await page.getByLabel('라벨 크기').selectOption('roll');
  await expect(page).toHaveURL(/layout=roll/);
  await expect(summary).toHaveText(/라벨 20장/);
  await expect(summary).not.toHaveText(/A4/);

  // 새로 고침해도 같은 설정으로 엽니다.
  await page.reload();
  await expect(page.getByLabel('라벨 크기')).toHaveValue('roll');
  await expect(page.getByLabel('품목당 장수')).toHaveValue('20');

  await page.evaluate(() => {
    const target = window as unknown as { printed: number };
    target.printed = 0;
    window.print = () => {
      target.printed++;
    };
  });
  await page.getByRole('button', { name: '인쇄' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // 인쇄할 때는 메뉴·머리글·설정을 감추고 라벨만 냅니다.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeHidden();
  await expect(page.getByLabel('라벨 크기')).toBeHidden();
  await expect(page.getByRole('img', { name: '바코드 8800102010004' }).first()).toBeVisible();
});

test('재고 목록의 필터 그대로 라벨을 만든다', async ({ page }) => {
  await loginBackoffice(page, '김하늘', '/inventory?category=frozen');
  await expect(page.getByLabel('분류')).toHaveValue('frozen');
  await page.getByRole('link', { name: '라벨 인쇄' }).click();
  await expect(page).toHaveURL(/\/labels\?category=frozen$/);

  const labels = page.locator('ol.sheet > li');
  await expect(labels.first()).toBeVisible();
  const count = await labels.count();
  expect(count).toBeGreaterThan(1);
  for (const text of await labels.allInnerTexts()) expect(text).toContain('냉동식품');
  await expect(page.getByRole('status').filter({ hasText: /품목 \d+개/ })).toHaveText(
    new RegExp(`품목 ${count}개 · 라벨 ${count}장`),
  );

  // 경로의 재고 링크는 같은 필터로 돌아갑니다.
  await page
    .getByRole('navigation', { name: '현재 위치' })
    .getByRole('link', { name: '재고' })
    .click();
  await expect(page).toHaveURL(/\/inventory\?category=frozen$/);
});

test('안전 재고 아래로 떨어지면 경고 알림을 띄우고 활동 기록에 남긴다', async ({ page }) => {
  await loginBackoffice(page, '김하늘', '/inventory/sku-10201');
  await expect(
    page.getByRole('heading', { level: 1, name: '산업용 USB-C 케이블 1m' }),
  ).toBeVisible();

  // 보유량보다 높은 안전 재고로 바꾸면 부족 상태가 되어 알림이 뜹니다.
  await page.getByRole('spinbutton', { name: '안전 재고' }).fill('5000');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  // 알림 문구는 버튼의 숨은 이름에도 들어 있어 첫 번째(문단)를 봅니다.
  const alert = page
    .getByRole('status')
    .getByText(/산업용 USB-C 케이블 1m 재고가 안전 재고 아래로/)
    .first();
  await expect(alert).toBeVisible();
  await expect(page.getByRole('link', { name: /^품목 보기/ })).toHaveAttribute(
    'href',
    '/inventory/sku-10201',
  );
  await expectAccessibleLayout(page);

  await page.goto('/activity?kind=stock');
  await expect(page.getByLabel('종류')).toHaveValue('stock');
  const items = page.locator('ol.feed > li');
  await expect(items.first()).toContainText('산업용 USB-C 케이블 1m 재고가 안전 재고 아래로');
  // 시드에도 부족·품절 알림이 하나씩 있습니다.
  await expect(items.filter({ hasText: '재고가 모두 떨어졌습니다' })).toHaveCount(1);
  for (const text of await items.allInnerTexts())
    expect(text).toMatch(/재고가 (안전 재고 아래로|모두)/);
});
