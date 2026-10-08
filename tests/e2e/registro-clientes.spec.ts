import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { addCustomer, syntheticCnpj } from './support/mock-registry-customers';

test.use({ serviceWorkers: 'block' });

// Os formulários de cadastro e edição abrem em modal sobre a lista ou o detalhe, que têm filtros com os mesmos rótulos.
const formulario = (page: Page) => page.getByRole('dialog');

// Spec 007, clientes e unidades (história 1 e história 2), com backend simulado. Cobre o cadastro com busca de CEP e seus
// cenários de falha, a consulta com busca, filtros e paginação, o isolamento entre organizações e as larguras dos projetos do
// Playwright. Os documentos usados são fictícios.
async function entrar(page: Page, perfil: PermissionProfile = 'cadastros-admin'): Promise<MockBackend> {
  const backend = new MockBackend().asProfile(perfil);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function cadastrarCliente(page: Page, nome: string, cnpj = '11.222.333/0001-81'): Promise<void> {
  await page.goto('/clientes/novo');
  await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar cliente' })).toBeVisible();
  await formulario(page).getByLabel('Tipo de pessoa').selectOption('legal');
  await formulario(page).getByLabel('CNPJ').fill(cnpj);
  await formulario(page).getByLabel('Razão social').fill(nome);
  await formulario(page).getByLabel('Segmento').selectOption('hospital');
  await page.getByRole('button', { name: 'Adicionar contato' }).click();
  await formulario(page).getByLabel('Nome', { exact: true }).fill('Maria Souza');
  await formulario(page).getByLabel('Telefone').fill('(11) 91234-5678');
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByRole('heading', { level: 2, name: nome })).toBeVisible();
}

async function abrirNovaUnidade(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Acrescentar a primeira unidade' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar unidade' })).toBeVisible();
  await formulario(page).getByLabel('Nome da unidade').fill('Matriz');
}

