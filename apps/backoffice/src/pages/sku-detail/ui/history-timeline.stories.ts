import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { HistoryEntry } from '@sog/domain';
import { HistoryTimeline } from './history-timeline';

const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const base = { docId: 'sku-10201', skuId: 'sku-10201', reason: '', locationCode: null };

const meta: Meta<HistoryTimeline> = {
  title: 'pages/sku-detail/HistoryTimeline',
  component: HistoryTimeline,
  args: {
    items: [
      {
        ...base,
        id: 'h3',
        kind: 'sku',
        version: 2,
        at: at(1),
        by: 'u-park',
        blocked: true,
        reason: '박도윤님의 수정이 버전 충돌로 막혔습니다.',
        changes: [{ field: 'safetyStock', label: '안전 재고', before: 40, after: 25 }],
      },
      {
        ...base,
        id: 'h2',
        kind: 'sku',
        version: 2,
        at: at(2),
        by: 'u-kim',
        blocked: false,
        reason: '김하늘님이 산업용 USB-C 케이블 1m 정보를 수정했습니다.',
        changes: [{ field: 'safetyStock', label: '안전 재고', before: 30, after: 40 }],
      },
      {
        ...base,
        id: 'h1',
        kind: 'stock',
        version: 4,
        at: at(30),
        by: 'u-kim',
        blocked: false,
        locationCode: 'A-02-02-1',
        reason: '실물 확인',
        changes: [{ field: 'onHand', label: '보유', before: 6, after: 5 }],
      },
    ] satisfies HistoryEntry[],
  },
};
export default meta;

export const Default: StoryObj<HistoryTimeline> = {};
export const Empty: StoryObj<HistoryTimeline> = { args: { items: [] } };
