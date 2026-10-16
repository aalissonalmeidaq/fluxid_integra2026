import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A PWA precisa abrir offline e não pode expor o IP das pessoas a terceiros a cada carga: fontes, imagens, scripts e folhas
// de estilo vêm do próprio aplicativo. Fontes ou imagens externas exigem decisão de spec (hospedagem própria, por exemplo).
const ROOT = path.resolve(import.meta.dirname, '../..');
// Exceção decidida na Spec 007 (mapas): blocos do mapa (tile.openstreetmap.org) e links de direitos e de abertura do mapa
// (www.openstreetmap.org). Nenhum dado de cadastro vai nessas requisições; só a região vista no mapa.
// Exceção decidida na Spec 011 (landing page): o domínio público do próprio projeto, usado nos metadados de compartilhamento do HTML base
// (canonical, og:url e og:image), que apontam para o próprio aplicativo e não carregam nada de terceiros.
const ALLOWED = [/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, /^https?:\/\/www\.w3\.org\//, /^https?:\/\/[^/]*example\.invalid/, /^https:\/\/(tile|www)\.openstreetmap\.org\//, /^https:\/\/fluxid\.tec\.br\//];
// Exceção decidida na Spec 011, só para o módulo de conteúdo da landing: os 8 links de materiais (Google Drive, GitHub e YouTube) são links de
// navegação, abertos só quando a pessoa os ativa; nada deles é carregado pela página. O tests/contract/landing-sem-terceiros.test.ts garante que
// nenhum outro arquivo da landing cita endereço externo e que o pacote gerado só cita esses hosts.
const ALLOWED_POR_ARQUIVO: Record<string, RegExp[]> = {
  [path.join('src', 'pages', 'landing', 'landing-content.ts')]: [/^https:\/\/(drive\.google\.com|github\.com|www\.youtube\.com|youtu\.be)\//],
  // Player dos vídeos da landing, montado só depois do clique em "Assistir" (Spec 011, adaptação ao pitch).
  [path.join('src', 'pages', 'landing', 'video-incorporado.ts')]: [/^https:\/\/www\.youtube-nocookie\.com\/embed\//],
};

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const CATALOGO = path.join(ROOT, 'catalogo');

const FILES = [
  path.join(ROOT, 'index.html'),
  // O catálogo de componentes (Spec 003) também não carrega nada de terceiros.
  ...(fs.existsSync(CATALOGO) ? walk(CATALOGO).filter((file) => /\.(tsx?|css|html)$/.test(file)) : []),
  // src/test guarda fixtures de teste, que não chegam ao navegador.
  ...walk(path.join(ROOT, 'src')).filter(
    (file) => /\.(tsx?|css|html)$/.test(file) && !/\.test\.tsx?$/.test(file) && !file.includes(path.join('src', 'test')),
  ),
];

// Varre os arquivos do projeto de forma síncrona: com a suíte inteira e a cobertura (v8) ligadas passa dos 5 s padrão.
describe('Recursos de terceiros no cliente', { timeout: 30_000 }, () => {
  it('há arquivos para varrer', () => {
    expect(FILES.length).toBeGreaterThan(10);
  });

  it('nenhum arquivo do cliente carrega fonte, imagem, script ou estilo de outro domínio', () => {
    const offenders = FILES.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s"'`)<>]+/g)]
        .map((match) => match[0])
        .filter((url) => !ALLOWED.some((pattern) => pattern.test(url)) && !(ALLOWED_POR_ARQUIVO[path.relative(ROOT, file)] ?? []).some((pattern) => pattern.test(url)))
        .map((url) => `${path.relative(ROOT, file)}: ${url}`),
    );
    expect(offenders).toEqual([]);
  });

  it('a fonte Montserrat vem de arquivo local empacotado, sem folha de estilo ou fonte remota (RF-003, RF-030)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'montserrat.css'), 'utf8');
    expect(css).toMatch(/montserrat-latin-wght-normal\.woff2/);
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).not.toMatch(/<link[^>]+rel=["']stylesheet["']/);
  });
});
