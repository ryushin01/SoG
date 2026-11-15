import { expect, type Page, test } from '@playwright/test';

import { DEMO_PASSWORD, loginBackoffice, loginCount, resetDemo } from './helpers';

/**
 * README 화면 촬영 (pnpm --dir e2e screenshots, 먼저 pnpm build && pnpm site).
 * 결과: 저장소 루트의 docs/images/*.jpg. 브라우저 안 데모 서버의 가상 데이터만 나옵니다.
 * 평소 E2E에는 들어가지 않습니다(SCREENSHOTS=1일 때만 프로젝트가 생김).
 */
const OUT = '../docs/images';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 664 };

async function shoot(page: Page, name: string, wait = 800): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await resetDemo(page);
});

test('백오피스: 로그인·대시보드·재고·도면·실사 검토', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('radio', { name: /김하늘/ }).check();
  await page.getByLabel('비밀번호').fill(DEMO_PASSWORD);
  await shoot(page, 'backoffice-login');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'backoffice-dashboard', 1500);

  await page.goto('/inventory');
  await expect(page.getByRole('heading', { level: 1, name: '재고' })).toBeVisible();
  await shoot(page, 'backoffice-inventory');

  await page.goto('/map?loc=loc-A-02-01-1');
  await expect(page.getByRole('heading', { level: 1, name: '창고 도면' })).toBeVisible();
  await shoot(page, 'backoffice-map');

  await page.goto('/counts');
  await page
    .getByRole('link', { name: /냉장 구역/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shoot(page, 'backoffice-count-review');
});

test('백오피스: 함께 보는 사람, 동시 수정 충돌, 변경 이력', async ({ page, context }) => {
  await loginBackoffice(page, '김하늘', '/inventory/sku-10201');
  const other = await context.newPage();
  await other.setViewportSize(DESKTOP);
  await loginBackoffice(other, '박도윤', '/inventory/sku-10201');
  const notice = page.getByRole('status').filter({ hasText: '지금 함께 보는 사람' });
  await expect(notice).toContainText('박도윤');
  await other.getByLabel('안전 재고', { exact: true }).fill('40');
  await expect(notice).toContainText('수정 중');
  await shoot(page, 'backoffice-presence');

  await page.getByLabel('안전 재고', { exact: true }).fill('25');
  await other.getByRole('button', { name: '저장', exact: true }).click();
  await expect(other.getByRole('form', { name: '기본 정보' }).getByText('v2')).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '동시 수정 충돌' })).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await shoot(page, 'backoffice-conflict');

  const log = page.getByRole('region', { name: '변경 이력' });
  await expect(log.getByText('막힘 · 버전 충돌')).toBeVisible();
  await log.scrollIntoViewIfNeeded();
  await shoot(page, 'backoffice-history');
});

test('출고 지시와 현장 피킹', async ({ page, context }) => {
  const field = await context.newPage();
  await field.setViewportSize(PHONE);
  await loginCount(field);
  await field.getByRole('link', { name: '피킹' }).click();
  await field.getByRole('link', { name: /한빛리테일/ }).click();
  await expect(field.locator('.stop').first()).toBeVisible();
  await shoot(field, 'count-pick');

  await loginBackoffice(page, '김하늘', '/orders');
  await page
    .getByRole('link', { name: /한빛리테일/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: '한빛리테일' })).toBeVisible();
  await shoot(page, 'backoffice-order', 2000);
});

test.describe('현장 앱', () => {
  test.use({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('로그인·작업 목록·작업·품목·보낼함', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/count/start');
    await page.getByRole('button', { name: /이서준/ }).click();
    await page.getByLabel('비밀번호').fill(DEMO_PASSWORD);
    await shoot(page, 'count-login');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: '오늘의 실사' })).toBeVisible();
    await shoot(page, 'count-tasks');

    await page.getByRole('link', { name: /A구역 2통로/ }).click();
    await expect(page.locator('a.line').first()).toBeVisible();
    await shoot(page, 'count-task');
    await page.locator('a.line').first().click();
    await expect(page).toHaveURL(/\/lines\//);
    await shoot(page, 'count-item');

    // 오프라인으로 센 수량 한 건이 보낼함에 남은 상태
    await page.getByRole('link', { name: '보낼함·설정' }).click();
    await page.getByRole('switch', { name: '오프라인 모의' }).check();
    await page.getByRole('link', { name: '실사 작업' }).click();
    await page.getByRole('link', { name: /A구역 2통로/ }).click();
    await page.locator('a.line', { hasText: '미실사' }).first().click();
    await page.getByRole('button', { name: /기기에 저장하고 다음/ }).click();
    await page.getByRole('link', { name: /오프라인 · 대기 1/ }).click();
    await shoot(page, 'count-outbox');
  });
});
