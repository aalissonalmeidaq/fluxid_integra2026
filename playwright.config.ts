import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Medição ao vivo (Spec 006, RNF-002): só roda com E2E_AO_VIVO=1, contra o Supabase local real, e usa as variáveis VITE_ de .env.local.
const AO_VIVO = process.env.E2E_AO_VIVO === '1';
const variaveisLocais = (): Record<string, string> => {
  try {
    const linhas = readFileSync('.env.local', 'utf8').split(/\r?\n/);
    return Object.fromEntries(linhas.filter((linha) => /^VITE_[A-Z_]+=/.test(linha)).map((linha) => [linha.slice(0, linha.indexOf('=')), linha.slice(linha.indexOf('=') + 1).trim()]));
  } catch {
    return {};
  }
};

const LARGURAS_DE_REFERENCIA =
  /(app-shell|auth-session|telas-transversais|teclado-e-contraste-de-foco|cores-forcadas|escalas-no-navegador|estados|navegacao-menu|entrada-renovada|visao-geral)\.spec\.ts$/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // As comparações de captura (Spec 003, CA-008) rodam só no projeto visual-chromium.
  // A medição de 50 mil cilindros (Spec 006) só roda no projeto ao-vivo-4g, com E2E_AO_VIVO=1.
  testIgnore: [/visual\/.*\.visual\.spec\.ts$/, /desempenho-lista-(cilindros|registro|viagens)\.spec\.ts$/],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' } },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    ...(AO_VIVO
      ? [{
          name: 'ao-vivo-4g',
          testMatch: /desempenho-lista-(cilindros|registro|viagens).spec.ts$/,
          testIgnore: [],
          timeout: 300_000,
          use: { browserName: 'chromium' as const, baseURL: 'http://localhost:4177', serviceWorkers: 'block' as const },
        }]
      : []),
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], browserName: 'chromium' },
    },
    {
      name: 'tablet-webkit',
      // As verificações transversais da Spec 003 usam emulação de cores forçadas, de teclado e de largura exata, que só
      // é confiável em Chromium; o iPad (810 px) também não é uma das larguras de referência.
      testIgnore: [/visual\/.*\.visual\.spec\.ts$/, /desempenho-lista-(cilindros|registro|viagens)\.spec\.ts$/, /(telas-transversais|teclado-e-contraste-de-foco|cores-forcadas|escalas-no-navegador|dispositivos)\.spec\.ts$/],
      use: { ...devices['iPad (gen 7)'], browserName: 'webkit' },
    },
    // Larguras de referência da Spec 003 (CA-001, CA-005): 768 e 1920 px em Chromium. Rodam só as verificações
    // transversais, para não repetir toda a suíte de comportamento da Spec 002 em cada largura.
    {
      name: 'tablet-768',
      testMatch: LARGURAS_DE_REFERENCIA,
      use: { browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1920',
      testMatch: LARGURAS_DE_REFERENCIA,
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 } },
    },
    // Linha de base visual (CA-008): só Chromium; as capturas de referência são do Linux (veja o quickstart).
    {
      name: 'visual-chromium',
      testMatch: /visual\/.*\.visual\.spec\.ts$/,
      testIgnore: [],
      use: { browserName: 'chromium' },
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
  webServer: [
    ...(AO_VIVO
      ? [{
          command: 'npx vite build --outDir dist-ao-vivo --emptyOutDir && npx vite preview --outDir dist-ao-vivo --port 4177',
          port: 4177,
          reuseExistingServer: false,
          timeout: 180_000,
          env: { ...process.env, ...variaveisLocais() } as Record<string, string>,
        }]
      : []),
    {
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
    // Catálogo do design system (Spec 003): build separado, servido em outra porta, só para desenvolvimento e CI.
    {
      command: 'npm run catalogo:build && npx vite preview --config vite.catalogo.config.ts --host 127.0.0.1 --port 4174',
      port: 4174,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
