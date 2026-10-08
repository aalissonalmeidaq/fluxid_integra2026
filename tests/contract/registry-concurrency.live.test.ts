// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout } from '../support/auth-harness';
import { syntheticCnpj, syntheticCpf } from '../e2e/support/mock-registry-customers';
import { validateCnh } from '../../src/domain/registry/document-validation';

// Spec 007, RNF-007 e RF-038, contra o Supabase local real: duas sessões concorrentes cadastrando o mesmo documento, a mesma placa e o
// mesmo CPF (uma vence, a outra recebe o conflito, sem duplicar); duas edições simultâneas (VERSION_CONFLICT); duas inativações
// simultâneas do mesmo cliente (ALREADY_INACTIVE) e a criação de unidade concorrente com a cascata (nunca sobra unidade ativa sob
// cliente inativo). Usa os Tenants G do seed e documentos novos a cada execução.
const G = '20000000-0000-0000-0000-000000000020';
const admin = { email: 'reg-g-admin@example.invalid', password: 'Local-only-020!' };
const seed = Date.now() % 800_000;
const manage = (accessToken: string, body: Record<string, unknown>) => callFunction('manage-registry', body, accessToken);
const query = (accessToken: string, body: Record<string, unknown>) => callFunction('query-registry', body, accessToken);

function makeCnh(n: number): string {
  const base = String(100_000_000 + n).slice(0, 9);
  for (let dv1 = 0; dv1 < 10; dv1 += 1) for (let dv2 = 0; dv2 < 10; dv2 += 1) if (validateCnh(`${base}${dv1}${dv2}`)) return `${base}${dv1}${dv2}`;
  throw new Error('sem CNH válida para a semente');
}
const plate = (n: number): string => `CC${String.fromCharCode(65 + (n % 26))}${(1000 + (n % 9000)).toString()}`;
const sorted = (...values: number[]): number[] => [...values].sort((a, b) => a - b);

