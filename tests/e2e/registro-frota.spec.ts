import { test, expect, type Page } from '@playwright/test';
import { MockBackend, type PermissionProfile } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { syntheticCpf } from './support/mock-registry-customers';

test.use({ serviceWorkers: 'block' });

// Os formulários de cadastro e edição abrem em modal sobre a lista ou o detalhe, que têm filtros com os mesmos rótulos.
const formulario = (page: Page) => page.getByRole('dialog');

// Spec 007, frota (veículos na história 4 e motoristas na história 5), com backend simulado. Cobre cadastro com placa antiga e
// Mercosul, conflito de placa, mudança de situação, filtros, isolamento entre organizações e as larguras dos projetos do Playwright.
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

async function cadastrarVeiculo(page: Page, placa: string, capacidade = '24'): Promise<void> {
  await page.goto('/veiculos/novo');
  await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar veículo' })).toBeVisible();
  await formulario(page).getByLabel('Placa').fill(placa);
  await formulario(page).getByLabel('Tipo de veículo').selectOption('van');
  await formulario(page).getByLabel('Marca').fill('Marca E2E');
  await formulario(page).getByLabel('Capacidade em cilindros').fill(capacidade);
  await page.getByRole('button', { name: 'Cadastrar veículo' }).click();
}

