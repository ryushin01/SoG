import '../src/styles.css';
import { provideRouter } from '@angular/router';
import { applicationConfig, type Preview } from '@storybook/angular-vite';
import { provideWmsClient, seedTestSession } from '@/shared/api';

const preview: Preview = {
  // 데이터를 부르는 스토리가 로그인한 상태로 시작하게 합니다(데모 모드 서명 키의 토큰).
  loaders: [
    async () => {
      await seedTestSession(
        { id: 'u-kim', name: '김하늘', role: 'manager', team: '재고관리팀' },
        'session',
      );
      return {};
    },
  ],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideWmsClient({ dbName: 'sog-storybook', latency: [0, 0] }, 'Storybook', 'session'),
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
