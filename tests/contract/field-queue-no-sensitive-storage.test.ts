// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 010 (RF-025, RNF-006, CA-004): nenhuma coordenada, nome de recebedor, foto, assinatura ou valor lido em localStorage, sessionStorage, cache de rede,
// URL, console ou log. Esses dados só existem em `local_outbox` e `local_attachments` e saem do aparelho na confirmação do servidor; `local_sync_conflicts` e
// `local_trips` nunca os guardam (só resumo sem dado sensível). Aqui se prova o lado do código; o lado do navegador está nos E2E.
const ROOT = path.resolve(import.meta.dirname, '../..');

function walk(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

const FIELD_DIRS = [
  'src/domain/field', 'src/application/field', 'src/app/field', 'src/infrastructure/attachments', 'src/infrastructure/synchronization', 'src/infrastructure/local-database',
  'src/pages/sync', 'src/application/trips',
];
const FIELD_FILES = FIELD_DIRS.flatMap(walk);
const SENSITIVE = /\b(recipient_name|recipientName|latitude|longitude|signature_png|signatureBytes|photoBytes)\b/;
const BROWSER_STORAGE = /\b(localStorage|sessionStorage|caches\.open|document\.cookie)\b/;
const CONSOLE = /\bconsole\s*\.\s*(log|info|warn|error|debug|trace)\b/;

describe('a fila e a viagem guardada não deixam dado sensível fora do lugar', () => {
  it('há código de campo para varrer', () => {
    expect(FIELD_FILES.length).toBeGreaterThan(10);
  });

  it.each(FIELD_FILES)('%s não escreve em console', (file) => {
    expect(read(file), `${file} usa console`).not.toMatch(CONSOLE);
  });

  it.each(FIELD_FILES)('%s não guarda dado sensível em localStorage, sessionStorage, cache ou cookie', (file) => {
    const text = read(file);
    if (!BROWSER_STORAGE.test(text)) return;
    // Só o identificador do aparelho e o relógio de confirmação usam o armazenamento do navegador, e nunca com dado de campo.
    expect(text, `${file} mistura armazenamento do navegador com dado sensível`).not.toMatch(SENSITIVE);
  });

  it('a cópia da viagem e o resumo do conflito têm lista fechada de campos, sem recebedor, coordenada, foto nem assinatura', () => {
    for (const file of ['src/domain/field/offline-trip.ts', 'src/application/field/offline-trip-store.ts']) {
      const text = read(file).replace(/\/\/.*$/gm, '');
      expect(text, `${file} guarda dado sensível`).not.toMatch(/\b(recipient_name|recipientName|signature|photo)\b/i);
    }
    // O resumo do conflito só diz "posição informada" e "recebedor informado" como sim ou não: nunca copia o valor.
    const summary = read('src/application/field/conflict-summary.ts');
    expect(summary).toMatch(/positionInformed/);
    expect(summary).toMatch(/recipientInformed/);
    expect(summary).not.toMatch(/summary\.(latitude|longitude|recipientName|recipient_name)/);
    // `recipient_name` só é lido para virar um sim ou não.
    expect(summary).toMatch(/recipientInformed = typeof payload\.recipient_name === 'string'/);
  });

  it('o armazenamento do navegador guarda só o identificador do aparelho e instantes', () => {
    const uses = FIELD_FILES.concat(walk('src/app')).filter((file) => BROWSER_STORAGE.test(read(file)));
    for (const file of uses) expect(read(file), `${file} usa armazenamento do navegador com dado de campo`).not.toMatch(SENSITIVE);
  });

  it('nenhum dado de campo vai em URL: as rotas do app e as chamadas ao servidor levam só identificadores opacos', () => {
    const routes = read('src/app/trips/trip-routes.ts');
    expect(routes).not.toMatch(SENSITIVE);
    const executors = read('src/infrastructure/synchronization/operation-executors.ts');
    // O corpo vai no POST; nunca em query string.
    expect(executors).not.toMatch(/\?\s*(latitude|longitude|recipient)/);
    expect(executors).not.toMatch(/encodeURIComponent\([^)]*(latitude|longitude|recipient)/);
  });
});
