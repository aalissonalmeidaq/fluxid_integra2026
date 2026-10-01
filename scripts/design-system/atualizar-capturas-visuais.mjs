// Gera ou atualiza as capturas de referência da regressão visual (Spec 003, CA-008) no Linux, dentro do contêiner
// oficial do Playwright. A renderização da fonte difere por sistema operacional, então as capturas de referência nunca
// são geradas no Windows nem no macOS. Uso: npm run test:visual:atualizar
//
// O contêiner recebe uma cópia do repositório (sem node_modules, dist nem .git), instala as dependências do zero com
// `npm ci`, roda só o projeto visual-chromium com --update-snapshots, roda de novo só comparando (para provar que as
// capturas são reproduzíveis) e devolve as imagens para tests/e2e/visual.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pacote = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
const versao = String(pacote.devDependencies['@playwright/test']).replace(/^[^\d]*/, '');
const imagem = `mcr.microsoft.com/playwright:v${versao}-noble`;

const comandos = [
  'set -e',
  'mkdir /work',
  "tar -C /fonte --exclude=./node_modules --exclude=./dist --exclude=./dist-catalogo --exclude=./.git --exclude=./test-results --exclude=./playwright-report -cf - . | tar -C /work -xf -",
  'cd /work',
  'npm ci --no-audit --no-fund',
  'npx playwright test --project=visual-chromium --update-snapshots --reporter=line',
  // Segunda rodada, só comparando: garante que as capturas recém-geradas são reproduzíveis (sem variação entre execuções).
  'npx playwright test --project=visual-chromium --reporter=line',
  'cp -r /work/tests/e2e/visual/. /saida/',
].join(' && ');

console.log(`Gerando as capturas no Linux com ${imagem}. Isso leva alguns minutos.`);
const resultado = spawnSync(
  'docker',
  ['run', '--rm', '--ipc=host', '-e', 'CI=1', '-v', `${raiz}:/fonte:ro`, '-v', `${path.join(raiz, 'tests', 'e2e', 'visual')}:/saida`, imagem, 'bash', '-c', comandos],
  { stdio: 'inherit' },
);
if (resultado.status !== 0) {
  console.error('Não foi possível gerar as capturas. Confira se o Docker está em execução e leia a saída acima.');
  process.exit(resultado.status ?? 1);
}
console.log('Capturas atualizadas em tests/e2e/visual/*-snapshots. Revise as imagens e inclua a aprovação no pull request.');