describe('Concorrência dos cadastros ao vivo (Spec 007)', () => {
  let t1 = '';
  let t2 = '';

  beforeAll(async () => {
    await endAllSessions(admin);
    const [a, b] = [await login(admin), await login(admin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    t1 = a.body.session.access_token as string;
    t2 = b.body.session.access_token as string;
  });

  afterAll(async () => {
    for (const accessToken of [t1, t2]) if (accessToken) await logout(accessToken);
    await endAllSessions(admin);
  });

  const customerBody = (cnpj: string, name: string) => ({ operation: 'create_customer', organization_id: G, person_type: 'legal', document: cnpj, legal_name: name, segment: 'hospital' });

  it('o mesmo CNPJ cadastrado por duas sessões ao mesmo tempo: um vence e o outro recebe o conflito, sem duplicar', async () => {
    const cnpj = syntheticCnpj(seed);
    const [a, b] = await Promise.all([manage(t1, customerBody(cnpj, `Concorrência A ${seed}`)), manage(t2, customerBody(cnpj, `Concorrência B ${seed}`))]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('DOCUMENT_CONFLICT');
    expect(JSON.stringify(loser.body)).not.toContain(cnpj);
    const list = await query(t1, { operation: 'list_customers', organization_id: G, search: `concorrência`, status: 'all', limit: 100 });
    expect(list.body.items.filter((item: { legal_name: string }) => item.legal_name.endsWith(String(seed)))).toHaveLength(1);
  });

  it('a mesma placa cadastrada por duas sessões ao mesmo tempo: um vence', async () => {
    const body = { operation: 'create_vehicle', organization_id: G, plate: plate(seed), vehicle_type: 'truck', capacity_cylinders: 10 };
    const [a, b] = await Promise.all([manage(t1, body), manage(t2, body)]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('PLATE_CONFLICT');
    const list = await query(t1, { operation: 'list_vehicles', organization_id: G, status: 'all', search: plate(seed) });
    expect(list.body.total).toBe(1);
  });

  it('o mesmo CPF cadastrado em dois motoristas ao mesmo tempo: um vence; o CNH repetido também', async () => {
    const cpf = syntheticCpf(seed + 10);
    const first = (cnh: string) => ({ operation: 'create_driver', organization_id: G, full_name: `Motorista Concorrente ${seed}`, cpf, cnh_number: cnh, cnh_category: 'B', cnh_valid_until: '2031-01-31' });
    const [a, b] = await Promise.all([manage(t1, first(makeCnh(seed + 20))), manage(t2, first(makeCnh(seed + 21)))]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect([loser.body.code, loser.body.field]).toEqual(['DOCUMENT_CONFLICT', 'cpf']);
    expect(JSON.stringify(loser.body)).not.toContain(cpf);
    const cnh = makeCnh(seed + 30);
    const second = (document: string) => ({ operation: 'create_driver', organization_id: G, full_name: `Motorista Concorrente CNH ${seed}`, cpf: document, cnh_number: cnh, cnh_category: 'B', cnh_valid_until: '2031-01-31' });
    const [c, d] = await Promise.all([manage(t1, second(syntheticCpf(seed + 40))), manage(t2, second(syntheticCpf(seed + 41)))]);
    expect(sorted(c.status, d.status), JSON.stringify([c.body, d.body])).toEqual([200, 409]);
    expect((c.status === 409 ? c : d).body.field).toBe('cnh_number');
  });

  it('duas edições simultâneas com a mesma versão: uma é aceita e a outra recebe VERSION_CONFLICT', async () => {
    const created = await manage(t1, customerBody(syntheticCnpj(seed + 50), `Edição Concorrente ${seed}`));
    expect(created.status).toBe(200);
    const id = created.body.customer_id as string;
    const edit = (name: string) => ({ operation: 'update_customer', organization_id: G, customer_id: id, expected_version: 1, legal_name: name, segment: 'clinic' });
    const [a, b] = await Promise.all([manage(t1, edit(`Edição Um ${seed}`)), manage(t2, edit(`Edição Dois ${seed}`))]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('VERSION_CONFLICT');
    const detail = await query(t1, { operation: 'get_customer', organization_id: G, customer_id: id });
    expect(detail.body.customer.version).toBe(2);
  });

  it('duas inativações simultâneas do mesmo cliente: uma vence e a outra recebe ALREADY_INACTIVE (ou CASCADE_CHANGED, nunca duas vezes)', async () => {
    const created = await manage(t1, customerBody(syntheticCnpj(seed + 60), `Inativação Concorrente ${seed}`));
    const id = created.body.customer_id as string;
    const body = { operation: 'inactivate_customer', organization_id: G, customer_id: id, justification: 'Teste de concorrência', expected_counts: { sites: 0, geofences: 0 } };
    const [a, b] = await Promise.all([manage(t1, body), manage(t2, body)]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('ALREADY_INACTIVE');
    const history = await query(t1, { operation: 'history', organization_id: G, entity_type: 'customer', entity_id: id, event_type: 'customer_inactivated' });
    expect(history.body.events).toHaveLength(1);
  });

  it('criar unidade ao mesmo tempo que a cascata nunca deixa unidade ativa sob cliente inativo', async () => {
    for (let round = 0; round < 5; round += 1) {
      const created = await manage(t1, customerBody(syntheticCnpj(seed + 100 + round), `Cascata Concorrente ${seed} ${round}`));
      const id = created.body.customer_id as string;
      const site = {
        operation: 'create_site', organization_id: G, customer_id: id, name: 'Unidade nova', postal_code: '01001000', street: 'Praça da Sé', number: '1', city: 'São Paulo', state: 'SP',
      };
      const cascade = { operation: 'inactivate_customer', organization_id: G, customer_id: id, justification: 'Teste de cascata concorrente', expected_counts: { sites: 0, geofences: 0 } };
      const [a, b] = await Promise.all([manage(t1, site), manage(t2, cascade)]);
      // Resultados possíveis: a unidade nasceu antes (a cascata vê 1 unidade e recusa por CASCADE_CHANGED) ou a cascata veio antes (a
      // unidade recebe PARENT_INACTIVE). Em qualquer caso, a regra de ouro vale.
      expect([a.status, a.body.code, b.status, b.body.code], JSON.stringify([a.body, b.body])).toSatisfy((outcome: unknown[]) =>
        (outcome[0] === 200 && (outcome[2] === 200 || outcome[3] === 'CASCADE_CHANGED')) || (outcome[0] === 409 && outcome[1] === 'PARENT_INACTIVE' && outcome[2] === 200));
      const detail = await query(t1, { operation: 'get_customer', organization_id: G, customer_id: id });
      const inactive = detail.body.customer.status === 'inactive';
      const activeSites = (detail.body.sites as Array<{ status: string }>).filter((item) => item.status === 'active');
      expect(inactive && activeSites.length > 0, `rodada ${round}: cliente inativo com unidade ativa`).toBe(false);
    }
  });
});
