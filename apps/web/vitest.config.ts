import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@envio-dashboard-ai/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@envio-dashboard-ai/agent': resolve(__dirname, '../../packages/agent/src/index.ts'),
    },
  },
});
