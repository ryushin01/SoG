import type { Meta, StoryObj } from '@storybook/angular-vite';
import { MovementTypeBadge } from './movement-type-badge';

const meta: Meta<MovementTypeBadge> = {
  title: 'entities/movement/MovementTypeBadge',
  component: MovementTypeBadge,
  render: () => ({
    template: `<div class="cluster">
      <sog-movement-type-badge type="receipt" /><sog-movement-type-badge type="shipment" />
      <sog-movement-type-badge type="transfer" /><sog-movement-type-badge type="adjustment" />
      <sog-movement-type-badge type="count" />
    </div>`,
  }),
};
export default meta;

export const All: StoryObj<MovementTypeBadge> = {};
