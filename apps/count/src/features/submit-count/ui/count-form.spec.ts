import type { CountLineView } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { NetworkState, provideWmsClient } from '@/shared/api';
import { LOCAL_DB_NAME, UnsavedWork } from '@/shared/lib';
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
  return {
    fixture: view.fixture,
    saved,
    outbox: view.fixture.debugElement.injector.get(Outbox),
    unsaved: view.fixture.debugElement.injector.get(UnsavedWork),
  };
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

  it('수량을 바꾸면 저장하지 않은 입력으로 표시하고, 저장하면 해제한다', async () => {
    const { unsaved, saved } = await setup(false);
    expect(unsaved.dirty()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: '1 더하기' }));
    expect(unsaved.dirty()).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /저장하고 다음/ }));
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
    expect(unsaved.dirty()).toBe(false);
  });

  it('잘못된 수량은 보낼함에 넣지 않고 오류를 보여 준다', async () => {
    const { saved, outbox } = await setup(false);
    const qty = screen.getByLabelText(/센 수량/);
    await userEvent.clear(qty);
    await userEvent.type(qty, '-1');
    await userEvent.click(screen.getByRole('button', { name: /저장하고 다음/ }));
    expect(await screen.findByText('0 이상으로 입력해 주세요.')).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
    expect(outbox.items()).toHaveLength(0);
    // 다시 고칠 수 있게 입력이 잠기지 않아야 합니다.
    expect((qty as HTMLInputElement).disabled).toBe(false);
  });

  it('기기 저장에 실패하면 저장된 것처럼 넘어가지 않고 알린다', async () => {
    const { saved, outbox, unsaved } = await setup(false);
    vi.spyOn(outbox, 'enqueue').mockRejectedValueOnce(new Error('QuotaExceededError'));
    await userEvent.click(screen.getByRole('button', { name: '1 더하기' }));
    await userEvent.click(screen.getByRole('button', { name: /저장하고 다음/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/기기에 저장하지 못했습니다/)).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
    expect(unsaved.dirty()).toBe(true);
    expect((screen.getByLabelText(/센 수량/) as HTMLInputElement).disabled).toBe(false);
  });

  it('저장이 끝나기 전에 폼이 사라져도 저장이 끝날 때까지 보호한다', async () => {
    const view = await setup(false);
    let finish!: () => void;
    vi.spyOn(view.outbox, 'enqueue').mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({} as never))),
    );
    await userEvent.click(screen.getByRole('button', { name: /저장하고 다음/ }));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    view.fixture.destroy();
    expect(view.unsaved.dirty()).toBe(true);
    finish();
    await vi.waitFor(() => expect(view.unsaved.dirty()).toBe(false));
  });
});
