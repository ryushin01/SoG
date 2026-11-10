import type { Meta, StoryObj } from '@storybook/angular-vite';
import { Progress } from './progress-ring';

const meta: Meta<Progress> = {
  title: 'entities/count-task/Progress',
  component: Progress,
  args: { done: 10, total: 21 },
};
export default meta;

export const Halfway: StoryObj<Progress> = {};
