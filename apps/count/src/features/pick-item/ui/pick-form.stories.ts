import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { OrderDetail } from '@sog/domain';
import { expect, userEvent, within } from 'storybook/test';
import { PickForm } from './pick-form';

const item = {
  id: 'a1',
  stockId: 's1',
  locationId: 'l1',
  qty: 8,
  pickedQty: null,
  pickedBy: null,
  pickedAt: null,
  note: '',
  lineId: 'line1',
  location: { id: 'l1', code: 'A-01-03-1', zone: 'A', aisle: 1, rack: 3, level: 1 },
  sku: {
    id: 'sku',
    code: 'SOG-10201',
    name: '산업용 USB-C 케이블 1m',
    barcode: '1',
    unit: 'EA',
    shape: 'pouch',
    hue: 205,
    category: 'electronics',
  },
} as OrderDetail['route'][number];

const meta: Meta<PickForm> = {
  title: 'features/PickForm',
  component: PickForm,
  args: { orderId: 'so-story', version: 1, item },
  render: (args) => ({
    props: args,
    template: `<div style="max-width: 24rem"><cnt-pick-form [orderId]="orderId" [version]="version" [item]="item" /></div>`,
  }),
};
export default meta;

export const Full: StoryObj<PickForm> = {};

export const ShortPickNeedsReason: StoryObj<PickForm> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '1 빼기' }));
    await expect(canvas.getByLabelText('덜 집은 사유')).toBeTruthy();
  },
};
