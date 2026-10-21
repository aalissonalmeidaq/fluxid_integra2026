import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 014 (RF-017): a rotina diária que restaura a demonstração. O teste vigia o que não pode regredir no workflow.
const FILE = path.resolve(import.meta.dirname, '../../.github/workflows/restaurar-demonstracao.yml');
const workflow = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n') : '';
// Cada bloco `run` vai até a primeira linha com indentação menor ou igual à do próprio `run:` (há vários passos neste workflow).
function blocosRun(texto: string): string {
  const linhas = texto.split('\n');
  const blocos: string[] = [];
  linhas.forEach((linha, indice) => {
    const inicio = /^(\s*)(?:- )?run:\s*(.*)$/.exec(linha);
    if (!inicio) return;
    const recuo = inicio[1]!.length;
    const corpo = [inicio[2]!];
    for (const seguinte of linhas.slice(indice + 1)) {
      if (seguinte.trim() !== '' && seguinte.length - seguinte.trimStart().length <= recuo) break;
      corpo.push(seguinte);
    }
    blocos.push(corpo.join('\n'));
  });
  return blocos.join('\n');
}
const runBlocks = blocosRun(workflow);

describe('Workflow da restauração diária da demonstração', () => {
  it('roda às 06:23 UTC (03:23 de Brasília) e sob demanda, nunca em push ou pull request', () => {
    expect(workflow).toMatch(/cron:\s*'23 6 \* \* \*'/);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|pull_request_target):/m);
  });

  it('lê a URL da variável e a chave do segredo, e roda o script da demonstração', () => {
    expect(workflow).toMatch(/SUPABASE_URL:\s*\$\{\{\s*vars\.SUPABASE_CLOUD_URL\s*\}\}/);
    expect(workflow).toMatch(/SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/);
    expect(runBlocks).toMatch(/npm run --silent operacao:demonstracao/);
  });

  it('sem o segredo, falha explicando o que cadastrar, antes de tentar qualquer coisa', () => {
    expect(runBlocks).toMatch(/::error::Cadastre a variável SUPABASE_CLOUD_URL e o segredo SUPABASE_SERVICE_ROLE_KEY/);
    expect(workflow.indexOf('::error::')).toBeLessThan(workflow.indexOf('npm ci'));
  });

  it('nunca interpola nem ecoa o segredo no script, e não traz chave nem URL literais', () => {
    expect(runBlocks).not.toMatch(/\$\{\{\s*secrets\./);
    expect(runBlocks).not.toMatch(/echo[^\n]*\$\{?SUPABASE_SERVICE_ROLE_KEY/);
    expect(workflow).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret_|https?:\/\/[a-z0-9]{10,}\.supabase\.co/i);
  });

  it('usa permissões mínimas e impede execuções sobrepostas', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toMatch(/concurrency:\s*\n\s+group:\s*restaurar-demonstracao\s*\n\s+cancel-in-progress:\s*false/);
  });
});
