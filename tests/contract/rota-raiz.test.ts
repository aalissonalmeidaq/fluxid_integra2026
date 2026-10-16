// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCREENS, VISAO_GERAL, screenByPath } from '../../src/domain/navigation/screens';

// Spec 011, T004 (RF-004; contracts/rotas-e-pwa.md): a raiz "/" é da landing page pública; a Visão geral vive em "/visao-geral".
// Este contrato impede voltar a usar "/" como Visão geral em qualquer ponto do código do aplicativo.
const SRC = join(import.meta.dirname, '..', '..', 'src');

const arquivos = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome) ? [caminho] : [];
  });

// A varredura de src é síncrona: com a suíte inteira rodando passa dos 5 s padrão.
describe('Rota raiz da landing e Visão geral em /visao-geral', { timeout: 30_000 }, () => {
  it('a constante da Visão geral é /visao-geral e a tela "inicio" usa essa constante', () => {
    expect(VISAO_GERAL).toBe('/visao-geral');
    expect(screenByPath('/visao-geral')?.id).toBe('inicio');
    expect(SCREENS.find((screen) => screen.id === 'inicio')?.path).toBe(VISAO_GERAL);
  });

  it('nenhuma tela do catálogo ocupa a raiz: "/" é da landing', () => {
    expect(screenByPath('/')).toBeUndefined();
    expect(SCREENS.some((screen) => screen.path === '/')).toBe(false);
  });

  it('nenhum arquivo de src usa "/" como destino da Visão geral (href, assign ou ?recovery)', () => {
    const proibidos: Array<[RegExp, string]> = [
      [/href=["']\/["']/, 'href="/"'],
      [/(?:assign|replace)\(\s*['"`]\/['"`]\s*\)/, 'assign/replace("/")'],
      [/['"`]\/\?[a-z]/i, '"/?parametro"'],
    ];
    const achados: string[] = [];
    for (const arquivo of arquivos(SRC)) {
      // A própria landing é a única que pode citar a raiz (ex.: logotipo de volta ao topo).
      if (relative(SRC, arquivo).replaceAll('\\', '/').startsWith('pages/landing/')) continue;
      const texto = readFileSync(arquivo, 'utf8');
      for (const [regra, rotulo] of proibidos) if (regra.test(texto)) achados.push(`${relative(SRC, arquivo)}: ${rotulo}`);
    }
    expect(achados).toEqual([]);
  });

  it('o manifesto do PWA inicia em /visao-geral', () => {
    const config = readFileSync(join(import.meta.dirname, '..', '..', 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/start_url:\s*['"]\/visao-geral['"]/);
    expect(config).not.toMatch(/start_url:\s*['"]\/['"]/);
  });
});
