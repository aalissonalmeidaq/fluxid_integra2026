// Mede a primeira página das listas de cadastros com o volume de referência em conexão 4G (Spec 007, RNF-002).
// Exige o Supabase local em execução (com as funções query-registry e manage-registry carregadas) e o .env.local.
import { spawnSync } from 'node:child_process';

const resultado = spawnSync('npx', ['playwright', 'test', 'tests/e2e/desempenho-lista-registro.spec.ts', '--project=ao-vivo-4g'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_AO_VIVO: '1' },
});
process.exit(resultado.status ?? 1);
