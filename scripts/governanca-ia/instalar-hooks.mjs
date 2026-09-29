import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
chmodSync('.githooks/pre-commit', 0o755);
if (existsSync('package.json')) {
  const pacote = JSON.parse(readFileSync('package.json', 'utf8'));
  pacote.scripts ??= {};
  pacote.scripts['ia:registro'] = 'node scripts/governanca-ia/gerar-registro-ia.mjs';
  pacote.scripts['ia:validar'] = 'node scripts/governanca-ia/validar-registro-ia.mjs --staged';
  pacote.scripts['ia:hooks'] = 'node scripts/governanca-ia/instalar-hooks.mjs';
  writeFileSync('package.json', JSON.stringify(pacote, null, 2) + '\n', 'utf8');
  console.log('Scripts ia:registro, ia:validar e ia:hooks adicionados ao package.json.');
} else {
  console.warn('package.json não encontrado; use os comandos node descritos no README.');
}
console.log('Hook de governança instalado em .githooks/pre-commit.');
