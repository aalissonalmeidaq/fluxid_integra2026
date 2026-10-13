// Mede o aplicativo de campo em conexão 4G: a leitura de cilindros e a posição (Spec 009, RNF-001 e RNF-002) e a fila offline, as fotos e a assinatura (Spec 010,
// RNF-001 a RNF-004). Exige o Supabase local em execução (com as funções query-cylinders, query-trips, manage-trips e trip-attachments carregadas) e o .env.local.
// Cada grupo roda em uma chamada própria do Playwright: cada um semeia as suas viagens e entra com a mesma conta, e as sessões de um não podem encerrar as do outro.
import { spawnSync } from 'node:child_process';

let status = 0;
for (const grupo of ['Leitura de campo em 4G', 'Fila offline em 4G']) {
  const resultado = spawnSync('npx', ['playwright', 'test', 'tests/e2e/desempenho-campo-leitura.spec.ts', '--project=ao-vivo-4g', '-g', `"${grupo}"`], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, E2E_AO_VIVO: '1' },
  });
  status = status || (resultado.status ?? 1);
}
process.exit(status);
