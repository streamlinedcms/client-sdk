import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  publicDir: false,
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      '@streamlined-cms/client-sdk': '../dist/streamlined-cms.esm.js',
    },
  },
});
