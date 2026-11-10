import '../src/styles.css';
import { provideRouter } from '@angular/router';
import { applicationConfig, type Preview } from '@storybook/angular-vite';
import { provideWmsClient } from '@/shared/api';

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideWmsClient({ dbName: 'sog-storybook', latency: [0, 0] }),
      ],
    }),
  ],
  parameters: {
    layout: 'padded',
    // 접근성 위반은 스토리 테스트 실패로 처리합니다.
    a11y: { test: 'error' },
    backgrounds: { disable: true },
  },
  tags: ['autodocs'],
};

export default preview;
