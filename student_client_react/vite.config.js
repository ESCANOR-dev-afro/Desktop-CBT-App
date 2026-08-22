import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 60', 'firefox >= 60', 'edge >= 79'],
      polyfills: false
    })
  ],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
