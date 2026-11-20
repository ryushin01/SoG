import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SkuBarcode } from './sku-barcode';

const meta: Meta<SkuBarcode> = {
  title: 'entities/sku/SkuBarcode',
  component: SkuBarcode,
  args: { code: '8800102010004' },
  render: (args) => ({
    props: args,
    template: `<div style="width: 220px; padding: 12px; background: #fff"><sog-sku-barcode [code]="code" /></div>`,
  }),
};
export default meta;

type Story = StoryObj<SkuBarcode>;
export const Default: Story = {};
/** 검증 숫자가 틀리면 막대 없이 숫자만 보여 줍니다. */
export const Invalid: Story = { args: { code: '8800102010001' } };
