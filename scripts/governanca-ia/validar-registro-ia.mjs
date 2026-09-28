import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isValidFunctionalDiffHash } from './registro-utils.mjs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
const diffArgs = base ? ['diff', `${base}...HEAD`] : ['diff', '--cached'];
const nomes = (extra = []) => git([...diffArgs, ...extra, '--name-only']).split('\n').filter(Boolean);
const alterados = nomes();
const relevantes = alterados.filter((f) => /^(src|app|apps|packages|supabase|specs|tests|e2e|public|design-system)\//.test(f)
  || /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|vite\.config\.|tailwind\.config\.|tsconfig)/.test(f));

if (!relevantes.length) {
  console.log('Gate de IA: nenhuma alteração funcional neste conjunto.');
  process.exit(0);
}

const novos = nomes(['--diff-filter=AM']).filter((f) => /^docs\/governanca-ia\/registros\/RIA-(?:\d{4}-)?\d{3}-.+\.md$/.test(f));
const erros = [];
if (!novos.length) erros.push('adicione ou atualize ao menos um RIA para o ciclo');
if (!alterados.includes('docs/governanca-ia/indice.md')) erros.push('atualize docs/governanca-ia/indice.md');
const indice = readFileSync('docs/governanca-ia/indice.md', 'utf8');

for (const path of novos) {
  const texto = readFileSync(path, 'utf8');
  const id = path.match(/(RIA-(?:\d{4}-)?\d{3})-/)?.[1];
  if (texto.includes('PREENCHER')) erros.push(`${path}: existem campos PREENCHER`);
  const diffHash = texto.match(/- Hash do diff funcional preparado:\s*([a-f0-9]{64})\b/i)?.[1] ?? '';
  if (!isValidFunctionalDiffHash(diffHash)) {
    erros.push(`${path}: hash do diff funcional ausente, inválido ou vazio`);
  }
  if (!/- Resultado:\s*aprovado\b/im.test(texto)) erros.push(`${path}: resultado dos testes deve ser aprovado`);
  if (!/- Decisão final:\s*(?:utilizado|adaptado|descartado)\b/im.test(texto)) erros.push(`${path}: decisão humana deve ser utilizado, adaptado ou descartado`);
  if ((texto.match(/- \[x\]/gi) ?? []).length < 10) erros.push(`${path}: conclua o checklist final de uso responsável, incluindo linguagem natural e link de revisão quando houver código`);
  const resposta = texto.match(/- Resposta gerada pela IA:\s*([\s\S]*?)(?=\n- Análise crítica da equipe:)/i)?.[1] ?? '';
  if (relevantes.length && !/https?:\/\/[^\s)>]+/i.test(resposta)) erros.push(`${path}: a resposta deve conter link para o PR, repositório ou branch`);
  const linhaIndice = indice.split('\n').find((linha) => id && linha.includes(`| ${id} |`));
  if (!linhaIndice) erros.push(`${path}: registro ausente do índice`);
  else if (!/\|\s*(?:Utilizado|Adaptado|Descartado)(?: com ressalvas)?\s*\|?\s*$/i.test(linhaIndice)) erros.push(`${path}: registre a decisão final no índice`);
  for (const titulo of ['## Registro da interação', '## Rastreabilidade técnica do ciclo', '## Testes e evidências', '## Decisões e dados pendentes', '## Validação humana', '## Checklist final']) {
    if (!texto.includes(titulo)) erros.push(`${path}: seção ausente: ${titulo}`);
  }
  if (/(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|SUPABASE_SERVICE_ROLE_KEY\s*=|\bsk-[A-Za-z0-9_-]{20,})/.test(texto)) {
    erros.push(`${path}: possível segredo detectado`);
  }
}

if (erros.length) {
  console.error('Gate de governança de IA reprovado:\n- ' + erros.join('\n- '));
  process.exit(1);
}
console.log(`Gate de governança de IA aprovado (${novos.length} registro(s)).`);
