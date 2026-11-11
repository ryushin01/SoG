import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LoginForm } from './login-form';

const meta: Meta<LoginForm> = {
  title: 'features/LoginForm',
  component: LoginForm,
  args: {
    accounts: [
      { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
      { id: 'u-park', name: '박도윤', role: 'manager', team: '센터장' },
    ],
  },
  render: (args) => ({
    props: args,
    template: `<div style="max-width: 28rem"><sog-login-form [accounts]="accounts" /></div>`,
  }),
};
export default meta;

export const Default: StoryObj<LoginForm> = {};

export const Required: StoryObj<LoginForm> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '로그인' }));
    await expect(canvas.getByText('계정을 골라 주세요.')).toBeTruthy();
  },
};
