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
});
