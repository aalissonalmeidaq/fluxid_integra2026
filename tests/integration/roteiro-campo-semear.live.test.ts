// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toSVG } from 'bwip-js/browser';
import { describe, it } from 'vitest';
import { callFunction, endAllSessions, login, logout } from '../support/auth-harness';
import { createEligibleCylinder, createSite, createWorld, GADMIN, manageCylinders, manageRegistry, manageTrips, planBody, TENANT_G } from '../support/trips-fixtures';

// Massa do roteiro em aparelho Android (Spec 009, T053): só roda com `npm run campo:semear-roteiro`. Cria, pelas funções reais e no
// Tenant G, as duas viagens planejadas do quickstart (4 e 10 cilindros), uma geocerca na primeira unidade, um cilindro com identificador
// desativado e outro inativo; no Tenant H cria o cilindro do teste de isolamento. Grava a folha de códigos em
// tests/support/tmp/roteiro-campo/codigos.html (fora do git) para imprimir ou abrir em outra tela. Dados fictícios.
const SAIDA = join(import.meta.dirname, '..', 'support', 'tmp', 'roteiro-campo');
const TENANT_H = '20000000-0000-0000-0000-000000000021';
const ADMIN_H = { email: 'reg-h-admin@example.invalid', password: 'Local-only-021!' };
const LAT = Number(process.env.ROTEIRO_LAT ?? '-23.5503');
const LNG = Number(process.env.ROTEIRO_LNG ?? '-46.6339');

interface Codigo { rotulo: string; valor: string; grupo: string }
const ok = (resposta: { status: number; body: unknown }, rotulo: string): Record<string, unknown> => {
  if (resposta.status !== 200) throw new Error(`${rotulo}: HTTP ${resposta.status} ${JSON.stringify(resposta.body)}`);
  return resposta.body as Record<string, unknown>;
};

