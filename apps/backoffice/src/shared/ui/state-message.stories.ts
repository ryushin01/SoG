import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StateMessage } from './state-message';

const meta: Meta<StateMessage> = {
  title: 'shared/StateMessage',
  component: StateMessage,
  args: { kind: 'loading', message: '재고 목록을 불러오는 중입니다.' },
};
export default meta;

type Story = StoryObj<StateMessage>;
export const Loading: Story = {};
export const Empty: Story = { args: { kind: 'empty', message: '조건에 맞는 품목이 없습니다.' } };
export const Error: Story = {
  args: { kind: 'error', message: '재고 목록을 불러오지 못했습니다.' },
};
