import '../src/styles.css';
import { provideRouter } from '@angular/router';
import { applicationConfig, type Preview } from '@storybook/angular-vite';
import { provideWmsClient, seedTestSession } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';

const preview: Preview = {
  // 데이터를 부르는 스토리가 로그인한 상태로 시작하게 합니다(데모 모드 서명 키의 토큰).
  loaders: [
    async () => {
      await seedTestSession(
        { id: 'u-lee', name: '이서준', role: 'operator', team: '실사 1조' },
        'local',
      );
      return {};
    },
  ],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideWmsClient({ dbName: 'sog-storybook', latency: [0, 0] }, 'Storybook', 'local'),
        { provide: LOCAL_DB_NAME, useValue: 'sog-storybook-local' },
      ],
    }),
  ],
  parameters: {
    layout: 'padded',
    a11y: { test: 'error' },
    viewport: { defaultViewport: 'mobile1' },
  },
  tags: ['autodocs'],
};

export default preview;