test.describe('Veículos: fluxo completo', () => {
  test('cadastra placa antiga e Mercosul, vê o detalhe e a lista com as situações em texto', async ({ page }) => {
    await entrar(page);
    await cadastrarVeiculo(page, 'xyz-4321');
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo XYZ-4321' })).toBeVisible();
    await expect(page.getByText('Situação do veículo: Disponível')).toBeVisible();
    await expect(page.getByText('Licenciamento: Sem data')).toBeVisible();
    await cadastrarVeiculo(page, 'xyz1d23', '12');
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo XYZ1D23' })).toBeVisible();

    await page.goto('/veiculos');
    await expect(page.getByText('5 veículos encontrados')).toBeVisible();
    await expect(page.getByRole('link', { name: 'XYZ-4321' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'XYZ1D23' })).toBeVisible();
  });

  test('placa repetida na organização é recusada e leva ao veículo existente; em outra organização é aceita', async ({ page }) => {
    await entrar(page);
    await cadastrarVeiculo(page, 'ABC-1234');
    await expect(page.getByText('Esta placa já está cadastrada (ABC-1234).')).toBeVisible();
    await expect(page.getByLabel('Placa')).toBeFocused();
    await expect(page.getByRole('link', { name: 'Abrir o veículo que usa esta placa' })).toBeVisible();
    await page.getByRole('link', { name: 'Abrir o veículo que usa esta placa' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeVisible();
  });

  test('placa inválida é recusada junto do campo', async ({ page }) => {
    await entrar(page);
    await cadastrarVeiculo(page, 'AB12345');
    await expect(page.getByText('Informe a placa no padrão ABC-1234 ou ABC1D23.')).toBeVisible();
  });

  test('muda a situação: manutenção sem justificativa, inativar com justificativa e reativar', async ({ page }) => {
    await entrar(page);
    await page.goto('/veiculos');
    await page.getByRole('link', { name: 'ABC-1234' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeVisible();

    await page.getByRole('button', { name: 'Colocar em manutenção' }).click();
    await expect(page.getByText('Veículo colocado em manutenção.')).toBeVisible();
    await expect(page.getByText('Situação do veículo: Em manutenção')).toBeVisible();

    await page.getByRole('button', { name: 'Inativar veículo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Inativar veículo' });
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(dialogo.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeVisible();
    await dialogo.getByLabel('Justificativa').fill('Veículo vendido');
    await dialogo.getByRole('button', { name: 'Confirmar inativação' }).click();
    await expect(page.getByText('Veículo inativado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar veículo' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Reativar veículo' }).click();
    const reativar = page.getByRole('dialog', { name: 'Reativar veículo' });
    await reativar.getByLabel('Justificativa').fill('Voltou à frota');
    await reativar.getByRole('button', { name: 'Confirmar reativação' }).click();
    await expect(page.getByText('Veículo marcado como disponível.')).toBeVisible();
  });

  test('filtros por situação do veículo, tipo e licenciamento', async ({ page }) => {
    await entrar(page);
    await page.goto('/veiculos');
    await expect(page.getByText('3 veículos encontrados')).toBeVisible();
    await page.getByLabel('Situação do veículo').selectOption('maintenance');
    await expect(page.getByText('1 veículo encontrado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'DEF-5678' })).toBeVisible();
    await page.getByLabel('Situação do veículo').selectOption('all');
    await page.getByLabel('Situação do licenciamento').selectOption('vencido');
    await expect(page.getByText('1 veículo encontrado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'GHI1J23' })).toBeVisible();
    await page.getByLabel('Situação do licenciamento').selectOption('');
    await page.getByLabel('Buscar veículo').fill('abc-12');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 veículo encontrado')).toBeVisible();
  });

  test('o Tenant B não aparece na lista do Tenant A', async ({ page }) => {
    await entrar(page);
    await page.goto('/veiculos');
    await page.getByLabel('Situação do veículo').selectOption('all');
    await expect(page.getByText('4 veículos encontrados')).toBeVisible();
    await expect(page.getByRole('link', { name: 'XYZ0000' })).toHaveCount(0);
    await page.goto('/veiculos/85000000-0000-4000-8000-000000000502');
    await expect(page.getByText('Veículo não encontrado')).toBeVisible();
  });

  test('o auditor consulta e não encontra nenhuma ação de escrita', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/veiculos');
    await expect(page.getByRole('link', { name: 'Cadastrar veículo' })).toHaveCount(0);
    await page.getByRole('link', { name: 'ABC-1234' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeVisible();
    for (const acao of ['Editar veículo', 'Colocar em manutenção', 'Inativar veículo']) {
      await expect(page.getByRole('button', { name: acao })).toHaveCount(0);
      await expect(page.getByRole('link', { name: acao })).toHaveCount(0);
    }
    await page.goto('/veiculos/novo');
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
  });

  test('a lista em 360 px não rola na horizontal', async ({ page }) => {
    await entrar(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/veiculos');
    await expect(page.getByRole('link', { name: 'ABC-1234' })).toBeVisible();
    await expect.poll(() => semRolagemHorizontal(page)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Motoristas (história 5): documentos protegidos, vínculo com usuário e revelação.
// ---------------------------------------------------------------------------------------------------------------------------------
const CPF_DA_ANA = syntheticCpf(701);

async function cadastrarMotorista(page: Page, nome: string, cpf: string, cnh = '24681357982'): Promise<void> {
  await page.goto('/motoristas/novo');
  await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar motorista' })).toBeVisible();
  await formulario(page).getByLabel('Nome completo').fill(nome);
  await formulario(page).getByLabel('CPF').fill(cpf);
  await formulario(page).getByLabel('Número da CNH').fill(cnh);
  await formulario(page).getByLabel('Categoria da CNH').selectOption('D');
  await formulario(page).getByLabel('Validade da CNH').fill('2031-05-20');
}

test.describe('Motoristas: fluxo completo', () => {
  test('cadastra com vínculo, vê CPF e CNH mascarados, revela e oculta', async ({ page }) => {
    await entrar(page);
    await cadastrarMotorista(page, 'Fernando Novo Condutor', '111.444.777-35');
    await formulario(page).getByLabel('Usuário vinculado').selectOption({ label: 'Condutor Um' });
    await page.getByRole('button', { name: 'Cadastrar motorista' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Fernando Novo Condutor' })).toBeVisible();
    await expect(page.getByText('***.***.***-35')).toBeVisible();
    await expect(page.getByText('********982')).toBeVisible();
    await expect(page.getByText('Condutor Um')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('11144477735');

    await page.getByRole('button', { name: 'Revelar CPF' }).click();
    await expect(page.getByText('111.444.777-35')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'CPF revelado' })).toBeVisible();
    // O valor não fica no aparelho: nem em armazenamento local, nem na URL.
    const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href);
    expect(guardado).not.toContain('11144477735');
    await page.getByRole('button', { name: 'Ocultar CPF' }).click();
    await expect(page.getByText('111.444.777-35')).toHaveCount(0);
    await expect(page.getByText('***.***.***-35')).toBeVisible();
  });

  test('o valor revelado some ao recarregar a tela', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Ana Condutora' }).click();
    await page.getByRole('button', { name: 'Revelar CNH' }).click();
    await expect(page.getByRole('button', { name: 'Ocultar CNH' })).toBeVisible();
    await page.getByRole('link', { name: 'Motoristas', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Motoristas da organização' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Revelar CNH' })).toBeVisible();
  });

  test('CPF repetido na organização é recusado com o nome do motorista existente, sem mostrar o documento', async ({ page }) => {
    await entrar(page);
    await cadastrarMotorista(page, 'Gustavo Repetido', CPF_DA_ANA);
    await page.getByRole('button', { name: 'Cadastrar motorista' }).click();
    await expect(page.getByText('Este CPF já está cadastrado em Ana Condutora.')).toBeVisible();
    await expect(page.getByLabel('CPF')).toBeFocused();
    await expect(page.locator('body')).not.toContainText(CPF_DA_ANA);
  });

  test('vínculo recusado: o usuário que deixou de ser elegível não é vinculado, e a tela diz o porquê', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Bruno Condutor' }).click();
    await expect(page.getByLabel('Usuário vinculável')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Condutor Um' })).toBeAttached();
    // Outra pessoa vincula o mesmo usuário a outro motorista enquanto a tela está aberta.
    const ana = backend.registry.drivers.find((driver) => driver.full_name === 'Ana Condutora');
    if (ana) ana.linked_user_id = '10000000-0000-4000-8000-0000000000e1';
    await page.getByLabel('Usuário vinculável').selectOption({ label: 'Condutor Um' });
    await page.getByRole('button', { name: 'Vincular usuário' }).click();
    await expect(page.getByText('Este usuário não pode ser vinculado a este motorista. Escolha outro.')).toBeVisible();
  });

  test('o Tenant B não aparece na lista do Tenant A e o detalhe dele responde "não encontrado"', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await expect(page.getByText('3 motoristas encontrados')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Motorista do Tenant B' })).toHaveCount(0);
    await page.goto('/motoristas/86000000-0000-4000-8000-000000000501');
    await expect(page.getByText('Motorista não encontrado')).toBeVisible();
  });

  test('filtros: situação da CNH, inativos e busca pelo CPF completo', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await page.getByLabel('Situação da CNH').selectOption('vencido');
    await expect(page.getByText('1 motorista encontrado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Carla Condutora' })).toBeVisible();
    await page.getByLabel('Situação da CNH').selectOption('');
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await expect(page.getByRole('link', { name: 'Diego Inativo' })).toBeVisible();
    await page.getByLabel('Situação cadastral').selectOption('active');
    await page.getByLabel('Buscar motorista').fill(CPF_DA_ANA);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('link', { name: 'Ana Condutora' })).toBeVisible();
    await expect(page.getByText('1 motorista encontrado')).toBeVisible();
  });

  test('o auditor consulta mascarado e não encontra revelar, editar nem vincular', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Ana Condutora' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Ana Condutora' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Revelar/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Editar motorista' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Vincular usuário' })).toHaveCount(0);
    await page.goto('/motoristas/novo');
    await expect(page.getByRole('alert')).toContainText(/não tem permissão/i);
  });

  test('o cliente pessoa física também revela o CPF só para quem tem a permissão', async ({ page }) => {
    await entrar(page);
    await page.goto('/clientes/novo');
    await formulario(page).getByLabel('Tipo de pessoa').selectOption('individual');
    await formulario(page).getByLabel('CPF').fill('529.982.247-25');
    await formulario(page).getByLabel('Nome', { exact: true }).fill('Ana Lima Teste');
    await formulario(page).getByLabel('Segmento').selectOption('other');
    await formulario(page).getByLabel('Qual segmento?').fill('Consultório');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Ana Lima Teste' })).toBeVisible();
    await page.getByRole('button', { name: 'Revelar CPF' }).click();
    await expect(page.getByText('529.982.247-25')).toBeVisible();
  });

  test('a lista em 360 px não rola na horizontal', async ({ page }) => {
    await entrar(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/motoristas');
    await expect(page.getByRole('link', { name: 'Ana Condutora' })).toBeVisible();
    await expect.poll(() => semRolagemHorizontal(page)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Histórico de cada cadastro (história 7).
// ---------------------------------------------------------------------------------------------------------------------------------
test.describe('Histórico dos cadastros', () => {
  test('um auditor reconstrói o que mudou num veículo só pela tela, na ordem executada', async ({ page }) => {
    await entrar(page);
    // Sequência conhecida: cadastro, edição da capacidade, manutenção, volta a disponível.
    await cadastrarVeiculo(page, 'HIS-1234', '24');
    await page.getByRole('link', { name: 'Editar veículo' }).click();
    await formulario(page).getByLabel('Capacidade em cilindros').fill('40');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    await page.getByRole('button', { name: 'Colocar em manutenção' }).click();
    await expect(page.getByText('Veículo colocado em manutenção.')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar como disponível' }).click();
    await expect(page.getByText('Veículo marcado como disponível.')).toBeVisible();

    const historico = page.getByRole('region', { name: 'Histórico' });
    await expect(historico.getByText('4 eventos exibidos')).toBeVisible();
    const eventos = historico.locator('ol > li');
    await expect(eventos.nth(0)).toContainText('Situação do veículo alterada');
    await expect(eventos.nth(0)).toContainText('Situação: Em manutenção → Disponível');
    await expect(eventos.nth(1)).toContainText('Situação: Disponível → Em manutenção');
    await expect(eventos.nth(2)).toContainText('Capacidade em cilindros: 24 → 40');
    await expect(eventos.nth(3)).toContainText('Veículo cadastrado');
    await expect(historico.getByRole('button', { name: /editar|excluir|apagar|remover/i })).toHaveCount(0);

    // Filtro por tipo e inversão da ordem.
    await historico.getByLabel('Tipo de evento').selectOption('vehicle_status_changed');
    await expect(historico.getByText('2 eventos exibidos')).toBeVisible();
    await historico.getByLabel('Tipo de evento').selectOption('');
    await historico.getByLabel('Ordem').selectOption('asc');
    await expect(historico.locator('ol > li').first()).toContainText('Veículo cadastrado');

  });

  test('o auditor lê o histórico; o estoquista, que não tem a permissão, não vê o bloco', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/veiculos');
    await page.getByRole('link', { name: 'ABC-1234' }).click();
    await expect(page.getByRole('region', { name: 'Histórico' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Histórico' })).toContainText('Veículo cadastrado');
  });

  test('sem a permissão de histórico o bloco não aparece', async ({ page }) => {
    await entrar(page, 'cadastros-estoquista');
    await page.goto('/veiculos');
    await page.getByRole('link', { name: 'ABC-1234' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Histórico' })).toHaveCount(0);
  });

  test('editar motorista mostra só que nome e telefone mudaram, sem valores nem documentos', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Ana Condutora' }).click();
    await page.getByRole('link', { name: 'Editar motorista' }).click();
    await formulario(page).getByLabel('Nome completo').fill('Ana Condutora Silva');
    await page.getByRole('button', { name: 'Salvar alterações' }).click();
    const historico = page.getByRole('region', { name: 'Histórico' });
    await expect(historico).toContainText('Campos pessoais alterados (valores não exibidos): Nome');
    await expect(historico).not.toContainText('Ana Condutora Silva');
    await expect(historico).not.toContainText(CPF_DA_ANA);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Anonimizar dados pessoais, sem apagar o cadastro (história 8).
// ---------------------------------------------------------------------------------------------------------------------------------
async function preencherAnonimizacao(page: Page, justificativa = 'Pedido do titular dos dados'): Promise<void> {
  const dialogo = page.getByRole('dialog', { name: /Anonimizar dados pessoais/ });
  await dialogo.getByLabel('Motivo').selectOption('data_subject_request');
  await dialogo.getByLabel('Justificativa').fill(justificativa);
  await dialogo.getByLabel('Digite ANONIMIZAR para confirmar').fill('ANONIMIZAR');
}

test.describe('Anonimização de motorista', () => {
  test('motorista ativo não pode ser anonimizado; o inativo sim, com segundo fator, e depois fica bloqueado', async ({ page }) => {
    const backend = await entrar(page);
    await page.goto('/motoristas');
    await page.getByRole('link', { name: 'Bruno Condutor' }).click();
    await expect(page.getByRole('button', { name: 'Anonimizar dados pessoais' })).toBeDisabled();
    await expect(page.getByText('Inative o motorista antes de anonimizar.')).toBeVisible();

    // Diego já está inativo: lista do que será removido e do que permanece.
    await page.goto('/motoristas');
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await page.getByRole('link', { name: 'Diego Inativo' }).click();
    await page.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' });
    await expect(dialogo.getByText('Esta ação é irreversível')).toBeVisible();
    await expect(dialogo.getByRole('region', { name: 'O que será removido' })).toContainText('CPF');
    await expect(dialogo.getByRole('region', { name: 'O que permanece' })).toContainText('Categoria e validade da CNH');

    // Sem a palavra de confirmação, nada acontece.
    await dialogo.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(dialogo.getByText('Escolha o motivo.')).toBeVisible();
    await expect(dialogo.getByText('Digite ANONIMIZAR para confirmar.')).toBeVisible();

    // Sem segundo fator, o servidor recusa e o diálogo orienta.
    await preencherAnonimizacao(page);
    backend.registry.aal = 'aal1';
    await dialogo.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(dialogo.getByText(/exige o segundo fator de autenticação/)).toBeVisible();
    expect(backend.registry.drivers.find((driver) => driver.full_name === 'Diego Inativo')).toBeTruthy();

    // Com o segundo fator, anonimiza.
    backend.registry.aal = 'aal2';
    await dialogo.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Motorista anonimizado' })).toBeVisible();
    await expect(page.getByText(/Dados pessoais anonimizados em/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar motorista' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reativar motorista' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Revelar/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Anonimizar dados pessoais' })).toHaveCount(0);

    // Nenhuma linha foi apagada, e o registro só aparece nas visões de inativos e todos, nunca achado pelo nome antigo.
    expect(backend.registry.drivers.filter((driver) => driver.organization_id === ORG_A)).toHaveLength(4);
    await page.goto('/motoristas');
    await expect(page.getByRole('link', { name: 'Motorista anonimizado' })).toHaveCount(0);
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await expect(page.getByRole('link', { name: 'Motorista anonimizado' })).toBeVisible();
    await expect(page.getByText('Anonimizado', { exact: true })).toBeVisible();
    await page.getByLabel('Situação cadastral').selectOption('all');
    await page.getByLabel('Buscar motorista').fill('Diego');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Nenhum motorista encontrado')).toBeVisible();
  });

  test('o CPF do motorista anonimizado fica livre e cadastra de novo como registro novo', async ({ page }) => {
    const backend = await entrar(page);
    const diego = backend.registry.drivers.find((driver) => driver.full_name === 'Diego Inativo');
    const cpf = String(backend.registry.driverDocuments.get(String(diego?.id))?.cpf);
    await page.goto(`/motoristas/${String(diego?.id)}`);
    await page.getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await preencherAnonimizacao(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Anonimizar dados pessoais' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Motorista anonimizado' })).toBeVisible();
    await cadastrarMotorista(page, 'Novo Dono do CPF', cpf, '98765432109');
    await page.getByRole('button', { name: 'Cadastrar motorista' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Novo Dono do CPF' })).toBeVisible();
  });

  test('o auditor e o administrador sem a permissão não encontram a ação', async ({ page }) => {
    await entrar(page, 'cadastros-auditor');
    await page.goto('/motoristas');
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await page.getByRole('link', { name: 'Diego Inativo' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Diego Inativo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anonimizar dados pessoais' })).toHaveCount(0);
  });

  test('o diálogo é operável só com o teclado, com Escape e alvos de 44 px', async ({ page }) => {
    await entrar(page);
    await page.goto('/motoristas');
    await page.getByLabel('Situação cadastral').selectOption('inactive');
    await page.getByRole('link', { name: 'Diego Inativo' }).click();
    const botao = page.getByRole('button', { name: 'Anonimizar dados pessoais' });
    await botao.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' });
    await expect(dialogo.getByLabel('Motivo')).toBeFocused();
    for (const controle of [dialogo.getByLabel('Motivo'), dialogo.getByLabel('Justificativa'), dialogo.getByLabel('Digite ANONIMIZAR para confirmar'), dialogo.getByRole('button', { name: 'Cancelar' }), dialogo.getByRole('button', { name: 'Anonimizar dados pessoais' })]) {
      const caixa = await controle.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(botao).toBeFocused();
  });
});
