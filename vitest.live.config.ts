import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Contrato e integração contra o Supabase local (Auth, Data API, Edge Functions e RLS).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.live.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // As suítes de cadastros da Spec 007 compartilham o administrador do Tenant G (limite de sessões e elevação a aal2 por usuário),
    // então os arquivos rodam um de cada vez.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