describe.skipIf(process.env.E2E_SEMEAR_ROTEIRO !== '1')('Massa do roteiro em aparelho', () => {
  it('cria as viagens, a geocerca e os cilindros de teste', async () => {
    await endAllSessions(GADMIN);
    await endAllSessions(ADMIN_H);
    const sessaoG = await login(GADMIN);
    const sessaoH = await login(ADMIN_H);
    const tokenG = sessaoG.body.session.access_token as string;
    const tokenH = sessaoH.body.session.access_token as string;
    const codigos: Codigo[] = [];
    try {
      const mundo = await createWorld(tokenG);
      const segundaUnidade = await createSite(tokenG);
      ok(await manageRegistry(tokenG, {
        operation: 'create_geofence', organization_id: TENANT_G, site_id: mundo.siteId, name: 'Geocerca do roteiro', shape: 'circle', center: { lat: LAT, lng: LNG }, radius_m: 150,
      }), 'create_geofence');

      const quatro = [];
      for (let n = 0; n < 4; n += 1) quatro.push(await createEligibleCylinder(tokenG, mundo.typeId, 'ROT'));
      const viagemA = ok(await manageTrips(tokenG, planBody(mundo, [
        { site_id: mundo.siteId, cylinder_ids: [quatro[0]!.id, quatro[1]!.id] },
        { site_id: segundaUnidade.siteId, cylinder_ids: [quatro[2]!.id, quatro[3]!.id] },
      ])), 'viagem A');
      const rotuloA = `Viagem A (4 cilindros, 2 paradas)${viagemA.trip_number ? ` n.º ${String(viagemA.trip_number)}` : ''}`;
      quatro.forEach((c, n) => codigos.push({ rotulo: `${c.serial} (parada ${n < 2 ? 1 : 2})`, valor: c.identifier, grupo: rotuloA }));

      // Segunda viagem, de 10 cilindros, com outro veículo e outro motorista (o primeiro par já está na viagem A).
      const mundoB = await createWorld(tokenG);
      const dez = [];
      for (let n = 0; n < 10; n += 1) dez.push(await createEligibleCylinder(tokenG, mundoB.typeId, 'ROTDEZ'));
      const viagemB = ok(await manageTrips(tokenG, planBody(mundoB, [{ cylinder_ids: dez.map((c) => c.id) }])), 'viagem B');
      const rotuloB = `Viagem B (10 cilindros, cronômetro de MS-001)${viagemB.trip_number ? ` n.º ${String(viagemB.trip_number)}` : ''}`;
      dez.forEach((c) => codigos.push({ rotulo: c.serial, valor: c.identifier, grupo: rotuloB }));

      // Consulta: um ativo livre, um com identificador desativado (vale para o cilindro, que ganha outro) e um inativo.
      const livre = await createEligibleCylinder(tokenG, mundo.typeId, 'CONS');
      codigos.push({ rotulo: `${livre.serial} (ativo, na organização)`, valor: livre.identifier, grupo: 'Consulta (passo 11)' });
      const antigo = await createEligibleCylinder(tokenG, mundo.typeId, 'CONSDESAT');
      const novoValor = `${antigo.identifier}-NOVO`;
      ok(await manageCylinders(tokenG, { operation: 'add_identifier', organization_id: TENANT_G, cylinder_id: antigo.id, kind: 'data_matrix', value: novoValor }), 'add_identifier');
      const detalhe = ok(await callFunction('query-cylinders', { operation: 'get', organization_id: TENANT_G, cylinder_id: antigo.id }, tokenG), 'get cylinder') as { identifiers?: Array<{ id: string; value: string }> };
      const velho = detalhe.identifiers?.find((i) => i.value === antigo.identifier);
      if (!velho) throw new Error('identificador antigo não encontrado no detalhe do cilindro');
      ok(await manageCylinders(tokenG, { operation: 'deactivate_identifier', organization_id: TENANT_G, identifier_id: velho.id, justification: 'Etiqueta trocada na preparação do roteiro' }), 'deactivate_identifier');
      codigos.push({ rotulo: `${antigo.serial} (identificador DESATIVADO; o cilindro tem outro ativo)`, valor: antigo.identifier, grupo: 'Consulta (passo 11)' });
      codigos.push({ rotulo: `${antigo.serial} (identificador ativo, Data Matrix)`, valor: novoValor, grupo: 'Consulta (passo 11)' });
      const inativo = await createEligibleCylinder(tokenG, mundo.typeId, 'CONSINAT');
      ok(await manageCylinders(tokenG, { operation: 'inactivate', organization_id: TENANT_G, cylinder_id: inativo.id, reason: 'other', justification: 'Cilindro inativado na preparação do roteiro' }), 'inactivate');
      codigos.push({ rotulo: `${inativo.serial} (cilindro INATIVO)`, valor: inativo.identifier, grupo: 'Consulta (passo 11)' });

      // Tenant H: o cilindro do teste de isolamento (para o Tenant G tem de aparecer como "não encontrado").
      const sufixo = Date.now() % 100000;
      const tipoH = ok(await manageCylinders(tokenH, { operation: 'save_type', organization_id: TENANT_H, gas: `Gás roteiro ${Date.now()}`, capacity_value: 10, capacity_unit: 'l', classification: 'medicinal' }), 'tipo H');
      const valorH = `QR-OUTRO-TENANT-${sufixo}`;
      ok(await manageCylinders(tokenH, { operation: 'create', organization_id: TENANT_H, cylinder_type_id: tipoH.type_id, serial_number: `OUT-${sufixo}`, identifier: { kind: 'qr_code', value: valorH } }), 'cilindro H');
      codigos.push({ rotulo: 'Cilindro de OUTRA organização (Tenant H)', valor: valorH, grupo: 'Isolamento (passo 2): tem de dar "Cilindro não encontrado."' });
      codigos.push({ rotulo: 'Código inexistente', valor: 'QR-NAO-EXISTE-ROTEIRO', grupo: 'Isolamento (passo 2): tem de dar "Cilindro não encontrado."' });
    } finally {
      await logout(tokenG);
      await logout(tokenH);
      await endAllSessions(GADMIN);
      await endAllSessions(ADMIN_H);
    }

    mkdirSync(SAIDA, { recursive: true });
    const grupos = [...new Set(codigos.map((c) => c.grupo))];
    const cartao = (c: Codigo): string => `<figure><div class="q">${toSVG({ bcid: 'qrcode', text: c.valor, scale: 4, padding: 4 })}</div><figcaption><b>${c.rotulo}</b><br><code>${c.valor}</code></figcaption></figure>`;
    const html = [
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Códigos do roteiro</title>',
      '<style>body{font:14px sans-serif;margin:16px}h2{margin:24px 0 8px}section{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:190px;border:1px solid #888;padding:8px;break-inside:avoid}.q svg{width:150px;height:150px;display:block;margin:0 auto}code{font-size:11px;word-break:break-all}</style>',
      '<h1>Códigos do roteiro (Spec 009)</h1><p>Dados fictícios do ambiente local. Abra em outra tela ou imprima.</p>',
      ...grupos.map((g) => `<h2>${g}</h2><section>${codigos.filter((c) => c.grupo === g).map(cartao).join('')}</section>`),
    ].join('\n');
    writeFileSync(join(SAIDA, 'codigos.html'), html);
    writeFileSync(join(SAIDA, 'codigos.json'), JSON.stringify(codigos, null, 2));
    console.log(`\nFolha de códigos: ${join(SAIDA, 'codigos.html')}\nGeocerca de 150 m em ${LAT}, ${LNG} (parada 1 da viagem A).`);
  }, 600_000);
});
