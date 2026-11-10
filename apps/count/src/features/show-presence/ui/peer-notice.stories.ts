import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, waitFor, within } from 'storybook/test';
import { PeerNotice } from './peer-notice';

const meta: Meta<PeerNotice> = {
  title: 'features/PeerNotice',
  component: PeerNotice,
  args: { resource: 'counts/ct-003', current: 'counts/ct-003/lines/l1' },
};
export default meta;

export const SameItem: StoryObj<PeerNotice> = {
  play: async ({ canvasElement }) => {
    const channel = new BroadcastChannel('sog-presence');
    channel.postMessage({
      type: 'here',
      peer: {
        tabId: 'x',
        userId: 'u-jung',
        app: '현장 앱',
        resource: 'counts/ct-003/lines/l1',
        editing: false,
        detail: 'A-02-01-1 주방세제 리필 1.2L',
        at: Date.now(),
      },
    });
    channel.postMessage({
      type: 'here',
      peer: {
        tabId: 'y',
        userId: 'u-kim',
        app: '백오피스',
        resource: 'counts/ct-003',
        editing: false,
        detail: '',
        at: Date.now(),
      },
    });
    channel.close();
    await waitFor(() =>
      expect(within(canvasElement).getByText(/이 품목을 보고 있습니다/)).toBeTruthy(),
    );
  },
};
