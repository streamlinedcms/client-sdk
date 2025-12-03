import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Define build-time constants for tests (same as rollup.config.js)
  define: {
    __SDK_API_URL__: JSON.stringify('https://api.streamlinedcms.com'),
    __SDK_APP_URL__: JSON.stringify('https://app.streamlinedcms.com'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types.ts',      // Type definitions only
        'src/index.ts',      // Re-exports only
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
