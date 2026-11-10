import type { StorybookConfig } from '@storybook/angular-vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 모노레포에서 애드온 경로를 확실히 찾도록 절대 경로로 넘깁니다. */
function resolve(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: [
    resolve('@storybook/addon-vitest'),
    resolve('@storybook/addon-a11y'),
    resolve('@storybook/addon-docs'),
  ],
  framework: resolve('@storybook/angular-vite'),
};

export default config;
