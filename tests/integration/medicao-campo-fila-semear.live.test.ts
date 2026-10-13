// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { endAllSessions, login, logout } from '../support/auth-harness';
import { createEligibleCylinder, createSite, createWorld, GADMIN, manageTrips, planBody, queryTrips, requestId, TENANT_G } from '../support/trips-fixtures';

// Semente da medição da fila offline em 4G (Spec 010, RNF-001 a RNF-004): só roda quando o Playwright a chama (E2E_SEMEAR_FILA=1). Cria no Tenant G três viagens
// com veículo e motorista próprios: uma em carregamento com 10 cilindros em 3 paradas (as conferências entram na fila), uma em andamento com 10 cilindros em 3 paradas
// (3 chegadas e 3 entregas entram na fila) e uma em andamento com 1 parada (a entrega com 3 fotos e assinatura). Grava os dados em
// tests/support/tmp/campo-fila-medicao.json (fora do git). Todos os dados são fictícios.
const SAIDA = join(import.meta.dirname, '..', 'support', 'tmp', 'campo-fila-medicao.json');
const ok = (resposta: { status: number; body: unknown }, rotulo: string): Record<string, unknown> => {
  if (resposta.status !== 200) throw new Error(`${rotulo}: HTTP ${resposta.status} ${JSON.stringify(resposta.body)}`);
  return resposta.body as Record<string, unknown>;
};

describe.skipIf(process.env.E2E_SEMEAR_FILA !== '1')('Semente da medição da fila offline', () => {
  it('cria as três viagens da medição', async () => {
    await endAllSessions(GADMIN);
    const sessao = await login(GADMIN);
    const token = sessao.body.session.access_token as string;
    try {
      const viagem = async (paradas: number[], iniciar: boolean) => {
        const mundo = await createWorld(token);
        const unidades = [mundo.siteId];
        for (let n = 1; n < paradas.length; n += 1) unidades.push((await createSite(token)).siteId);
        const grupos = [];
        const serials: string[] = [];
        for (const [indice, quantidade] of paradas.entries()) {
          const ids: string[] = [];
          for (let n = 0; n < quantidade; n += 1) {
            const cilindro = await createEligibleCylinder(token, mundo.typeId, 'FIL');
            ids.push(cilindro.id);
            serials.push(cilindro.serial);
          }
          grupos.push({ site_id: unidades[indice]!, cylinder_ids: ids });
        }
        const plano = ok(await manageTrips(token, planBody(mundo, grupos)), 'create_trip');
        const tripId = String(plano.trip_id);
        const carregando = ok(await manageTrips(token, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: plano.version }), 'start_loading');
        if (iniciar) {
          const detalhe = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
          for (const item of detalhe.items as Array<{ id: string }>) ok(await manageTrips(token, { operation: 'check_item', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, item_id: item.id }), 'check_item');
          const pronta = ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
          ok(await manageTrips(token, { operation: 'start_trip', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: (pronta.trip as { version: number }).version }), 'start_trip');
        } else void carregando;
        return { tripId, serials };
      };
      const carregamento = await viagem([4, 3, 3], false);
      const andamento = await viagem([4, 3, 3], true);
      const entrega = await viagem([1], true);
      writeFileSync(SAIDA, JSON.stringify({ carregamento, andamento, entrega }));
    } finally {
      await logout(token);
      await endAllSessions(GADMIN);
    }
  }, 600_000);
});
