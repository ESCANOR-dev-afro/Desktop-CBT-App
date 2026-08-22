import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'chrome >= 60', 'edge >= 18', 'firefox >= 55', 'safari >= 11', 'not IE 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      polyfills: false
    })
  ],
  base: './',
  build: {
    target: 'es2015',
    cssTarget: 'chrome60'
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
