import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Pagination } from './pagination';

describe('Pagination', () => {
  it('현재 페이지를 aria-current로 알리고 이동을 알린다', async () => {
    const pageChange = vi.fn();
    await render(Pagination, { inputs: { page: 2, total: 45, size: 15 }, on: { pageChange } });

    expect(screen.getByRole('button', { name: '페이지 2' }).getAttribute('aria-current')).toBe(
      'page',
    );
    await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(pageChange).toHaveBeenCalledWith(3);
  });

  it('한 페이지뿐이면 그리지 않는다', async () => {
    await render(Pagination, { inputs: { page: 1, total: 5, size: 15 } });
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
