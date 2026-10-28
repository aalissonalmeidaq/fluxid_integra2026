import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { injetarModulosDaLanding } from './scripts/landing/pre-carregar-modulo.ts';

// Destino do repasse de desenvolvimento: o Supabase CLI desta máquina (mesmo valor de VITE_SUPABASE_LOCAL_URL).
const SUPABASE_LOCAL = loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321';

// `npm run dev:rede` (scripts/dev/rede-https.mjs) informa o certificado autoassinado de desenvolvimento; sem ele o servidor segue em HTTP.
const HTTPS_CHAVE = process.env.FLUXID_DEV_HTTPS_KEY;
const HTTPS_CERT = process.env.FLUXID_DEV_HTTPS_CERT;
const https = HTTPS_CHAVE && HTTPS_CERT ? { key: readFileSync(HTTPS_CHAVE), cert: readFileSync(HTTPS_CERT) } : undefined;

// Spec 015 (T130): no build, o index.html passa a pedir o módulo da landing junto com o pacote de entrada (orçamento de LCP da Spec 011).
const preCarregarLanding = (): Plugin => ({
  name: 'fluxid-pre-carregar-landing',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html, contexto) => injetarModulosDaLanding(html, contexto.bundle ?? {}, '/'),
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preCarregarLanding(),
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
        start_url: '/visao-geral',
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
        // A imagem de compartilhamento só serve a quem recebe o link; não precisa ficar guardada no aparelho (Spec 011).
        globIgnores: ['**/landing/og-fluxid.png'],
        navigateFallback: '/index.html',
        // Spec 012: notificações push do lacre (eventos `push` e `notificationclick`), sem cache de dados.
        importScripts: ['push-sw.js'],
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
    https,
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
