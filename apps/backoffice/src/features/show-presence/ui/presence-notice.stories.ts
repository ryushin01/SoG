import type { Meta, StoryObj } from '@storybook/angular-vite';
import { expect, waitFor, within } from 'storybook/test';
import { PresenceNotice } from './presence-notice';

/** 다른 탭이 보낸 접속 소식을 흉내 냅니다. */
function announce(
  peers: { tabId: string; userId: string; app: string; editing: boolean; detail?: string }[],
) {
  const channel = new BroadcastChannel('sog-presence');
  for (const peer of peers) {
    channel.postMessage({
      type: 'here',
      peer: { resource: 'skus/sku-10201', detail: '', at: Date.now(), ...peer },
    });
  }
  channel.close();
}

const meta: Meta<PresenceNotice> = {
  title: 'features/PresenceNotice',
  component: PresenceNotice,
  args: { resource: 'skus/sku-10201' },
};
export default meta;

export const Editing: StoryObj<PresenceNotice> = {
  play: async ({ canvasElement }) => {
    announce([
      { tabId: 'a', userId: 'u-park', app: '백오피스', editing: true },
      {
        tabId: 'b',
        userId: 'u-lee',
        app: '현장 앱',
        editing: false,
        detail: 'A-02-02-1 산업용 USB-C 케이블 1m',
      },
    ]);
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('수정 중')).toBeTruthy());
  },
};

export const Nobody: StoryObj<PresenceNotice> = {};
