import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StateMessage } from './state-message';

const meta: Meta<StateMessage> = {
  title: 'shared/StateMessage',
  component: StateMessage,
  args: { kind: 'loading', message: '작업 목록을 불러오는 중입니다.' },
};
export default meta;

export const Loading: StoryObj<StateMessage> = {};
export const Error: StoryObj<StateMessage> = {
  args: { kind: 'error', message: '작업을 불러오지 못했습니다.' },
};
