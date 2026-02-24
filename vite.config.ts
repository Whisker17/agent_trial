import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000';

export function getApiProxyTarget(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.VITE_API_PROXY_TARGET?.trim();
  return configured || DEFAULT_API_PROXY_TARGET;
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: 'src/frontend',
  envDir: path.resolve(__dirname),
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/frontend/index.html'),
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-query', 'react-router-dom'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    proxy: {
      '/api/': {
        target: getApiProxyTarget(),
        changeOrigin: true,
      },
    },
  },
});
