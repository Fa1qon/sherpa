// Vite config for the renderer. Root is the repo root so index.html
// (which references /src/renderer/main.tsx) acts as the entry. Build
// output goes under dist/ so Electron's main process can loadFile()
// the produced index.html in production (per src/main/index.ts).

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  // base './' makes asset paths relative so loadFile() works over file://
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
