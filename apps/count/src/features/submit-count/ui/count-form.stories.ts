import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { CountLineView } from '@sog/domain';
import { expect, userEvent, within } from 'storybook/test';
import { CountForm } from './count-form';

const line = {
  id: 'cl-story',
  taskId: 'ct-story',
  version: 1,
  expectedQty: 24,
  countedQty: null,
  note: '',
  status: 'pending',
  sku: {
    id: 's',
    code: 'SOG-10201',
    name: '산업용 USB-C 케이블 1m',
    barcode: '8800102010004',
    unit: 'EA',
    unitCost: 4800,
    shape: 'pouch',
    hue: 205,
    category: 'electronics',
  },
  location: { id: 'l', code: 'A-02-02-1', zone: 'A', aisle: 2, rack: 2, level: 1 },
} as unknown as CountLineView;

const meta: Meta<CountForm> = {
  title: 'features/CountForm',
  component: CountForm,
  args: { line, blind: false },
  render: (args) => ({
    props: args,
    template: `<div style="max-width: 26rem"><cnt-count-form [line]="line" [blind]="blind" /></div>`,
  }),
};
export default meta;

export const Open: StoryObj<CountForm> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '1 빼기' }));
    await expect((canvas.getByLabelText(/센 수량/) as HTMLInputElement).value).toBe('23');
    await expect(canvas.getByText(/차이가 납니다/)).toBeTruthy();
  },
};

export const Blind: StoryObj<CountForm> = { args: { blind: true } };
