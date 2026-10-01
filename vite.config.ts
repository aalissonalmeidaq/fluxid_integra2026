import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Destino do repasse de desenvolvimento: o Supabase CLI desta máquina (mesmo valor de VITE_SUPABASE_LOCAL_URL).
const SUPABASE_LOCAL = loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FluxID',
        short_name: 'FluxID',
        description: 'Plataforma de Identidade e Rastreabilidade',
        theme_color: '#1249B8',
        background_color: '#F3F7FA',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Nenhuma rota do Supabase (Auth, Data, Storage, Functions, Realtime) recebe o app shell como resposta.
        navigateFallbackDenylist: [/^\/rest\/v1/, /^\/auth\/v1/, /^\/graphql\/v1/, /^\/storage\/v1/, /^\/functions\/v1/, /^\/realtime\/v1/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // Só em desenvolvimento: um aparelho da rede (celular) acessa o Supabase local pela porta do Vite, sem abrir o
    // Supabase CLI para a rede. O prefixo é o mesmo de LOCAL_SUPABASE_PROXY_PATH em src/config/dev-network.ts.
    proxy: {
      '/supabase-local': {
        target: SUPABASE_LOCAL,
        changeOrigin: true,
        rewrite: (caminho) => caminho.replace(/^\/supabase-local/, ''),
      },
    },
  },
});
