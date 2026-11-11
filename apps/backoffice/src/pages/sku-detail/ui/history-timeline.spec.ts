import type { HistoryEntry } from '@sog/domain';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideWmsClient } from '@/shared/api';
import { HistoryTimeline } from './history-timeline';

const base = {
  docId: 'sku-1',
  skuId: 'sku-1',
  at: new Date().toISOString(),
  reason: '',
  locationCode: null,
};
const items: HistoryEntry[] = [
  {
    ...base,
    id: 'h2',
    kind: 'sku',
    version: 2,
    by: 'u-park',
    blocked: true,
    changes: [{ field: 'safetyStock', label: '안전 재고', before: 11, after: 99 }],
  },
  {
    ...base,
    id: 'h1',
    kind: 'sku',
    version: 2,
    by: 'u-kim',
    blocked: false,
    changes: [{ field: 'safetyStock', label: '안전 재고', before: 30, after: 11 }],
  },
  {
    ...base,
    id: 'h0',
    kind: 'stock',
    version: 3,
    by: 'u-kim',
    blocked: false,
    locationCode: 'A-01-01-1',
    changes: [{ field: 'onHand', label: '보유', before: 5, after: 7 }],
  },
];

describe('HistoryTimeline', () => {
  it('막힌 시도를 표시하고, 품목 정보 기록만 되돌리기 버튼을 둔다', async () => {
    const restore = vi.fn();
    await render(HistoryTimeline, {
      inputs: { items },
      on: { restore },
      providers: [provideWmsClient({ dbName: `ht-${crypto.randomUUID()}`, latency: [0, 0] })],
    });
    expect(screen.getByText('막힘 · 버전 충돌')).toBeTruthy();
    expect(screen.getByText('재고 A-01-01-1')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: '이전 값으로: 안전 재고' }));
    expect(restore).toHaveBeenCalledWith(items[1]);
  });

  it('기록이 없으면 안내한다', async () => {
    await render(HistoryTimeline, {
      inputs: { items: [] },
      providers: [provideWmsClient({ dbName: `ht-${crypto.randomUUID()}`, latency: [0, 0] })],
    });
    expect(screen.getByText(/아직 변경 이력이 없습니다/)).toBeTruthy();
  });
});
