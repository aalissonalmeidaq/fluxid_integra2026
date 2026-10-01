import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium' },
    },
    {
      name: 'tablet-webkit',
      use: { ...devices['iPad (gen 7)'], browserName: 'webkit' },
    },
    {
      name: 'mobile-360-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      ...process.env,
      VITE_SUPABASE_CONNECTION_MODE: 'local',
      VITE_SUPABASE_LOCAL_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY: 'chave-publica-exclusiva-para-e2e',
      VITE_SUPABASE_CONTRACT_VERSION: '002.1',
      VITE_SUPABASE_PROBE_TIMEOUT_MS: '500',
    },
  },
});
