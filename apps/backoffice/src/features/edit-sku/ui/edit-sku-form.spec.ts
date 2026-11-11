import type { SkuDetail } from '@sog/domain';
import { createWmsServer, issueToken, LOCAL_AUTH_SECRET, type WmsServer } from '@sog/wms-server';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideWmsClient, seedTestSession } from '@/shared/api';
import { EditSkuForm } from './edit-sku-form';

/** 서버를 직접 부를 때 붙이는 로그인 헤더 */
async function auth(userId: string): Promise<Record<string, string>> {
  const { token } = await issueToken(LOCAL_AUTH_SECRET, userId, Math.floor(Date.now() / 1000));
  return { Authorization: `Bearer ${token}` };
}

describe('EditSkuForm', () => {
  let other: WmsServer;
  let detail: SkuDetail;

  beforeEach(async () => {
    await seedTestSession(
      { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
      'session',
    );
    const dbName = `bo-${crypto.randomUUID()}`;
    other = await createWmsServer({ dbName });
    detail = (
      await other.handle({
        method: 'GET',
        url: '/api/skus/sku-10201',
        headers: await auth('u-kim'),
      })
    ).body as SkuDetail;
    await render(EditSkuForm, {
      inputs: { detail },
      providers: [provideWmsClient({ dbName, latency: [0, 0] })],
    });
  });

  afterEach(() => other.close());

  it('그사이 다른 관리자가 저장했으면 두 값을 보여 주고, 내 입력으로 다시 저장할 수 있다', async () => {
    // 다른 탭의 박도윤이 먼저 안전 재고를 99로 저장
    await other.handle({
      method: 'PATCH',
      url: '/api/skus/sku-10201',
      headers: { ...(await auth('u-park')), 'If-Match': `"${detail.sku.version}"` },
      body: { safetyStock: 99 },
    });

    const safety = screen.getByLabelText('안전 재고');
    await userEvent.clear(safety);
    await userEvent.type(safety, '12');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(within(alert).getByText(/동시 수정 충돌/)).toBeTruthy();
    const row = within(alert).getByRole('row', { name: /안전 재고/ });
    expect(row.textContent).toContain('12');
    expect(row.textContent).toContain('99');

    await userEvent.click(within(alert).getByRole('button', { name: '내 입력으로 다시 저장' }));
    await screen.findByText(/v3/, {}, { timeout: 3000 });

    const saved = (
      await other.handle({
        method: 'GET',
        url: '/api/skus/sku-10201',
        headers: await auth('u-kim'),
      })
    ).body as SkuDetail;
    expect(saved.sku.safetyStock).toBe(12);
    expect(saved.sku.version).toBe(3);
  });

  it('필수 항목을 비우면 저장하지 않고 오류를 알려 준다', async () => {
    await userEvent.clear(screen.getByLabelText('품목명'));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('품목명을 입력해 주세요.')).toBeTruthy();
    expect(screen.getByLabelText('품목명').getAttribute('aria-invalid')).toBe('true');
  });
});
