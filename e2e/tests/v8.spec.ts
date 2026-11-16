import { expect, test } from '@playwright/test';
import { loginBackoffice, resetDemo } from './helpers';

test('외부 글꼴 서버 등 다른 출처에 연결하지 않는다', async ({ page, baseURL }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: '백오피스 로그인' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // 영문 제목(Instrument Serif)도 앱과 함께 내보낸 파일을 씁니다(불러와도 다른 출처로 가지 않음).
  const loaded = await page.evaluate(
    async () => (await document.fonts.load('400 32px "Instrument Serif"', 'SoG')).length,
  );
  expect(loaded).toBeGreaterThan(0);
  expect([...origins].filter((origin) => origin !== new URL(baseURL!).origin)).toEqual([]);
});

test('두 앱 첫 화면에 공유 미리보기(OG) 메타가 있다', async ({ page }) => {
  for (const [path, title] of [
    ['/login', 'SoG 백오피스'],
    ['/count/start', 'SoG 재고 실사'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/og\.jpg$/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
  }
  const image = await page.request.get('/og.jpg');
  expect(image.headers()['content-type']).toContain('image/jpeg');
});

test('실제 서버 모드에서는 브라우저 안 데모 서버를 열지 않는다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'remote', '실제 서버 모드에서만 확인합니다.');
  await resetDemo(page);
  await loginBackoffice(page, '김하늘', '/inventory');
  await expect(page.getByRole('heading', { level: 1, name: '재고' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const databases = await page.evaluate(async () =>
    (await indexedDB.databases()).map((db) => db.name),
  );
  expect(databases).not.toContain('sog-wms');
});

test('배포로 사라진 화면 조각을 못 받으면 누른 화면을 새로 연다', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', '데스크톱 메뉴로 확인합니다.');
  await resetDemo(page);
  await loginBackoffice(page);
  await expect(page.getByRole('heading', { level: 1, name: '운영 현황' })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { beforeDeploy: boolean }).beforeDeploy = true));

  // 배포 전에 연 탭처럼, 새로 열기 전까지는 화면 조각(chunk-*.js)을 받지 못하게 합니다.
  let reopened = false;
  let failed = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) reopened = true;
  });
  await page.route(/\/chunk-[^/]+\.js$/, async (route) => {
    if (reopened) return route.continue();
    failed++;
    return route.fulfill({ status: 404, body: 'Not Found' });
  });

  await page.getByRole('link', { name: '창고 도면' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '창고 도면' })).toBeVisible();
  await expect(page).toHaveURL(/\/map$/);
  expect(failed).toBeGreaterThan(0);
  // 같은 탭에서 새로 열었으므로 이전 문서의 값은 없습니다(로그인은 탭의 sessionStorage라 그대로).
  expect(
    await page.evaluate(() => (window as unknown as { beforeDeploy?: boolean }).beforeDeploy),
  ).toBeUndefined();
});

test('없는 파일은 404로 답한다(사라진 화면 조각이 HTML로 오지 않음)', async ({ request }) => {
  for (const path of ['/chunk-OLDBUILD.js', '/count/chunk-OLDBUILD.js']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
  // 화면 주소는 그대로 각 앱의 첫 화면입니다.
  expect((await request.get('/inventory/sku-10201')).headers()['content-type']).toContain(
    'text/html',
  );
});
