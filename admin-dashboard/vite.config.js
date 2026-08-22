import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'not IE 11', 'chrome >= 60', 'firefox >= 60', 'edge >= 79'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  base: './', // Use relative asset paths so it loads cleanly on any LAN sub-path or host
  server: {
    host: '0.0.0.0',
    port: 3000
  }
});
