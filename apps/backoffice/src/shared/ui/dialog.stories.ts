import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Dialog } from './dialog';

const meta: Meta<Dialog> = {
  title: 'shared/Dialog',
  component: Dialog,
  render: () => ({
    props: { open: false },
    template: `
      <button type="button" class="btn" (click)="open = true">대화상자 열기</button>
      <sog-dialog [(open)]="open" heading="재고 조정">
        <p>네이티브 dialog로 초점을 가두고, Esc나 닫기 버튼으로 닫습니다.</p>
      </sog-dialog>
    `,
  }),
};
export default meta;

export const OpenAndClose: StoryObj<Dialog> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '대화상자 열기' }));
    const dialog = canvasElement.querySelector('dialog')!;
    await expect(dialog.open).toBe(true);
    await expect(document.activeElement && dialog.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(dialog.open).toBe(false));
  },
};
