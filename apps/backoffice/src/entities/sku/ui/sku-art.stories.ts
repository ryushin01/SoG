import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SkuArt } from './sku-art';

const meta: Meta<SkuArt> = {
  title: 'entities/sku/SkuArt',
  component: SkuArt,
  args: {
    sku: { shape: 'bottle', hue: 168, code: 'SOG-10404', name: '다목적 세정제 750ml' },
    view: 'front',
    size: 240,
  },
  argTypes: { view: { control: 'inline-radio', options: ['front', 'angle', 'label'] } },
  render: (args) => ({
    props: args,
    template: `<div style="width: 240px"><sog-sku-art [sku]="sku" [view]="view" [size]="size" /></div>`,
  }),
};
export default meta;

type Story = StoryObj<SkuArt>;
export const Bottle: Story = {};
export const Box: Story = {
  args: { sku: { shape: 'box', hue: 205, code: 'SOG-10208', name: '리튬 배터리팩 18650 4구' } },
};
export const Roll: Story = {
  args: {
    sku: { shape: 'roll', hue: 32, code: 'SOG-10215', name: '에어캡 롤 50m' },
    view: 'angle',
  },
};
