import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** axe 위반이 없고, 가로로 넘치는 요소가 없는지 봅니다. */
export async function expectAccessibleLayout(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, '가로 스크롤이 생기면 안 됩니다').toBeLessThanOrEqual(0);
}

/**
 * 테스트마다 데이터를 처음 상태로 되돌립니다.
 * 실제 서버 모드면 서버 데이터를 초기화하고, 어느 모드든 브라우저 저장소(데모 서버, 보낼함, 사용자 선택)를 비웁니다.
 */
export async function resetDemo(page: Page): Promise<void> {
  await page.goto('/');
  const health = await page.request.get('/api/health').catch(() => null);
  if (health?.ok() && ((await health.json()) as { mode?: string }).mode === 'remote') {
    // 실제 서버의 초기화는 관리자만 할 수 있어 관리자로 로그인해 부릅니다.
    const login = await page.request.post('/api/auth/login', {
      data: { userId: 'u-kim', password: DEMO_PASSWORD },
    });
    const { token } = (await login.json()) as { token: string };
    const reset = await page.request.post('/api/_reset', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reset.status()).toBe(204);
  }
  await page.evaluate(async () => {
    for (const name of ['sog-wms', 'sog-count']) {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    }
    localStorage.clear();
    sessionStorage.clear();
  });
}

export const DEMO_PASSWORD = 'sog-demo';

/** 백오피스에 관리자로 로그인하고 path로 갑니다. 토큰은 탭마다 따로라, 새 탭은 다른 관리자로 로그인할 수 있습니다. */
export async function loginBackoffice(page: Page, name = '김하늘', path = '/'): Promise<void> {
  await page.goto(`/login?returnUrl=${encodeURIComponent(path)}`);
  await page.getByRole('radio', { name: new RegExp(name) }).check();
  await page.getByLabel('비밀번호').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** 현장 앱에 작업자로 로그인합니다. 토큰은 기기(같은 브라우저 컨텍스트)에 남습니다. */
export async function loginCount(page: Page, name = '이서준'): Promise<void> {
  await page.goto('/count/start');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByLabel('비밀번호').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '오늘의 실사' })).toBeVisible();
}
