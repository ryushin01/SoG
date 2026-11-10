import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TaskStatusPill } from './task-status-pill';

const meta: Meta<TaskStatusPill> = {
  title: 'entities/count-task/TaskStatusPill',
  component: TaskStatusPill,
  render: () => ({
    template: `<div style="display:flex;gap:.5rem;flex-wrap:wrap">
      <cnt-task-status-pill status="open" /><cnt-task-status-pill status="in_progress" />
      <cnt-task-status-pill status="submitted" /><cnt-task-status-pill status="approved" />
      <cnt-task-status-pill status="cancelled" />
    </div>`,
  }),
};
export default meta;

export const All: StoryObj<TaskStatusPill> = {};
