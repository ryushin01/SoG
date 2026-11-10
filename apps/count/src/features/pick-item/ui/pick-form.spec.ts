import type { OrderDetail } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideWmsClient } from '@/shared/api';
import { PickApi } from '@/entities/pick-order';
import { PickForm } from './pick-form';

const item = {
  id: 'a1',
  stockId: 's1',
  locationId: 'l1',
  qty: 5,
  pickedQty: null,
  pickedBy: null,
  pickedAt: null,
  note: '',
  lineId: 'line1',
  location: { id: 'l1', code: 'A-01-01-1', zone: 'A', aisle: 1, rack: 1, level: 1 },
  sku: {
    id: 'sku',
    code: 'SOG-1',
    name: '테스트 품목',
    barcode: '1',
    unit: 'EA',
    shape: 'box',
    hue: 1,
    category: 'tools',
  },
} as OrderDetail['route'][number];

async function setup() {
  const done = vi.fn();
  const view = await render(PickForm, {
    inputs: { orderId: 'so-1', version: 3, item },
    on: { done },
    providers: [provideWmsClient({ dbName: `pick-${crypto.randomUUID()}`, latency: [0, 0] })],
  });
  const api = view.fixture.debugElement.injector.get(PickApi);
  const pick = vi.spyOn(api, 'pick').mockResolvedValue({} as never);
  return { done, pick };
}

describe('PickForm', () => {
  it('예약 수량을 그대로 집으면 사유 없이 저장한다', async () => {
    const { done, pick } = await setup();
    await userEvent.click(screen.getByRole('button', { name: '집음 확인' }));
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(pick).toHaveBeenCalledWith(
      'so-1',
      'a1',
      3,
      { pickedQty: 5, note: '' },
      expect.any(String),
    );
  });

  it('덜 집으면 사유를 받아야 저장한다', async () => {
    const { done, pick } = await setup();
    await userEvent.click(screen.getByRole('button', { name: '1 빼기' }));
    await userEvent.click(screen.getByRole('button', { name: '집음 확인' }));
    expect(await screen.findByText('덜 집었으면 사유를 적어 주세요.')).toBeTruthy();
    expect(pick).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('덜 집은 사유'), '파손 1개');
    await userEvent.click(screen.getByRole('button', { name: '집음 확인' }));
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
    expect(pick).toHaveBeenCalledWith(
      'so-1',
      'a1',
      3,
      { pickedQty: 4, note: '파손 1개' },
      expect.any(String),
    );
  });

  it('빠르게 두 번 눌러도 한 번만 보낸다', async () => {
    const { pick } = await setup();
    await userEvent.dblClick(screen.getByRole('button', { name: '집음 확인' }));
    await vi.waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
  });
});
