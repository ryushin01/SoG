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

/** 테스트마다 데모 데이터를 처음 상태로 되돌립니다. */
export async function resetDemo(page: Page): Promise<void> {
  await page.goto('/');
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
