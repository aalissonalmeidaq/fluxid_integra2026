import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    // Suítes `.live.test.ts` exigem o Supabase local em execução e rodam por `npm run test:live`.
    exclude: ['tests/e2e/**', 'node_modules/**', '**/*.live.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
        // Regras de domínio e autorização exigem 95% em linhas, funções e branches (CA-012).
        'src/domain/**': { lines: 95, functions: 95, branches: 95, statements: 95 },
        'supabase/functions/_shared/profile-rules.ts': { lines: 95, functions: 95, branches: 95, statements: 95 },
      },
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