test.describe('Clientes: cadastro com unidade e CEP', () => {
  test('cadastra um cliente jurídico, acrescenta a unidade preenchendo o endereço pelo CEP e abre o detalhe', async ({ page }) => {
    const backend = await entrar(page);
    await cadastrarCliente(page, 'Hospital E2E Ltda');
    // Detalhe do cliente: CNPJ completo e contato com telefone para quem edita.
    await expect(page.getByText('11.222.333/0001-81')).toBeVisible();
    await expect(page.getByText('Maria Souza (principal)')).toBeVisible();
    await expect(page.getByText('Telefone: 11912345678')).toBeVisible();

    await abrirNovaUnidade(page);
    await formulario(page).getByLabel('CEP').fill('01001-000');
    await page.getByRole('button', { name: 'Buscar CEP' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Endereço preenchido pelo CEP' })).toBeVisible();
    await expect(formulario(page).getByLabel('Logradouro')).toHaveValue('Praça da Sé');
    await expect(formulario(page).getByLabel('Cidade')).toHaveValue('São Paulo');
    await expect(formulario(page).getByLabel('UF')).toHaveValue('SP');
    await expect(formulario(page).getByLabel('Número')).toBeFocused();
    await page.keyboard.type('100');
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    await expect(page.getByText(/Praça da Sé, 100 · Sé · São Paulo\/SP · CEP 01001-000/)).toBeVisible();
    // Só o CEP saiu para a consulta (CA-006).
    expect(backend.registry.postalRequests).toEqual(['01001000']);
  });

  test('cadastra um cliente pessoa física: o CPF aparece mascarado', async ({ page }) => {
    await entrar(page);
    await page.goto('/clientes/novo');
    await formulario(page).getByLabel('Tipo de pessoa').selectOption('individual');
    await formulario(page).getByLabel('CPF').fill('529.982.247-25');
    await formulario(page).getByLabel('Nome', { exact: true }).fill('Ana Lima Teste');
    await formulario(page).getByLabel('Segmento').selectOption('other');
    await formulario(page).getByLabel('Qual segmento?').fill('Consultório');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Ana Lima Teste' })).toBeVisible();
    await expect(page.getByText('***.***.***-25')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('52998224725');
  });

  test('documento repetido na organização é recusado com o nome do cliente existente, sem mostrar o documento', async ({ page }) => {
    await entrar(page);
    await cadastrarCliente(page, 'Primeiro Cliente Ltda');
    await page.goto('/clientes/novo');
    await formulario(page).getByLabel('Tipo de pessoa').selectOption('legal');
    await formulario(page).getByLabel('CNPJ').fill('11222333000181');
    await formulario(page).getByLabel('Razão social').fill('Segundo Cliente Ltda');
    await formulario(page).getByLabel('Segmento').selectOption('clinic');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await expect(page.getByText('Este documento já está cadastrado em Primeiro Cliente Ltda.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir o cliente que usa este documento' })).toBeVisible();
    await expect(page.getByLabel('CNPJ')).toBeFocused();
  });

  for (const [cenario, texto] of [
    ['not_found', 'CEP não encontrado. Digite o endereço.'],
    ['unavailable', 'Não foi possível buscar o CEP agora. Digite o endereço.'],
    ['rate_limited', /Muitas buscas em pouco tempo/],
  ] as const) {
    test(`CEP ${cenario}: o endereço é digitado inteiro e a unidade é salva`, async ({ page }) => {
      const backend = await entrar(page);
      await cadastrarCliente(page, `Cliente ${cenario} Ltda`, syntheticCnpj(900 + cenario.length));
      backend.registry.postalScenario = cenario === 'rate_limited' ? { kind: 'rate_limited', retryAfterSeconds: 30 } : { kind: cenario };
      await abrirNovaUnidade(page);
      await formulario(page).getByLabel('CEP').fill('01001000');
      await page.getByRole('button', { name: 'Buscar CEP' }).click();
      await expect(page.getByRole('status').filter({ hasText: texto })).toBeVisible();
      await formulario(page).getByLabel('Logradouro').fill('Rua Digitada');
      await formulario(page).getByLabel('Número', { exact: true }).fill('55');
      await formulario(page).getByLabel('Cidade').fill('Campinas');
      await formulario(page).getByLabel('UF').selectOption('SP');
      await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
      await expect(page.getByText(/Rua Digitada, 55/)).toBeVisible();
    });
  }

  test('CEP genérico (sem logradouro nem bairro): preenche o que veio e deixa o resto para digitação', async ({ page }) => {
    const backend = await entrar(page);
    await cadastrarCliente(page, 'Cliente CEP Genérico Ltda');
    backend.registry.postalScenario = { kind: 'generic' };
    await abrirNovaUnidade(page);
    await formulario(page).getByLabel('Logradouro').fill('Rua Que Eu Digitei');
    await formulario(page).getByLabel('CEP').fill('13000000');
    await page.getByRole('button', { name: 'Buscar CEP' }).click();
    await expect(formulario(page).getByLabel('Cidade')).toHaveValue('Cidade Genérica');
    await expect(formulario(page).getByLabel('Logradouro')).toHaveValue('Rua Que Eu Digitei');
    await expect(formulario(page).getByLabel('Bairro')).toHaveValue('');
  });

  test('busca as coordenadas pelo endereço, a pessoa confirma e o detalhe mostra a origem', async ({ page }) => {
    const backend = await entrar(page);
    await cadastrarCliente(page, 'Cliente Coordenadas Ltda', syntheticCnpj(910));
    await abrirNovaUnidade(page);
    await formulario(page).getByLabel('CEP').fill('01001-000');
    await page.getByRole('button', { name: 'Buscar CEP' }).click();
    await expect(formulario(page).getByLabel('Logradouro')).toHaveValue('Praça da Sé');
    await page.keyboard.type('100');
    await page.getByRole('button', { name: 'Buscar coordenadas' }).click();
    // Antes de consultar, o aviso do serviço externo exige a concordância explícita; nada saiu até aqui.
    await expect(page.getByText('O endereço será enviado ao serviço externo OpenStreetMap/Nominatim para obtenção das coordenadas. Use esta função apenas com endereços fictícios ou de unidades comerciais.')).toBeVisible();
    expect(backend.registry.geocodeRequests).toHaveLength(0);
    await page.getByRole('button', { name: 'Concordo e buscar coordenadas' }).click();
    await expect(formulario(page).getByLabel('Latitude')).toHaveValue('-23.550453');
    await expect(formulario(page).getByLabel('Longitude')).toHaveValue('-46.633911');
    await expect(page.getByText('Número exato')).toBeVisible();

    // Sem confirmar, o envio é recusado com o motivo em texto.
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
    await expect(page.getByText('Confirme o endereço e o ponto, ou apague as coordenadas.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto encontrados estão corretos.' }).check();
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    await expect(page.getByText(/Buscadas pelo endereço e confirmadas em/)).toBeVisible();
    await expect(page.getByText('Ainda sem confirmação do motorista')).toBeVisible();
    // Só campos de endereço saíram para a geocodificação (CA-018).
    expect(backend.registry.geocodeRequests).toHaveLength(1);
    expect(Object.keys(backend.registry.geocodeRequests[0] ?? {}).sort()).toEqual(['city', 'consent_confirmed', 'customer_id', 'number', 'organization_id', 'postal_code', 'state', 'street']);
  });

  test('a pessoa corrige o ponto no mapa antes de salvar e a unidade fica como informada à mão', async ({ page }) => {
    await entrar(page);
    await cadastrarCliente(page, 'Cliente Ponto Corrigido Ltda', syntheticCnpj(940));
    await abrirNovaUnidade(page);
    await formulario(page).getByLabel('CEP').fill('01001-000');
    await page.getByRole('button', { name: 'Buscar CEP' }).click();
    await expect(formulario(page).getByLabel('Logradouro')).toHaveValue('Praça da Sé');
    await page.keyboard.type('100');
    await page.getByRole('button', { name: 'Buscar coordenadas' }).click();
    await page.getByRole('button', { name: 'Concordo e buscar coordenadas' }).click();
    await expect(formulario(page).getByLabel('Latitude')).toHaveValue('-23.550453');

    // Clique no mapa move o ponto; a confirmação da busca deixa de valer e o aviso explica o efeito.
    await page.getByRole('group', { name: 'Mapa do ponto das coordenadas' }).click({ position: { x: 200, y: 110 } });
    await expect(formulario(page).getByLabel('Latitude')).not.toHaveValue('-23.550453');
    await expect(page.getByText(/O ponto foi corrigido à mão/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto encontrados estão corretos.' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    await expect(page.getByText(/Buscadas pelo endereço e confirmadas em/)).toHaveCount(0);
  });

  test('a Visão geral mostra no mapa as unidades com coordenadas e a lista alternativa em texto', async ({ page }) => {
    await entrar(page);
    await cadastrarCliente(page, 'Cliente Mapa Ltda', syntheticCnpj(930));
    await abrirNovaUnidade(page);
    await formulario(page).getByLabel('Logradouro').fill('Praça da Sé');
    await formulario(page).getByLabel('Número', { exact: true }).fill('100');
    await formulario(page).getByLabel('CEP').fill('01001000');
    await formulario(page).getByLabel('Cidade').fill('São Paulo');
    await formulario(page).getByLabel('UF').selectOption('SP');
    await page.getByRole('button', { name: 'Buscar coordenadas' }).click();
    await page.getByRole('button', { name: 'Concordo e buscar coordenadas' }).click();
    await page.getByRole('checkbox', { name: 'Confirmo que o endereço e o ponto encontrados estão corretos.' }).check();
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    // O detalhe mostra o mapa da unidade.
    await expect(page.getByRole('group', { name: 'Mapa da unidade Matriz' })).toBeVisible();

    await page.goto('/');
    const bloco = page.getByRole('region', { name: 'Cilindros e viagens no mapa' });
    await expect(bloco.getByRole('group', { name: 'Mapa das unidades dos clientes' })).toBeVisible();
    await expect(bloco).not.toContainText('Exemplo');
    await expect(bloco.locator('.fluxid-map-point')).toHaveCount(1);
    await expect(bloco).toContainText(/unidades? com coordenadas/);
    await bloco.getByText('Lista das unidades no mapa').click();
    await expect(bloco.getByRole('link', { name: 'Matriz' })).toBeVisible();
  });

  for (const [cenario, texto] of [
    ['not_found', 'Não encontramos este endereço'],
    ['unavailable', 'Não foi possível buscar as coordenadas agora'],
    ['rate_limited', /Muitas buscas em pouco tempo/],
    ['disabled', /desativada neste ambiente/],
    ['personal_blocked', /não está disponível para cadastro de pessoa física/],
  ] as const) {
    test(`coordenadas ${cenario}: a unidade é salva sem coordenadas`, async ({ page }) => {
      const backend = await entrar(page);
      await cadastrarCliente(page, `Cliente Geo ${cenario} Ltda`, syntheticCnpj(920 + cenario.length));
      backend.registry.geocodeScenario = cenario === 'rate_limited' ? { kind: 'rate_limited', retryAfterSeconds: 30 } : { kind: cenario };
      await abrirNovaUnidade(page);
      await formulario(page).getByLabel('Logradouro').fill('Rua Digitada');
      await formulario(page).getByLabel('Número', { exact: true }).fill('55');
      await formulario(page).getByLabel('CEP').fill('01001000');
      await formulario(page).getByLabel('Cidade').fill('Campinas');
      await formulario(page).getByLabel('UF').selectOption('SP');
      await page.getByRole('button', { name: 'Buscar coordenadas' }).click();
      await page.getByRole('button', { name: 'Concordo e buscar coordenadas' }).click();
      await expect(page.getByRole('status').filter({ hasText: texto })).toBeVisible();
      await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    });
  }

  test('sem conexão a busca de CEP e o envio ficam desabilitados e nada é guardado no aparelho', async ({ page, context }) => {
    await entrar(page);
    await cadastrarCliente(page, 'Cliente Offline Ltda');
    await abrirNovaUnidade(page);
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Buscar CEP' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Cadastrar unidade' })).toBeDisabled();
    await expect(page.getByText(/Dá para preencher o formulário/)).toBeVisible();
    // O formulário continua preenchível, e nenhum dado de cadastro foi guardado em armazenamento local.
    await formulario(page).getByLabel('Logradouro').fill('Rua Offline');
    const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(guardado).not.toContain('Rua Offline');
    await context.setOffline(false);
  });

  test('perda de conexão no meio do envio mostra "resultado desconhecido" e repetir não duplica o cliente', async ({ page }) => {
    const backend = await entrar(page);
    backend.registry.loseNextCommandResponse = true;
    await page.goto('/clientes/novo');
    await formulario(page).getByLabel('Tipo de pessoa').selectOption('legal');
    await formulario(page).getByLabel('CNPJ').fill('11222333000181');
    await formulario(page).getByLabel('Razão social').fill('Cliente Resposta Perdida Ltda');
    await formulario(page).getByLabel('Segmento').selectOption('hospital');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await expect(page.getByText('Resultado desconhecido')).toBeVisible();
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    // O cliente já existe: a unicidade do documento impede a duplicata e leva ao cadastro certo.
    await expect(page.getByText(/já está cadastrado em Cliente Resposta Perdida Ltda/)).toBeVisible();
    expect(backend.registry.customers.filter((customer) => customer.legal_name === 'Cliente Resposta Perdida Ltda' && customer.organization_id === ORG_A)).toHaveLength(1);
  });

  test('sem permissão de cadastro a rota nega o acesso e não mostra o formulário', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/clientes/novo');
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
    await expect(formulario(page).getByLabel('Tipo de pessoa')).toHaveCount(0);
  });
});

