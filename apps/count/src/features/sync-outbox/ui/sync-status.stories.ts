import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SyncStatus } from './sync-status';

const meta: Meta<SyncStatus> = {
  title: 'features/SyncStatus',
  component: SyncStatus,
};
export default meta;

export const Online: StoryObj<SyncStatus> = {};
