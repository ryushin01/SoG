import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Pagination } from './pagination';

const meta: Meta<Pagination> = {
  title: 'shared/Pagination',
  component: Pagination,
  args: { page: 2, total: 48, size: 15, label: '재고 목록 페이지' },
};
export default meta;

export const Middle: StoryObj<Pagination> = {};
export const First: StoryObj<Pagination> = { args: { page: 1 } };
