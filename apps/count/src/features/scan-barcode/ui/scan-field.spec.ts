import type { CountLineView } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ScanField } from './scan-field';

function line(id: string, barcode: string, status: CountLineView['status']): CountLineView {
  return {
    id,
    status,
    sku: {
      id: 's',
      code: 'SOG-1',
      name: '테스트 품목',
      barcode,
      unit: 'EA',
      unitCost: 1,
      shape: 'box',
      hue: 1,
      category: 'tools',
    },
  } as CountLineView;
}

describe('ScanField', () => {
  it('바코드로 아직 세지 않은 줄을 먼저 찾는다', async () => {
    const found = vi.fn();
    const lines = [line('a', '8800000000001', 'counted'), line('b', '8800000000001', 'pending')];
    await render(ScanField, { inputs: { lines }, on: { found } });

    await userEvent.type(screen.getByLabelText('바코드 스캔'), '8800000000001{Enter}');

    expect(found).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('작업에 없는 바코드면 알려 준다', async () => {
    await render(ScanField, { inputs: { lines: [line('a', '8800000000001', 'pending')] } });

    await userEvent.type(screen.getByLabelText('바코드 스캔'), '123{Enter}');

    expect(screen.getByText(/이 작업에 없는 바코드입니다/)).toBeTruthy();
  });
});
