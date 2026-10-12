// @vitest-environment node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { endAllSessions, login, logout } from '../support/auth-harness';
import { createEligibleCylinder, createWorld, GADMIN, manageTrips, planBody, requestId, TENANT_G } from '../support/trips-fixtures';

// Semente da medição de campo em 4G (Spec 009, RNF-001 e RNF-002): só roda quando o Playwright a chama (E2E_SEMEAR_CAMPO=1). Planeja uma
// viagem do Tenant G com 10 cilindros, inicia o carregamento e grava em tests/support/tmp/campo-medicao.json (fora do git) a viagem, os
// identificadores a ler e a unidade da parada. Todos os dados são fictícios.
const SAIDA = join(import.meta.dirname, '..', 'support', 'tmp', 'campo-medicao.json');

describe.skipIf(process.env.E2E_SEMEAR_CAMPO !== '1')('Semente da medição de campo', () => {
  it('planeja a viagem de 10 cilindros e inicia o carregamento', async () => {
    await endAllSessions(GADMIN);
    const sessao = await login(GADMIN);
    const token = sessao.body.session.access_token as string;
    try {
      const world = await createWorld(token);
      const cilindros = [];
      for (let n = 0; n < 10; n += 1) cilindros.push(await createEligibleCylinder(token, world.typeId, 'CMP'));
      const plano = await manageTrips(token, planBody(world, [{ cylinder_ids: cilindros.map((c) => c.id) }]));
      if (plano.status !== 200) throw new Error(`create_trip: ${JSON.stringify(plano.body)}`);
      const tripId = plano.body.trip_id as string;
      const inicio = await manageTrips(token, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: 1 });
      if (inicio.status !== 200) throw new Error(`start_loading: ${JSON.stringify(inicio.body)}`);
      writeFileSync(SAIDA, JSON.stringify({ tripId, identifiers: cilindros.map((c) => c.identifier), serials: cilindros.map((c) => c.serial) }));
    } finally {
      await logout(token);
      await endAllSessions(GADMIN);
    }
  }, 180_000);
});
