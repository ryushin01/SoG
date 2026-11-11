import type { Meta, StoryObj } from '@storybook/angular-vite';
import { OrderStatusBadge } from './order-status-badge';

const meta: Meta<OrderStatusBadge> = {
  title: 'entities/order/OrderStatusBadge',
  component: OrderStatusBadge,
  render: () => ({
    template: `<div class="cluster">
      <sog-order-status-badge status="reserved" /><sog-order-status-badge status="picking" />
      <sog-order-status-badge status="picked" /><sog-order-status-badge status="shipped" />
      <sog-order-status-badge status="cancelled" />
    </div>`,
  }),
};
export default meta;

export const All: StoryObj<OrderStatusBadge> = {};
