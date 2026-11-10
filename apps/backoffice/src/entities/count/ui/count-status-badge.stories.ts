import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CountStatusBadge } from './count-status-badge';

const meta: Meta<CountStatusBadge> = {
  title: 'entities/count/CountStatusBadge',
  component: CountStatusBadge,
  args: { status: 'in_progress' },
  argTypes: {
    status: {
      control: 'select',
      options: ['open', 'in_progress', 'submitted', 'approved', 'cancelled'],
    },
  },
};
export default meta;

type Story = StoryObj<CountStatusBadge>;
export const InProgress: Story = {};
export const Submitted: Story = { args: { status: 'submitted' } };
export const Approved: Story = { args: { status: 'approved' } };
