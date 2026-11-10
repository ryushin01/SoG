import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { FlowChart } from './flow-chart';

const flow = [
  { date: '2026-11-08', receipt: 12, shipment: 4 },
  { date: '2026-11-09', receipt: 0, shipment: 30 },
];

describe('FlowChart', () => {
  it('범례에 합계를 적고 표로도 값을 보여 준다', async () => {
    await render(FlowChart, { inputs: { flow } });
    expect(screen.getByText(/입고 12/)).toBeTruthy();
    expect(screen.getByText(/출고 34/)).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('키보드 화살표로 날짜별 값을 읽을 수 있다', async () => {
    await render(FlowChart, { inputs: { flow } });
    screen.getByRole('group', { name: /좌우 화살표/ }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.querySelector('.tip__date')?.textContent).toBe('11/8');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.querySelector('.tip__date')?.textContent).toBe('11/9');
    await userEvent.keyboard('{Escape}');
    expect(document.querySelector('.tip__date')).toBeNull();
  });
});