test.describe('Clientes: consulta (história 2)', () => {
  test('busca, filtros e paginação mantendo os filtros, e o Tenant B não aparece', async ({ page }) => {
    const backend = await entrar(page);
    // 40 clientes em A (2 inativos) e 22 em B: 62 clientes de duas organizações.
    for (let n = 4; n <= 40; n += 1) addCustomer(backend.registry, ORG_A, n, 'Cliente Exemplo', syntheticCnpj(n));
    for (let n = 3; n <= 22; n += 1) addCustomer(backend.registry, '20000000-0000-0000-0000-00000000000b', n, 'Cliente do Tenant B', syntheticCnpj(n));

    await page.goto('/clientes');
    await expect(page.getByRole('heading', { level: 2, name: 'Clientes da organização' })).toBeVisible();
    await expect(page.getByText('38 clientes encontrados')).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar mais clientes' }).click();
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 40' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Tenant B/ })).toHaveCount(0);

    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await expect(page.getByText('2 clientes encontrados')).toBeVisible();
    await page.getByLabel('Situação cadastral').selectOption('active');
    await page.getByLabel('Segmento').selectOption('hospital');
    await expect(page.getByText(/clientes encontrados/)).toBeVisible();
    await page.getByLabel('Segmento').selectOption('');

    await page.getByLabel('Buscar cliente').fill('exemplo 07');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 cliente encontrado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 07' })).toBeVisible();

    // Isolamento: a busca pelo nome do outro tenant não encontra nada.
    await page.getByLabel('Buscar cliente').fill('Tenant B');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Nenhum cliente encontrado')).toBeVisible();
    // E o detalhe de um cliente do outro tenant responde como se não existisse.
    await page.goto('/clientes/81000000-0000-4000-8000-000000000501');
    await expect(page.getByText('Cliente não encontrado')).toBeVisible();
  });

  test('a lista em 360 px vira cartões, sem rolagem horizontal', async ({ page }) => {
    await entrar(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/clientes');
    await expect(page.getByRole('link', { name: 'Cliente Exemplo 01' })).toBeVisible();
    await expect.poll(() => semRolagemHorizontal(page)).toBe(true);
  });

  test('o detalhe do cliente mostra as unidades e o auditor não vê telefone nem e-mail do contato', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/clientes');
    await page.getByRole('link', { name: 'Cliente Exemplo 01' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cliente Exemplo 01' })).toBeVisible();
    await expect(page.getByText('Contato 1')).toBeVisible();
    await expect(page.getByText(/Telefone:/)).toHaveCount(0);
    await expect(page.getByText(/E-mail:/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar cliente' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Matriz' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Matriz' })).toBeVisible();
    await expect(page.getByText('Segunda, Terça, Quarta, Quinta, Sexta, das 08:00 às 17:00')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Inativar e reativar sem apagar nada (história 6).
// ---------------------------------------------------------------------------------------------------------------------------------
const GEOFENCE_1 = '84000000-0000-4000-8000-000000009001';

function semearGeocerca(backend: MockBackend, id = GEOFENCE_1, nome = 'Portão do Cliente 01'): void {
  backend.registry.geofences.push({
    id, organization_id: ORG_A, site_id: SITE_1, name: nome, shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radius_m: 100, vertices: [], status: 'active', version: 1,
  });
}
const SITE_1 = '82000000-0000-4000-8000-000000000001';
const CLIENTE_1 = '81000000-0000-4000-8000-000000000001';

test.describe('Clientes: inativação em cascata e reativação (história 6)', () => {
  test('inativa o cliente com a prévia, confere a cascata e reativa só o cliente', async ({ page }) => {
    const backend = await entrar(page);
    semearGeocerca(backend);
    await page.goto(`/clientes/${CLIENTE_1}`);
    await page.getByRole('button', { name: 'Inativar cliente' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Inativar cliente' });
    await expect(dialogo).toContainText('1 unidade ativa e 1 geocerca ativa');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(dialogo.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Cliente encerrou o contrato');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText('Cliente inativado.')).toBeVisible();
    await expect(page.getByText('Situação cadastral: Inativo').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar cliente' })).toHaveCount(0);

    // A cascata atingiu a unidade e a geocerca, e nada foi apagado.
    expect(backend.registry.sites.find((site) => site.id === SITE_1)?.status).toBe('inactive');
    expect(backend.registry.geofences.find((geofence) => geofence.id === GEOFENCE_1)?.status).toBe('inactive');
    expect(backend.registry.customers.filter((customer) => customer.organization_id === ORG_A)).toHaveLength(3);
    await page.goto(`/clientes/${CLIENTE_1}/unidades/${SITE_1}`);
    await expect(page.getByText('Situação cadastral: Inativo').first()).toBeVisible();

    // Reativar o cliente não reativa a unidade; a unidade e a geocerca voltam à mão, nessa ordem.
    await page.goto(`/clientes/${CLIENTE_1}`);
    await page.getByRole('button', { name: 'Reativar cliente' }).click();
    await page.getByRole('dialog', { name: 'Reativar cliente' }).getByLabel('Justificativa').fill('Contrato retomado');
    await page.getByRole('dialog', { name: 'Reativar cliente' }).getByRole('button', { name: 'Confirmar reativação' }).click();
    await expect(page.getByText(/continuam inativas: reative cada uma à mão/)).toBeVisible();
    expect(backend.registry.sites.find((site) => site.id === SITE_1)?.status).toBe('inactive');

    await page.goto(`/geocercas/${GEOFENCE_1}`);
    await page.getByRole('button', { name: 'Reativar geocerca' }).click();
    await page.getByRole('dialog', { name: 'Reativar geocerca' }).getByLabel('Justificativa').fill('Voltou a valer');
    await page.getByRole('dialog', { name: 'Reativar geocerca' }).getByRole('button', { name: 'Confirmar reativação' }).click();
    await expect(page.getByText(/Reative primeiro o cadastro de origem/)).toBeVisible();
    await page.getByRole('dialog', { name: 'Reativar geocerca' }).getByRole('button', { name: 'Cancelar' }).click();

    await page.goto(`/clientes/${CLIENTE_1}/unidades/${SITE_1}`);
    await page.getByRole('button', { name: 'Reativar unidade' }).click();
    await page.getByRole('dialog', { name: 'Reativar unidade' }).getByLabel('Justificativa').fill('Unidade retomada');
    await page.getByRole('dialog', { name: 'Reativar unidade' }).getByRole('button', { name: 'Confirmar reativação' }).click();
    await expect(page.getByText(/Unidade reativada. As geocercas/)).toBeVisible();

    await page.goto(`/geocercas/${GEOFENCE_1}`);
    await page.getByRole('button', { name: 'Reativar geocerca' }).click();
    await page.getByRole('dialog', { name: 'Reativar geocerca' }).getByLabel('Justificativa').fill('Voltou a valer');
    await page.getByRole('dialog', { name: 'Reativar geocerca' }).getByRole('button', { name: 'Confirmar reativação' }).click();
    await expect(page.getByText('Geocerca reativada.')).toBeVisible();
  });

  test('se as quantidades mudam entre a prévia e a confirmação, o diálogo reabre com os números novos', async ({ page }) => {
    const backend = await entrar(page);
    semearGeocerca(backend);
    await page.goto(`/clientes/${CLIENTE_1}`);
    await page.getByRole('button', { name: 'Inativar cliente' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Inativar cliente' });
    await expect(dialogo).toContainText('1 unidade ativa e 1 geocerca ativa');
    semearGeocerca(backend, '84000000-0000-4000-8000-000000009002', 'Outra geocerca criada por outra pessoa');
    await dialogo.getByLabel('Justificativa').fill('Cliente encerrou o contrato');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText(/As quantidades mudaram desde a prévia/)).toBeVisible();
    await expect(dialogo).toContainText('1 unidade ativa e 2 geocercas ativas');
    expect(backend.registry.customers.find((customer) => customer.id === CLIENTE_1)?.status).toBe('active');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText('Cliente inativado.')).toBeVisible();
  });

  test('Escape fecha o diálogo sem inativar e devolve o foco ao botão', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto(`/clientes/${CLIENTE_1}`);
    const botao = page.getByRole('button', { name: 'Inativar cliente' });
    await botao.click();
    await expect(page.getByRole('dialog', { name: 'Inativar cliente' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(botao).toBeFocused();
    expect(backend.registry.customers.find((customer) => customer.id === CLIENTE_1)?.status).toBe('active');
  });

  test('o auditor não encontra inativar nem reativar', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto(`/clientes/${CLIENTE_1}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Cliente Exemplo 01' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Inativar|Reativar/ })).toHaveCount(0);
  });

  test('nenhuma tela oferece excluir', async ({ page }) => {
    await entrar(page);
    for (const caminho of ['/clientes', `/clientes/${CLIENTE_1}`, `/clientes/${CLIENTE_1}/unidades/${SITE_1}`, '/geocercas', '/veiculos', '/motoristas']) {
      await page.goto(caminho);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('button', { name: /excluir|apagar|deletar/i })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /excluir|apagar|deletar/i })).toHaveCount(0);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Anonimização de cliente pessoa física e de contato (história 8).
// ---------------------------------------------------------------------------------------------------------------------------------
async function preencherAnonimizacao(page: Page, justificativa = 'Pedido do titular dos dados'): Promise<void> {
  const dialogo = page.getByRole('dialog', { name: /Anonimizar dados pessoais/ });
  await dialogo.getByLabel('Motivo').selectOption('data_subject_request');
  await dialogo.getByLabel('Justificativa').fill(justificativa);
  await dialogo.getByLabel('Digite ANONIMIZAR para confirmar').fill('ANONIMIZAR');
}

test.describe('Anonimização de cliente e de contato', () => {
  test('cliente pessoa física: ativo bloqueia, inativo anonimiza e o contato e a unidade perdem os dados', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto('/clientes/novo');
    await formulario(page).getByLabel('Tipo de pessoa').selectOption('individual');
    await formulario(page).getByLabel('CPF').fill('529.982.247-25');
    await formulario(page).getByLabel('Nome', { exact: true }).fill('Ana Lima Sigilosa');
    await formulario(page).getByLabel('Segmento').selectOption('other');
    await formulario(page).getByLabel('Qual segmento?').fill('Consultório');
    await page.getByRole('button', { name: 'Adicionar contato' }).click();
    await formulario(page).getByLabel('Nome', { exact: true }).nth(1).fill('Paula Sigilosa');
    await formulario(page).getByLabel('Telefone').fill('11911112222');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Ana Lima Sigilosa' })).toBeVisible();

    // Ativo: desabilitado, com o motivo.
    await expect(page.getByRole('button', { name: 'Anonimizar dados pessoais' })).toBeDisabled();
    await expect(page.getByText('Inative o cliente antes de anonimizar.')).toBeVisible();

    // Inativa e anonimiza.
    await page.getByRole('button', { name: 'Inativar cliente' }).click();
    const inativar = page.getByRole('dialog', { name: 'Inativar cliente' });
    await inativar.getByLabel('Justificativa').fill('Cliente encerrou o contrato');
    await inativar.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText('Cliente inativado.')).toBeVisible();
    await page.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Anonimizar dados pessoais do cliente' });
    await expect(dialogo.getByRole('region', { name: 'O que será removido' })).toContainText('De todos os contatos');
    await preencherAnonimizacao(page);
    await dialogo.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cliente anonimizado' })).toBeVisible();
    await expect(page.getByText(/Dados pessoais anonimizados em/).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Ana Lima Sigilosa');
    await expect(page.locator('body')).not.toContainText('Paula Sigilosa');
    await expect(page.locator('body')).not.toContainText('11911112222');
    await expect(page.getByRole('link', { name: 'Editar cliente' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reativar cliente' })).toHaveCount(0);
    expect(backend.registry.customers.some((customer) => customer.legal_name === 'Cliente anonimizado' && customer.document_key === null)).toBe(true);
    expect(backend.registry.contacts.filter((contact) => contact.name === 'Contato anonimizado')).toHaveLength(1);
  });

  test('contato de cliente pessoa jurídica ativo: anonimiza o contato, que continua na lista com o nome fixo', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto(`/clientes/${CLIENTE_1}`);
    await expect(page.getByText('Contato 1 (principal)')).toBeVisible();
    await page.getByRole('button', { name: 'Anonimizar contato Contato 1' }).click();
    await preencherAnonimizacao(page, 'Prazo de retenção vencido');
    await page.getByRole('dialog').getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(page.getByText(/Contato anonimizado em/)).toBeVisible();
    await expect(page.getByText('Contato anonimizado', { exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('contato1@example.invalid');
    await expect(page.getByRole('heading', { level: 2, name: 'Cliente Exemplo 01' })).toBeVisible();
    expect(backend.registry.contacts.filter((contact) => contact.customer_id === CLIENTE_1)).toHaveLength(1);
  });

  test('o auditor não encontra a ação de anonimizar', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto(`/clientes/${CLIENTE_1}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Cliente Exemplo 01' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Anonimizar/ })).toHaveCount(0);
  });
});
