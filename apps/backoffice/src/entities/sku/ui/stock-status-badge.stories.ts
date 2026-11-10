import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StockStatusBadge } from './stock-status-badge';

const meta: Meta<StockStatusBadge> = {
  title: 'entities/sku/StockStatusBadge',
  component: StockStatusBadge,
  args: { status: 'ok' },
  argTypes: { status: { control: 'inline-radio', options: ['ok', 'low', 'out'] } },
};
export default meta;

type Story = StoryObj<StockStatusBadge>;
export const Ok: Story = {};
export const Low: Story = { args: { status: 'low' } };
export const Out: Story = { args: { status: 'out' } };
