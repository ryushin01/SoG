import { render, screen } from '@testing-library/angular';
import { StockStatusBadge } from './stock-status-badge';

describe('StockStatusBadge', () => {
  it.each([
    ['ok', '정상'],
    ['low', '부족'],
    ['out', '품절'],
  ] as const)('%s 상태를 글자로 보여 준다', async (status, label) => {
    await render(StockStatusBadge, { inputs: { status } });
    expect(screen.getByText(label)).toBeTruthy();
  });
});
