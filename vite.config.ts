import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:19684',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:19684',
        ws: true,
      }
    }
  }
});
