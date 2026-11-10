import type { CountLineView } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NetworkState, provideWmsClient } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';
import { Outbox } from '@/entities/outbox';
import { CountForm } from './count-form';

const line = {
  id: 'cl-1',
  taskId: 'ct-1',
  version: 1,
  expectedQty: 10,
  countedQty: null,
  note: '',
  status: 'pending',
  sku: {
    id: 's',
    code: 'SOG-1',
    name: '테스트 품목',
    barcode: '1',
    unit: 'EA',
    unitCost: 1,
    shape: 'box',
    hue: 1,
    category: 'tools',
  },
  location: { id: 'l', code: 'A-01-01-1', zone: 'A', aisle: 1, rack: 1, level: 1 },
} as unknown as CountLineView;

async function setup(blind: boolean) {
  const saved = vi.fn();
  const view = await render(CountForm, {
    inputs: { line, blind },
    on: { saved },
    providers: [
      provideWmsClient({ dbName: `cf-${crypto.randomUUID()}`, latency: [0, 0] }),
      { provide: LOCAL_DB_NAME, useValue: `cf-local-${crypto.randomUUID()}` },
    ],
  });
  // 서버로 보내지 않고 보낼함에 쌓이는 것만 봅니다.
  view.fixture.debugElement.injector.get(NetworkState).simulatedOffline.set(true);
  return { saved, outbox: view.fixture.debugElement.injector.get(Outbox) };
}

describe('CountForm', () => {
  it('블라인드 실사는 0에서 시작하고 장부 수량을 보여 주지 않는다', async () => {
    await setup(true);
    expect((screen.getByLabelText(/센 수량/) as HTMLInputElement).value).toBe('0');
    expect(screen.queryByText('장부 10')).toBeNull();
  });

  it('+/− 버튼으로 수량을 바꾸고 장부와 다르면 알려 준다', async () => {
    await setup(false);
    await userEvent.click(screen.getByRole('button', { name: '1 더하기' }));
    expect((screen.getByLabelText(/센 수량/) as HTMLInputElement).value).toBe('11');
    expect(screen.getByText(/차이가 납니다/)).toBeTruthy();
  });

  it('저장을 빠르게 두 번 눌러도 보낼함에는 한 건만 들어간다', async () => {
    const { saved, outbox } = await setup(false);
    await userEvent.dblClick(screen.getByRole('button', { name: /저장하고 다음/ }));
    await vi.waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(outbox.items()).toHaveLength(1);
    expect(outbox.items()[0]!.countedQty).toBe(10);
  });
});
