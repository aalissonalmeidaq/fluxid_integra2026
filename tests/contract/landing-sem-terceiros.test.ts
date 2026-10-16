// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 011, T032 (RNF-007, RNF-009): a landing não carrega nenhum recurso de terceiros na abertura (sem iframe, script, fonte ou imagem
// remota, sem rastreador) e nenhuma URL externa existe fora da lista de materiais de landing-content.ts. Adaptação ao pitch: os vídeos
// tocam na própria página, então há uma única exceção: o player incorporado do YouTube (youtube-nocookie.com), montado em
// video-destaque.tsx só depois que a pessoa toca em "Assistir" (em-acao.test.tsx), com o endereço montado em video-incorporado.ts.
const PLAYER = 'video-destaque.tsx';
const ENDERECO_DO_PLAYER = 'video-incorporado.ts';
const RAIZ = join(import.meta.dirname, '..', '..');
const LANDING = join(RAIZ, 'src', 'pages', 'landing');

const arquivos = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });

const fontes = arquivos(LANDING).filter((arquivo) => /\.(ts|tsx|css)$/.test(arquivo) && !/\.test\./.test(arquivo));

describe('Landing sem recursos de terceiros', () => {
  it('há código da landing para verificar', () => {
    expect(fontes.length).toBeGreaterThan(10);
  });

  it('nenhum arquivo cria iframe, script, embed, vídeo ou chama a rede', () => {
    const achados: string[] = [];
    for (const arquivo of fontes) {
      const texto = readFileSync(arquivo, 'utf8');
      const permitidos = arquivo.endsWith(PLAYER) ? ['iframe'] : [];
      for (const achado of texto.matchAll(/<(iframe|script|embed|object|video|audio)\b/gi)) {
        if (!permitidos.includes((achado[1] ?? '').toLowerCase())) achados.push(`${relative(RAIZ, arquivo)}: elemento de terceiros`);
      }
      if (/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|new\s+WebSocket|new\s+EventSource/.test(texto)) achados.push(`${relative(RAIZ, arquivo)}: chamada de rede`);
      if (/@import\s+url|url\(\s*['"]?https?:/i.test(texto)) achados.push(`${relative(RAIZ, arquivo)}: CSS remoto`);
    }
    expect(achados).toEqual([]);
  });

  it('só landing-content.ts contém endereços http(s) (os links de materiais); o resto da landing não', () => {
    const achados: string[] = [];
    for (const arquivo of fontes) {
      if (arquivo.endsWith('landing-content.ts')) continue;
      const texto = readFileSync(arquivo, 'utf8');
      // O namespace do SVG não é um recurso remoto.
      let semNamespace = texto.replaceAll('http://www.w3.org/2000/svg', '');
      if (arquivo.endsWith(ENDERECO_DO_PLAYER)) semNamespace = semNamespace.replaceAll('https://www.youtube-nocookie.com/embed/', '');
      if (/https?:\/\//i.test(semNamespace)) achados.push(relative(RAIZ, arquivo));
    }
    expect(achados).toEqual([]);
  });

  it('o HTML base não carrega script, fonte, folha de estilo nem rastreador de terceiros', () => {
    const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
    // O link canônico (rel="canonical") só informa o endereço da página; não carrega recurso nenhum.
    const externos = [...html.matchAll(/<(script|link)\b[^>]*(?:src|href)=["'](https?:)?\/\/[^"']+["'][^>]*>/gi)].map((m) => m[0]).filter((marca) => !/rel=["']canonical["']/i.test(marca));
    expect(externos).toEqual([]);
    expect(html).not.toMatch(/google-analytics|googletagmanager|gtag\(|hotjar|facebook\.net|clarity\.ms|segment\.com|mixpanel/i);
  });

  it('o pacote gerado da landing (quando existe dist) só cita hosts permitidos', () => {
    const assets = join(RAIZ, 'dist', 'assets');
    if (!existsSync(assets)) return;
    const permitidos = ['drive.google.com', 'github.com', 'www.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'www.w3.org', 'react.dev'];
    const pacotes = readdirSync(assets).filter((nome) => /^landing-page-.*\.(js|css)$/.test(nome));
    const hosts = new Set<string>();
    for (const nome of pacotes) {
      const texto = readFileSync(join(assets, nome), 'utf8');
      for (const m of texto.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) hosts.add((m[1] ?? '').toLowerCase());
    }
    expect([...hosts].filter((host) => !permitidos.includes(host))).toEqual([]);
  });
});
