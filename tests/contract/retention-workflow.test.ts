import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// O agendador que aciona retention-storage-cleanup (contracts/retention-cleanup.md). Sem ele, a rotina do banco só enfileira
// e os avatares anonimizados permanecem no Storage (AUD-009). O teste vigia o que não pode regredir no workflow.
const FILE = path.resolve(import.meta.dirname, '../../.github/workflows/retention-cleanup.yml');
const workflow = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
const runBlocks = [...workflow.matchAll(/^\s+run:\s*\|?\s*\n?((?:[ \t]+.*\n?)+)/gm)].map((match) => match[1] ?? '').join('\n');

describe('Workflow agendado da limpeza de retenção', () => {
  it('existe em .github/workflows', () => {
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it('roda em agenda diária e sob demanda, e nunca em push ou pull request', () => {
    expect(workflow).toMatch(/^\s*schedule:/m);
    expect(workflow).toMatch(/cron:\s*'\d+ \d+ \* \* \*'/);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).not.toMatch(/^\s*(push|pull_request|pull_request_target):/m);
  });

  it('usa o segredo do repositório e o envia no cabeçalho esperado pela função', () => {
    expect(workflow).toMatch(/RETENTION_JOB_SECRET:\s*\$\{\{\s*secrets\.RETENTION_JOB_SECRET\s*\}\}/);
    expect(runBlocks).toMatch(/x-retention-secret:\s*\$\{?RETENTION_JOB_SECRET\}?/);
    expect(runBlocks).toMatch(/\/functions\/v1\/retention-storage-cleanup/);
  });

  it('nunca interpola segredo dentro do script: só pelo bloco env', () => {
    expect(runBlocks).not.toMatch(/\$\{\{\s*secrets\./);
    // Citar o nome da variável numa mensagem é permitido; ecoar a expansão ($RETENTION_JOB_SECRET) não é.
    expect(runBlocks).not.toMatch(/echo[^\n]*\$\{?RETENTION_JOB_SECRET/);
  });

  it('não traz valor de segredo, chave nem URL de projeto literais', () => {
    expect(workflow).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret_|sb_publishable_|https?:\/\/[a-z0-9]{10,}\.supabase\.co/i);
  });

  it('usa permissões mínimas e impede execuções sobrepostas', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(workflow).toMatch(/concurrency:\s*\n\s+group:/);
  });

  it('falha de forma visível quando faltam variáveis ou a função não responde 200', () => {
    expect(runBlocks).toMatch(/exit 1/);
    expect(runBlocks).toMatch(/CLEANUP_DONE/);
    expect(runBlocks).toMatch(/SUPABASE_CLOUD_URL/);
  });

  it('não imprime o corpo da resposta além das contagens', () => {
    expect(runBlocks).not.toMatch(/cat\s+"?\$?\{?RESPONSE/i);
    expect(runBlocks).toMatch(/removed/);
  });
});
