import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
