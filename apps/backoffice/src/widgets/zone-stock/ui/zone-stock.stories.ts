import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ZoneStock } from './zone-stock';

const meta: Meta<ZoneStock> = {
  title: 'widgets/ZoneStock',
  component: ZoneStock,
  args: {
    zones: [
      { zone: 'A', value: 43_530_100, units: 5593 },
      { zone: 'B', value: 9_782_800, units: 1678 },
      { zone: 'C', value: 13_613_100, units: 1180 },
      { zone: 'D', value: 40_116_500, units: 1067 },
    ],
  },
};
export default meta;

export const Default: StoryObj<ZoneStock> = {};
