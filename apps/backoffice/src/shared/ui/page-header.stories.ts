import type { Meta, StoryObj } from '@storybook/angular-vite';
import { PageHeader } from './page-header';

const meta: Meta<PageHeader> = {
  title: 'shared/PageHeader',
  component: PageHeader,
  args: {
    index: '01',
    label: 'Inventory',
    heading: '재고',
    description: '품목별 보유·가용 수량과 상태를 봅니다.',
  },
  render: (args) => ({
    props: args,
    template: `<sog-page-header [index]="index" [label]="label" [heading]="heading" [description]="description"><button type="button" class="btn btn--primary">입출고 등록</button></sog-page-header>`,
  }),
};
export default meta;

export const Default: StoryObj<PageHeader> = {};
