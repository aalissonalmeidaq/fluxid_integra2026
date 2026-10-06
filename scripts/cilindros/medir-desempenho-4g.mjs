// Mede a primeira página da lista de cilindros com 50 mil cilindros em conexão 4G (Spec 006, RNF-002).
// Exige o Supabase local em execução (com as funções query-cylinders e manage-cylinders carregadas) e o .env.local.
import { spawnSync } from 'node:child_process';

const resultado = spawnSync('npx', ['playwright', 'test', 'tests/e2e/desempenho-lista-cilindros.spec.ts', '--project=ao-vivo-4g'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_AO_VIVO: '1' },
});
process.exit(resultado.status ?? 1);
