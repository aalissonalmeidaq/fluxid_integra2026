import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Catálogo do design system (Spec 003, RF-011): build separado, só de desenvolvimento e CI. Não faz parte do pacote de
// produção, não usa o service worker da PWA e gera a saída fora de dist/.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'catalogo'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3100,
    fs: { allow: [import.meta.dirname] },
  },
  preview: {
    port: 4174,
  },
  build: {
    outDir: '../dist-catalogo',
    emptyOutDir: true,
  },
});
