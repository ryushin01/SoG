import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ActivityList } from './activity-list';

const now = Date.now();
const meta: Meta<ActivityList> = {
  title: 'entities/activity/ActivityList',
  component: ActivityList,
  args: {
    items: [
      {
        id: '1',
        kind: 'count.line',
        message: '이서준님이 CC-2611-003에서 주방세제 리필 1.2L 1EA을(를) 셌습니다.',
        at: new Date(now - 20_000).toISOString(),
        by: 'u-lee',
        target: '/counts/ct-003',
      },
      {
        id: '2',
        kind: 'conflict',
        message: '동시 수정 충돌을 막았습니다: PATCH /api/skus/sku-10201 (보낸 버전 "1")',
        at: new Date(now - 600_000).toISOString(),
        by: 'u-park',
        target: null,
      },
      {
        id: '3',
        kind: 'movement',
        message: '김하늘님이 OPP 테이프 48mm 40ROLL을(를) C-01-02-1에 입고했습니다.',
        at: new Date(now - 7_200_000).toISOString(),
        by: 'u-kim',
        target: '/inventory/sku-10215',
      },
    ],
  },
};
export default meta;

export const Default: StoryObj<ActivityList> = {};
export const Empty: StoryObj<ActivityList> = { args: { items: [] } };
