// Mede a leitura de cilindros e a posição em conexão 4G (Spec 009, RNF-001 e RNF-002).
// Exige o Supabase local em execução (com as funções query-cylinders, query-trips e manage-trips carregadas) e o .env.local.
import { spawnSync } from 'node:child_process';

const resultado = spawnSync('npx', ['playwright', 'test', 'tests/e2e/desempenho-campo-leitura.spec.ts', '--project=ao-vivo-4g'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_AO_VIVO: '1' },
});
process.exit(resultado.status ?? 1);
