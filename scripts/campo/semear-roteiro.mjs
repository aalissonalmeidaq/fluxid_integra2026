// Cria a massa do roteiro em aparelho Android da Spec 009 (T053) no Supabase local e gera a folha de códigos.
// Uso: npm run campo:semear-roteiro   (opcional: ROTEIRO_LAT e ROTEIRO_LNG com a posição de quem testa, para a geocerca)
import { spawnSync } from 'node:child_process';

const resultado = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.live.config.ts', 'tests/integration/roteiro-campo-semear.live.test.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_SEMEAR_ROTEIRO: '1' },
});
process.exit(resultado.status ?? 1);
