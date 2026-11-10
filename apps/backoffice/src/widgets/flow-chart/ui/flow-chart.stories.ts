import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { FlowChart } from './flow-chart';

const flow = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-10-${String(28 + i > 31 ? i - 3 : 28 + i).padStart(2, '0')}`,
  receipt: [12, 80, 0, 64, 22, 70, 9, 18, 32, 70, 54, 0, 15, 0][i]!,
  shipment: [40, 20, 30, 28, 102, 12, 88, 46, 22, 30, 16, 60, 4, 0][i]!,
}));

const meta: Meta<FlowChart> = {
  title: 'widgets/FlowChart',
  component: FlowChart,
  args: { flow },
};
export default meta;

export const Default: StoryObj<FlowChart> = {};

export const KeyboardTooltip: StoryObj<FlowChart> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('group', { name: /좌우 화살표/ }).focus();
    await userEvent.keyboard('{End}');
    await expect(canvasElement.querySelector('.tip__date')?.textContent).toBeTruthy();
  },
};
