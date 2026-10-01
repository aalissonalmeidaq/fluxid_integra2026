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
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
