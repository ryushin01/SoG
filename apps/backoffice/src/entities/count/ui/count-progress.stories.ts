import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CountProgress } from './count-progress';

const meta: Meta<CountProgress> = {
  title: 'entities/count/CountProgress',
  component: CountProgress,
  args: { counted: 10, total: 21, name: 'CC-2611-003 진행률' },
};
export default meta;

export const Halfway: StoryObj<CountProgress> = {};
export const Done: StoryObj<CountProgress> = { args: { counted: 9, total: 9 } };
