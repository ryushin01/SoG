import type { Meta, StoryObj } from '@storybook/angular-vite';
import type { CountLineView } from '@sog/domain';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ScanField } from './scan-field';

const lines = [
  {
    id: 'cl-1',
    status: 'pending',
    sku: {
      id: 's',
      code: 'SOG-10369',
      name: '주방세제 리필 1.2L',
      barcode: '8800103690007',
      unit: 'EA',
      unitCost: 4200,
      shape: 'pouch',
      hue: 168,
      category: 'household',
    },
  },
] as unknown as CountLineView[];

const meta: Meta<ScanField> = {
  title: 'features/ScanField',
  component: ScanField,
  args: { lines, found: fn() },
};
export default meta;

export const Found: StoryObj<ScanField> = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('바코드 스캔'), '8800103690007{Enter}');
    await expect(args.found).toHaveBeenCalled();
  },
};

export const Unknown: StoryObj<ScanField> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('바코드 스캔'), '000{Enter}');
    await expect(canvas.getByText(/이 작업에 없는 바코드/)).toBeTruthy();
  },
};
