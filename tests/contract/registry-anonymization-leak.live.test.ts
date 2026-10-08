// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { callFunction, endAllSessions, login, logout, publishableKey, restGet, supabaseUrl, type FunctionResponse } from '../support/auth-harness';
import { totp } from '../support/totp';
import { validateCnh } from '../../src/domain/registry/document-validation';
import { syntheticCnpj, syntheticCpf } from '../e2e/support/mock-registry-customers';

// Spec 007, US8 (CA-015, MS-009), contra o Supabase local real: cadastra e EDITA motorista, cliente pessoa física e contato com nome,
// documento, telefone e e-mail conhecidos (fictícios), anonimiza e procura todos os valores antigos, inclusive os de edições
// anteriores, em todas as tabelas legíveis de cadastro, nos eventos, na auditoria e em toda resposta de lista, detalhe e histórico.
// Exige o seed (Tenants G e H) e as funções query-registry e manage-registry carregadas (supabase stop/start).
const G = '20000000-0000-0000-0000-000000000020';
const H = '20000000-0000-0000-0000-000000000021';
const adminG = { email: 'reg-g-admin@example.invalid', password: 'Local-only-020!' };
const adminH = { email: 'reg-h-admin@example.invalid', password: 'Local-only-021!' };
const stockG = { email: 'reg-g-stock@example.invalid', password: 'Local-only-022!' };
const driverUserG = '10000000-0000-0000-0000-000000000023';

// Valores fictícios conhecidos, com documentos novos a cada execução (a base ao vivo não é desfeita entre as execuções). Cada valor deve
// desaparecer de tudo depois da anonimização.
const seed = Date.now() % 800_000;
const formatCpf = (cpf: string): string => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
function makeCnh(n: number): string {
  const base = String(100_000_000 + n).slice(0, 9);
  for (let dv1 = 0; dv1 < 10; dv1 += 1) for (let dv2 = 0; dv2 < 10; dv2 += 1) if (validateCnh(`${base}${dv1}${dv2}`)) return `${base}${dv1}${dv2}`;
  throw new Error('sem CNH válida para a semente');
}
const phone = (n: number): string => `119${String(n).padStart(8, '0')}`;
const DRIVER_CPF = syntheticCpf(seed);
const CUSTOMER_CPF = syntheticCpf(seed + 1);
const OLD = {
  driverName: `Joana Sigilosa Motorista ${seed}`, driverNameEdited: `Joana Sigilosa Silva Motorista ${seed}`, driverCpf: DRIVER_CPF, driverCpfFormatted: formatCpf(DRIVER_CPF), driverCnh: makeCnh(seed),
  driverPhone: phone(seed), driverPhoneEdited: phone(seed + 1),
  customerName: `Marcos Sigiloso Cliente ${seed}`, customerNameEdited: `Marcos Sigiloso Souza Cliente ${seed}`, customerTrade: `Marcos Fantasia Sigilosa ${seed}`, customerCpf: CUSTOMER_CPF, customerCpfFormatted: formatCpf(CUSTOMER_CPF),
  customerNotes: `Observação privada do Marcos ${seed}`, contactName: `Paula Sigilosa Contato ${seed}`, contactPhone: phone(seed + 2), contactEmail: `paula.sigilosa.${seed}@exemplo.invalid`,
  legalContactName: `Rita Sigilosa Compras ${seed}`, legalContactEmail: `rita.sigilosa.${seed}@exemplo.invalid`, legalContactPhone: `11${String(seed + 3).padStart(8, '0')}`,
  siteCompl: `Bloco Sigiloso 9 ${seed}`, siteContact: `Porteiro Sigiloso ${seed}`, siteAccess: `Chave com o Sigiloso ${seed}`,
};
const ALL_VALUES = Object.values(OLD);

const token = (response: FunctionResponse): string => response.body.session.access_token as string;
const manage = (accessToken: string, body: Record<string, unknown>) => callFunction('manage-registry', body, accessToken);
const query = (accessToken: string, body: Record<string, unknown>) => callFunction('query-registry', body, accessToken);

