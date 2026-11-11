import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { CreateOrderForm } from './create-order-form';

const meta: Meta<CreateOrderForm> = {
  title: 'features/CreateOrderForm',
  component: CreateOrderForm,
  render: () => ({ template: `<div style="max-width: 36rem"><sog-create-order-form /></div>` }),
};
export default meta;

export const Empty: StoryObj<CreateOrderForm> = {};

export const AddAndValidate: StoryObj<CreateOrderForm> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '품목 추가' }));
    await expect(canvas.getByLabelText('품목 2')).toBeTruthy();
    await userEvent.click(canvas.getByRole('button', { name: '출고 지시 만들고 재고 예약' }));
    await expect(canvas.getByText('고객사를 입력해 주세요.')).toBeTruthy();
  },
};
