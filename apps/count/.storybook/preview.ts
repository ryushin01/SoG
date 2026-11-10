import '../src/styles.css';
import { provideRouter } from '@angular/router';
import { applicationConfig, type Preview } from '@storybook/angular-vite';
import { provideWmsClient } from '@/shared/api';
import { LOCAL_DB_NAME } from '@/shared/lib';

const preview: Preview = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        provideWmsClient({ dbName: 'sog-storybook', latency: [0, 0] }),
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
