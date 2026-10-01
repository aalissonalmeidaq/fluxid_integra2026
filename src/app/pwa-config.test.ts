import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Configuração PWA e Política de Cache (História 4)', () => {
  it('reprova qualquer regra de runtimeCaching que faça cache de dados do Supabase', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

    // Nenhuma regra de cache para rotas REST, Auth ou GraphQL pode existir no workbox
    expect(viteConfigContent).not.toMatch(/urlPattern:\s*.*\/rest\/v1/);
    expect(viteConfigContent).not.toMatch(/urlPattern:\s*.*\/graphql\/v1/);
    expect(viteConfigContent).not.toMatch(/urlPattern:\s*.*\/auth\/v1/);

    // Deve possuir denylist explícita para navegação e fallback
    expect(viteConfigContent).toContain('/^\\/rest\\/v1/');
    expect(viteConfigContent).toContain('/^\\/auth\\/v1/');
    expect(viteConfigContent).toContain('/^\\/graphql\\/v1/');
  });

  it('verifica que o manifest define display standalone e cores do sistema', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const viteConfigContent = fs.readFileSync(viteConfigPath, 'utf-8');

    expect(viteConfigContent).toContain("display: 'standalone'");
    expect(viteConfigContent).toContain("name: 'FluxID'");
    expect(viteConfigContent).toContain("short_name: 'FluxID'");
  });

  // Spec 003: identidade clara da prancha, sem o tema escuro anterior, e fonte local disponível offline (RNF-001).
  it('usa as cores da identidade FluxID no manifesto e na meta theme-color', () => {
    const viteConfig = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');

    expect(viteConfig).toContain("theme_color: '#1249B8'");
    expect(viteConfig).toContain("background_color: '#F3F7FA'");
    expect(viteConfig).not.toContain('#0f172a');
    expect(viteConfig).not.toContain('#020617');
    expect(indexHtml).toContain('<meta name="theme-color" content="#1249B8" />');
  });

  it('não mantém classes de tema escuro no corpo da página', () => {
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
    expect(indexHtml).not.toMatch(/bg-slate-900|text-slate-100/);
  });

  it('inclui fontes woff2 no precache para o primeiro uso offline', () => {
    const viteConfig = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toMatch(/globPatterns:\s*\['[^']*woff2[^']*'\]/);
  });
});
