import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertNonEmptyFunctionalDiff } from './registro-utils.mjs';

const RAIZ = process.cwd();
const DIR = join(RAIZ, 'docs', 'governanca-ia');
const REGISTROS = join(DIR, 'registros');
const TEMPLATE = join(DIR, 'template-registro-ia.md');
const INDICE = join(DIR, 'indice.md');

function git(args, fallback = '') {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch { return fallback; }
}

function argumentos() {
  const result = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    if (!process.argv[i].startsWith('--')) continue;
    const key = process.argv[i].slice(2);
    const value = process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i];
    result[key] = value ?? 'true';
  }
  return result;
}

function slug(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function proximoId() {
  const indice = readFileSync(INDICE, 'utf8');
  const fontes = [indice, ...readdirSync(REGISTROS)];
  const nums = fontes.flatMap((fonte) => {
    const ids = [...fonte.matchAll(/RIA-(?:\d{4}-)?(\d{3})/g)].map((match) => Number(match[1]));
    const legado = fonte.match(/^(\d{2})_.+\.docx$/i)?.[1];
    return legado ? [...ids, Number(legado)] : ids;
  });
  return `RIA-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

const a = argumentos();
for (const campo of ['spec', 'ciclo', 'titulo']) {
  if (!a[campo]) {
    console.error(`Uso: node gerar-registro-ia.mjs --spec NNN --ciclo NN --titulo "Título" [demais campos]`);
    process.exit(1);
  }
}
if (!existsSync(TEMPLATE) || !existsSync(INDICE)) {
  console.error('Estrutura docs/governanca-ia não encontrada.');
  process.exit(1);
}

const diff = git(['diff', '--cached', '--binary', '--', '.', ':(exclude)docs/governanca-ia']);
const arquivos = git(['diff', '--cached', '--name-only', '--', '.', ':(exclude)docs/governanca-ia'])
  .split('\n').filter(Boolean);
if (!arquivos.length) {
  console.error('Prepare primeiro os arquivos funcionais com git add; não há diff funcional no índice.');
  process.exit(1);
}

let diffHash;
try {
  diffHash = assertNonEmptyFunctionalDiff(diff);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível calcular o hash do diff funcional.');
  process.exit(1);
}

const agora = new Date();
const timestamp = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Fortaleza'
}).format(agora) + ' - America/Fortaleza';
const id = proximoId();
const arquivo = join(REGISTROS, `${id}-${slug(a.titulo)}.md`);
const repo = basename(git(['rev-parse', '--show-toplevel'], RAIZ));
const branch = git(['branch', '--show-current'], 'desconhecida');
const baseSha = git(['rev-parse', 'HEAD'], 'repositório sem commit');
const contemCodigo = arquivos.some((f) => /^(src|app|apps|packages|supabase|tests|e2e|public|design-system)\//.test(f)
  || /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config\.|tailwind\.config\.|tsconfig)/.test(f));
const resposta = a.resposta ?? a.resultado ?? 'PREENCHER antes do commit.';
const respostaComLink = contemCodigo
  ? `${resposta}\n\nLink para validação da equipe: ${a['link-validacao'] ?? 'PREENCHER com o PR, repositório ou branch antes do commit.'}`
  : resposta;

const valores = {
  ID: id, TITULO: a.titulo, TIMESTAMP: timestamp, REPOSITORIO: repo, BRANCH: branch,
  SPEC: a.spec, CICLO: a.ciclo, BASE_SHA: baseSha, DIFF_SHA256: diffHash,
  FERRAMENTA: a.ferramenta ?? 'Codex — modelo registrado pela plataforma',
  OBJETIVO: a.objetivo ?? 'PREENCHER antes do commit.',
  PROMPT: a.prompt ?? a.sintese ?? 'PREENCHER com uma síntese sanitizada antes do commit.',
  RESPOSTA: respostaComLink,
  VALIDACAO_HUMANA: a['validacao-humana'] ?? 'PREENCHER antes do commit.',
  JUSTIFICATIVA: a.justificativa ?? 'PREENCHER antes do commit.',
  FONTES: a.fontes ?? 'PREENCHER antes do commit ou declarar que não houve fonte externa.',
  ARQUIVOS: arquivos.map((f) => `- \`${f}\``).join('\n'),
  TESTES_COMANDOS: a['testes-comandos'] ?? 'PREENCHER antes do commit.',
  TESTES_RESULTADO: a['testes-resultado'] ?? 'PREENCHER com: aprovado',
  TESTES_EVIDENCIA: a['testes-evidencia'] ?? 'PREENCHER antes do commit.',
  ANALISE: a.analise ?? 'PREENCHER antes do commit.',
  REVISOR: a.revisor ?? 'PREENCHER antes do commit.',
  DECISAO: a.decisao ?? 'PREENCHER com: utilizado, adaptado ou descartado',
  DATA_VALIDACAO: a['data-validacao'] ?? 'PREENCHER antes do commit.',
  OBSERVACOES: a.observacoes ?? 'PREENCHER antes do commit.',
  PENDENCIAS: a.pendencias ?? 'Nenhuma pendência declarada.'
};

let conteudo = readFileSync(TEMPLATE, 'utf8');
for (const [chave, valor] of Object.entries(valores)) {
  conteudo = conteudo.replaceAll(`{{${chave}}}`, valor);
}
writeFileSync(arquivo, conteudo, 'utf8');

const artefato = `registros/${basename(arquivo)}`;
const linha = `| ${id} | ${timestamp} | ${a.spec} | ${a.ciclo} | ${a.titulo.replaceAll('|', '/')} | \`${artefato}\` | Pendente de validação |\n`;
let indice = readFileSync(INDICE, 'utf8');
const marcador = '> Este índice é atualizado automaticamente pelo gerador de registros.';
indice = indice.replace(marcador, `${linha}\n${marcador}`);
writeFileSync(INDICE, indice, 'utf8');

console.log(`Registro criado: ${arquivo}`);
console.log('Revise os campos PREENCHER, marque as verificações, use git add e execute a validação.');
