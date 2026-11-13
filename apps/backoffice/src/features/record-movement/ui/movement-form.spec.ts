import type { SkuDetail } from '@sog/domain';
import { createWmsServer, issueToken, LOCAL_AUTH_SECRET, type WmsServer } from '@sog/wms-server';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideWmsClient, seedTestSession } from '@/shared/api';
import { MovementForm } from './movement-form';

/** 서버를 직접 부를 때 붙이는 로그인 헤더 */
async function auth(userId: string): Promise<Record<string, string>> {
  const { token } = await issueToken(LOCAL_AUTH_SECRET, userId, Math.floor(Date.now() / 1000));
  return { Authorization: `Bearer ${token}` };
}

describe('MovementForm', () => {
  let server: WmsServer;
  const done = vi.fn();

  beforeEach(async () => {
    await seedTestSession(
      { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
      'session',
    );
    const dbName = `mv-${crypto.randomUUID()}`;
    server = await createWmsServer({ dbName });
    done.mockReset();
    await render(MovementForm, {
      inputs: { skuId: 'sku-10201' },
      on: { done },
      providers: [provideWmsClient({ dbName, latency: [0, 0] })],
    });
  });

  afterEach(() => server.close());

  async function onHandAt(code: string): Promise<number> {
    const detail = (
      await server.handle({
        method: 'GET',
        url: '/api/skus/sku-10201',
        headers: await auth('u-kim'),
      })
    ).body as SkuDetail;
    return detail.stocks.find((stock) => stock.location.code === code)?.onHand ?? 0;
  }

  it('입고를 빠르게 두 번 눌러도 재고는 한 번만 늘어난다', async () => {
    const before = await onHandAt('D-01-04-1');
    await screen.findByRole('option', { name: /D-01-04-1/ }, { timeout: 3000 });
    await userEvent.selectOptions(screen.getByLabelText('도착 로케이션'), 'loc-D-01-04-1');
    const qty = screen.getByLabelText('수량');
    await userEvent.clear(qty);
    await userEvent.type(qty, '5');

    await userEvent.dblClick(screen.getByRole('button', { name: '입고 등록' }));

    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(await onHandAt('D-01-04-1')).toBe(before + 5);
  });

  it('출고는 가용 재고보다 많이 보낼 수 없다', async () => {
    await userEvent.click(screen.getByRole('radio', { name: '출고' }));
    const option = await screen.findByRole('option', { name: /A-02-02-1/ }, { timeout: 3000 });
    await userEvent.selectOptions(screen.getByLabelText('출발 로케이션'), option);
    const qty = screen.getByLabelText('수량');
    await userEvent.clear(qty);
    await userEvent.type(qty, '9999');
    await userEvent.click(screen.getByRole('button', { name: '출고 등록' }));

    expect(await screen.findByText('가용 재고보다 많이 보낼 수 없습니다.')).toBeTruthy();
    expect(done).not.toHaveBeenCalled();
  });
});