describe('Anonimização ao vivo: nenhum valor antigo resta (Spec 007)', () => {
  const elevated: Array<{ client: SupabaseClient; factorId: string }> = [];
  let a1 = ''; // administrador G, aal1
  let a2 = ''; // administrador G, aal2 (segundo fator)
  let h2 = '';
  let stock = '';
  const collected: string[] = [];

  async function elevate(session: { access_token: string; refresh_token: string }): Promise<string> {
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
    const factorId = enrolled.data!.id;
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data!.id, code: totp(enrolled.data!.totp.secret) });
    expect(verified.error).toBeNull();
    elevated.push({ client, factorId });
    return verified.data!.access_token;
  }

  // Tudo o que as funções devolvem entra na coleta, para a busca final.
  const keep = (response: FunctionResponse): FunctionResponse => { collected.push(JSON.stringify(response.body)); return response; };

  beforeAll(async () => {
    for (const user of [adminG, adminH, stockG]) await endAllSessions(user);
    // A sessão aal1 entra depois da elevação: subir uma sessão ao segundo fator não deve derrubar as outras, mas a ordem deixa o teste estável.
    const g2 = await login(adminG);
    const hh = await login(adminH);
    const st = await login(stockG);
    expect([g2.status, hh.status, st.status]).toEqual([200, 200, 200]);
    a2 = await elevate(g2.body.session);
    h2 = await elevate(hh.body.session);
    const g1 = await login(adminG);
    expect(g1.status).toBe(200);
    a1 = token(g1);
    stock = token(st);
    // Execuções anteriores podem ter deixado o usuário vinculável preso a outro motorista: solta o vínculo antes de começar.
    const linked = await query(a2, { operation: 'list_drivers', organization_id: G, status: 'all', linked: true, limit: 100 });
    for (const item of (linked.body.items ?? []) as Array<{ id: string }>) {
      await manage(a2, { operation: 'unlink_driver_user', organization_id: G, driver_id: item.id, justification: 'Limpeza da suíte ao vivo' });
    }
  });

  afterAll(async () => {
    const tokens: string[] = [a1, stock];
    for (const { client, factorId } of elevated) {
      tokens.push((await client.auth.getSession()).data.session?.access_token ?? '');
      await client.auth.mfa.unenroll({ factorId });
    }
    for (const accessToken of tokens.filter(Boolean)) await logout(accessToken);
    for (const user of [adminG, adminH, stockG]) await endAllSessions(user);
  });

  it('cadastra, edita, inativa e anonimiza motorista, cliente pessoa física e contato; depois nada identificável resta', async () => {
    // ----- motorista: cadastrar, editar (nome e telefone), vincular, inativar
    const driver = keep(await manage(a1, { operation: 'create_driver', organization_id: G, full_name: OLD.driverName, cpf: OLD.driverCpfFormatted, cnh_number: OLD.driverCnh, cnh_category: 'B', cnh_valid_until: '2031-06-30', phone: OLD.driverPhone }));
    expect(driver.status, JSON.stringify(driver.body)).toBe(200);
    const driverId = driver.body.driver_id as string;
    expect(keep(await manage(a1, { operation: 'update_driver', organization_id: G, driver_id: driverId, expected_version: 1, full_name: OLD.driverNameEdited, cnh_category: 'B', cnh_valid_until: '2031-06-30', phone: OLD.driverPhoneEdited })).status).toBe(200);
    expect(keep(await manage(a1, { operation: 'link_driver_user', organization_id: G, driver_id: driverId, user_id: driverUserG })).status).toBe(200);
    expect(keep(await manage(a1, { operation: 'inactivate_driver', organization_id: G, driver_id: driverId, justification: 'Desligado da empresa' })).status).toBe(200);

    // ----- cliente pessoa física: cadastrar com contatos, unidade e geocerca; editar; inativar em cascata
    const customer = keep(await manage(a1, {
      operation: 'create_customer', organization_id: G, person_type: 'individual', document: OLD.customerCpfFormatted, legal_name: OLD.customerName, trade_name: OLD.customerTrade, segment: 'other',
      segment_detail: 'Consultório', notes: OLD.customerNotes, contacts: [{ name: OLD.contactName, role: 'Titular', phone: OLD.contactPhone, email: OLD.contactEmail, is_primary: true }],
    }));
    expect(customer.status, JSON.stringify(customer.body)).toBe(200);
    const customerId = customer.body.customer_id as string;
    const site = keep(await manage(a1, {
      operation: 'create_site', organization_id: G, customer_id: customerId, name: 'Casa do Marcos', postal_code: '01001000', street: 'Praça da Sé', number: '321', complement: OLD.siteCompl,
      district: 'Sé', city: 'São Paulo', state: 'SP', latitude: -23.55052, longitude: -46.633308, receiving_contact_name: OLD.siteContact, receiving_contact_phone: OLD.contactPhone,
      receiving_days: [1, 2], receiving_from: '08:00', receiving_to: '17:00', access_instructions: OLD.siteAccess,
    }));
    expect(site.status, JSON.stringify(site.body)).toBe(200);
    expect(keep(await manage(a1, { operation: 'create_geofence', organization_id: G, site_id: site.body.site_id, name: 'Entrada', shape: 'circle', center: { lat: -23.55, lng: -46.63 }, radius_m: 100 })).status).toBe(200);
    expect(keep(await manage(a1, {
      operation: 'update_customer', organization_id: G, customer_id: customerId, expected_version: 1, legal_name: OLD.customerNameEdited, trade_name: OLD.customerTrade, segment: 'other', segment_detail: 'Consultório',
      notes: `${OLD.customerNotes} (editada)`, contacts: [{ name: OLD.contactName, role: 'Titular', phone: OLD.contactPhone, email: OLD.contactEmail, is_primary: true }],
    })).status).toBe(200);
    const preview = await query(a1, { operation: 'preview_customer_inactivation', organization_id: G, customer_id: customerId });
    expect(keep(await manage(a1, { operation: 'inactivate_customer', organization_id: G, customer_id: customerId, justification: 'Cliente encerrou', expected_counts: { sites: preview.body.sites, geofences: preview.body.geofences } })).status).toBe(200);

    // ----- cliente jurídico: o contato é anonimizado mesmo com o cliente ativo
    const legal = keep(await manage(a1, {
      operation: 'create_customer', organization_id: G, person_type: 'legal', document: syntheticCnpj(seed), legal_name: `Hospital Teste ${Date.now()}`, segment: 'hospital',
      contacts: [{ name: OLD.legalContactName, role: 'Compras', phone: OLD.legalContactPhone, email: OLD.legalContactEmail, is_primary: true }],
    }));
    expect(legal.status, JSON.stringify(legal.body)).toBe(200);
    // Esta leitura é anterior à anonimização e traz o contato com os valores, então não entra na coleta final.
    const legalDetail = (await query(a1, { operation: 'get_customer', organization_id: G, customer_id: legal.body.customer_id }));
    const legalContactId = legalDetail.body.contacts[0].id as string;

    // ----- sem segundo fator, nada é anonimizado
    const noMfa = await manage(a1, { operation: 'anonymize_driver', organization_id: G, driver_id: driverId, expected_version: 3, reason: 'data_subject_request', justification: 'Pedido do titular', confirmed: true });
    expect([noMfa.status, noMfa.body.code]).toEqual([403, 'MFA_REQUIRED']);
    // ----- quem não é administrador não anonimiza
    expect((await manage(stock, { operation: 'anonymize_driver', organization_id: G, driver_id: driverId, expected_version: 3, reason: 'data_subject_request', justification: 'Pedido do titular', confirmed: true })).status).toBe(403);
    // ----- outro tenant recebe o mesmo que para um registro inexistente
    const otherTenant = await manage(h2, { operation: 'anonymize_driver', organization_id: H, driver_id: driverId, expected_version: 3, reason: 'other', justification: 'Tentativa de outro tenant', confirmed: true });
    expect([otherTenant.status, otherTenant.body.code], JSON.stringify(otherTenant.body)).toEqual([404, 'NOT_FOUND']);
    // ----- confirmação ausente
    expect((await manage(a2, { operation: 'anonymize_driver', organization_id: G, driver_id: driverId, expected_version: 3, reason: 'other', justification: 'Sem confirmação de verdade' })).body.code).toBe('CONFIRMATION_REQUIRED');

    // ----- anonimizar com segundo fator
    const anonDriver = keep(await manage(a2, { operation: 'anonymize_driver', organization_id: G, driver_id: driverId, expected_version: 3, reason: 'data_subject_request', justification: 'Pedido do titular dos dados', confirmed: true }));
    expect(anonDriver.status, JSON.stringify(anonDriver.body)).toBe(200);
    const anonCustomer = keep(await manage(a2, { operation: 'anonymize_customer', organization_id: G, customer_id: customerId, expected_version: 3, reason: 'retention_expired', justification: 'Fim do prazo de retenção', confirmed: true }));
    expect(anonCustomer.status, JSON.stringify(anonCustomer.body)).toBe(200);
    const anonContact = keep(await manage(a2, { operation: 'anonymize_contact', organization_id: G, contact_id: legalContactId, reason: 'other', justification: 'Pedido do titular do contato', confirmed: true }));
    expect(anonContact.status, JSON.stringify(anonContact.body)).toBe(200);
    expect((await manage(a2, { operation: 'anonymize_driver', organization_id: G, driver_id: driverId, expected_version: 4, reason: 'other', justification: 'De novo', confirmed: true })).body.code).toBe('ALREADY_ANONYMIZED');
    expect((await manage(a2, { operation: 'update_driver', organization_id: G, driver_id: driverId, expected_version: 4, full_name: 'Outro Nome', cnh_category: 'B', cnh_valid_until: '2031-06-30' })).body.code).toBe('ANONYMIZED_RECORD');

    // ----- leituras depois da anonimização: detalhe, listas (inclusive inativos) e histórico das cinco áreas
    for (const body of [
      { operation: 'get_driver', organization_id: G, driver_id: driverId },
      { operation: 'get_customer', organization_id: G, customer_id: customerId },
      { operation: 'get_site', organization_id: G, site_id: site.body.site_id },
      { operation: 'list_drivers', organization_id: G, status: 'all' },
      { operation: 'list_customers', organization_id: G, status: 'all', limit: 100 },
      { operation: 'list_sites', organization_id: G, status: 'all' },
      { operation: 'list_geofences', organization_id: G, status: 'all' },
      { operation: 'history', organization_id: G, entity_type: 'driver', entity_id: driverId, order: 'asc', limit: 100 },
      { operation: 'history', organization_id: G, entity_type: 'customer', entity_id: customerId, order: 'asc', limit: 100 },
      { operation: 'history', organization_id: G, entity_type: 'site', entity_id: site.body.site_id, order: 'asc', limit: 100 },
      { operation: 'get_customer', organization_id: G, customer_id: legal.body.customer_id },
    ]) {
      const response = keep(await query(a2, body));
      expect(response.status, JSON.stringify(body)).toBe(200);
    }
    // A busca por qualquer valor antigo não encontra nada.
    for (const term of [OLD.driverName, OLD.driverCpf, OLD.driverCnh, OLD.customerName, OLD.customerCpf, OLD.contactName, OLD.customerTrade]) {
      expect((await query(a2, { operation: 'list_drivers', organization_id: G, status: 'all', search: term })).body.total, term).toBe(0);
      expect((await query(a2, { operation: 'list_customers', organization_id: G, status: 'all', search: term })).body.total, term).toBe(0);
    }
    // O registro continua listado como anonimizado, só nas visões de inativos e todos.
    const inactive = await query(a2, { operation: 'list_drivers', organization_id: G, status: 'inactive' });
    expect(inactive.body.items.map((item: { full_name: string }) => item.full_name)).toContain('Motorista anonimizado');
    const active = await query(a2, { operation: 'list_drivers', organization_id: G, status: 'active' });
    expect(JSON.stringify(active.body)).not.toContain('Motorista anonimizado');

    // ----- tabelas legíveis pelo administrador (RLS) e auditoria: nada do que foi digitado resta
    for (const table of ['drivers', 'customers', 'customer_contacts', 'customer_sites', 'geofences', 'registry_events']) {
      const rows = await restGet(`${table}?select=*&limit=1000`, a2);
      expect(rows.status, table).toBe(200);
      collected.push(JSON.stringify(rows.body));
    }
    for (const table of ['driver_documents', 'customer_documents']) {
      // Sem política de leitura: a tabela de documentos não entrega nada ao administrador.
      const rows = await restGet(`${table}?select=*&limit=10`, a2);
      expect([rows.status === 200 ? (rows.body as unknown[]).length : 0]).toEqual([0]);
    }
    const audit = await callFunction('query-audit', { scope: 'tenant', organization_id: G, limit: 100 }, a2);
    expect(audit.status).toBe(200);
    collected.push(JSON.stringify(audit.body));

    const text = collected.join('\n');
    const leaked = ALL_VALUES.filter((value) => text.includes(value));
    expect(leaked).toEqual([]);
    // O que deve permanecer: identificadores, textos fixos e a lista de campos afetados.
    expect(text).toContain('Motorista anonimizado');
    expect(text).toContain('Cliente anonimizado');
    expect(text).toContain('Contato anonimizado');
    expect(text).toContain('person_anonymized');
  });
});
