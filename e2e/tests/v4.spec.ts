import { expect, test } from '@playwright/test';
import {
  DEMO_PASSWORD,
  expectAccessibleLayout,
  loginBackoffice,
  loginCount,
  resetDemo,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('로그인하지 않으면 로그인 화면으로 보내고, 로그인하면 원래 주소로 돌아간다', async ({
  page,
}) => {
  await page.goto('/inventory/sku-10201');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Finventory%2Fsku-10201/);
  await expect(page.getByRole('heading', { level: 1, name: '백오피스 로그인' })).toBeVisible();
  await expectAccessibleLayout(page);

  await page.getByRole('radio', { name: /김하늘/ }).check();
  await page.getByLabel('비밀번호').fill('wrong');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('계정이나 비밀번호가 맞지 않습니다.');

  await page.getByLabel('비밀번호').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: '산업용 USB-C 케이블 1m' }),
  ).toBeVisible();

  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('탭마다 다른 관리자로 로그인하고, 현장 앱은 작업자만 로그인한다', async ({
  page,
  context,
}) => {
  await loginBackoffice(page, '김하늘');
  const other = await context.newPage();
  await loginBackoffice(other, '박도윤');
  await expect(page.getByText('김하늘').first()).toBeVisible();
  await expect(other.getByText('박도윤').first()).toBeVisible();

  const field = await context.newPage();
  await field.goto('/count/start');
  await expect(field.getByRole('button', { name: /김하늘/ })).toHaveCount(0);
  await loginCount(field, '최민아');
  await expectAccessibleLayout(field);
});

test('작업자 토큰으로는 관리자 기능을 쓸 수 없다(실제 서버)', async ({ page }) => {
  const health = await page.request.get('/api/health').catch(() => null);
  test.skip(!health?.ok(), '데모 모드에는 /api 주소가 없어 실제 서버 모드에서만 확인합니다.');
  const login = await page.request.post('/api/auth/login', {
    data: { userId: 'u-lee', password: DEMO_PASSWORD },
  });
  const { token } = (await login.json()) as { token: string };
  const reset = await page.request.post('/api/_reset', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(reset.status()).toBe(403);
  const anonymous = await page.request.get('/api/skus');
  expect(anonymous.status()).toBe(401);
});

test('변경 이력에 누가 무엇을 바꿨는지와 막힌 시도가 남고, 막힌 값을 다시 불러올 수 있다', async ({
  page,
  context,
}) => {
  await loginBackoffice(page, '김하늘', '/inventory/sku-10201');
  const other = await context.newPage();
  await loginBackoffice(other, '박도윤', '/inventory/sku-10201');
  await expect(page.getByRole('form', { name: '기본 정보' }).getByText('v1')).toBeVisible();
  await expect(other.getByRole('form', { name: '기본 정보' }).getByText('v1')).toBeVisible();

  await page.getByLabel('안전 재고', { exact: true }).fill('25');
  await other.getByLabel('안전 재고', { exact: true }).fill('40');
  await other.getByRole('button', { name: '저장', exact: true }).click();
  await expect(other.getByRole('form', { name: '기본 정보' }).getByText('v2')).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '동시 수정 충돌' })).toBeVisible();

  const log = page.getByRole('region', { name: '변경 이력' });
  await expect(log.getByText('막힘 · 버전 충돌')).toBeVisible();
  await expect(log.getByText('박도윤').first()).toBeVisible();

  // 막힌 시도의 값을 다시 불러와 최신 버전 위에 저장합니다.
  await page.getByRole('button', { name: '최신 값 불러오기' }).click();
  await expect(page.getByLabel('안전 재고', { exact: true })).toHaveValue('40');
  await log.getByRole('button', { name: /이 값으로 다시/ }).click();
  await expect(page.getByLabel('안전 재고', { exact: true })).toHaveValue('25');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('form', { name: '기본 정보' }).getByText('v3')).toBeVisible();
  await expectAccessibleLayout(page);
});
