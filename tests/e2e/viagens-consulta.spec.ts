import { test, expect } from '@playwright/test';
import { entrar, entregar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 008, US6: consulta de viagens. Cobre os filtros combinados da lista, o histórico de uma viagem concluída, o auditor que consulta
// sem agir e sem ver o nome do recebedor, e o bloco "Viagens" nos detalhes de cilindro e de unidade. O servidor de verdade é provado no pgTAP.
const RECEBEDOR = 'Recebedor Sigiloso';

test.describe('Consulta de viagens', () => {
  test('os filtros da lista se combinam e o total é anunciado uma vez', async ({ page }) => {
    const backend = await entrar(page);
    const primeira = planejar(backend, [['CIL-006']], { iniciar: true });
    planejar(backend, [['CIL-007']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1] });
    await page.goto('/viagens');
    await expect(page.getByRole('status').filter({ hasText: '2 viagens encontradas' })).toHaveCount(1);

    await page.getByLabel('Veículo').selectOption({ label: 'ABC-1234' });
    await expect(page.getByRole('status').filter({ hasText: '1 viagem encontrada' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'n.º 1' })).toHaveAttribute('href', `/viagens/${primeira.id}`);
    await expect(page.getByRole('link', { name: 'n.º 2' })).toHaveCount(0);

    await page.getByLabel('Veículo').selectOption({ label: 'Todos' });
    await page.getByLabel('Motorista').selectOption({ label: 'Bruno Condutor' });
    await expect(page.getByRole('link', { name: 'n.º 2' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'n.º 1' })).toHaveCount(0);

    await page.getByLabel('Motorista').selectOption({ label: 'Todos' });
    await page.getByLabel('Custódia dos cilindros').selectOption({ label: 'Em trânsito' });
    await expect(page.getByRole('status').filter({ hasText: '1 viagem encontrada' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'n.º 1' })).toBeVisible();

    await page.getByLabel('Custódia dos cilindros').selectOption({ label: 'No cliente' });
    await expect(page.getByText(/Nenhuma viagem corresponde à busca/)).toBeVisible();
  });

  test('a ordem muda a lista', async ({ page }) => {
    const backend = await entrar(page);
    planejar(backend, [['CIL-006']]);
    planejar(backend, [['CIL-007']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1] });
    await page.goto('/viagens');
    const numeros = () => page.getByRole('link', { name: /^n\.º \d+$/ }).allTextContents();
    await expect(page.getByRole('link', { name: 'n.º 2' })).toBeVisible();
    expect((await numeros())[0]).toBe('n.º 2');
    await page.getByLabel('Ordenar por').selectOption({ label: 'Número (mais antigas primeiro)' });
    await expect.poll(async () => (await numeros())[0]).toBe('n.º 1');
  });

  test('o histórico de uma viagem concluída mostra cada evento sem o nome do recebedor, com filtro por tipo', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006']], { iniciar: true });
    entregar(backend, id, chamar, 1, RECEBEDOR);
    expect(chamar('complete_trip', { expected_version: 3 }).status).toBe(200);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText('Situação da viagem: Concluída')).toBeVisible();

    const historico = page.getByRole('region', { name: 'Histórico' });
    const lista = historico.getByRole('list', { name: 'Eventos do histórico da viagem' });
    await expect(lista.getByRole('listitem').first()).toContainText('Viagem concluída: 1 cilindro entregue e 0 devolvidos ao estoque.');
    await expect(lista).toContainText('Parada 1: 1 entregue e 0 não entregues, com recebedor registrado.');
    await expect(lista).toContainText('Evento nº 1');
    await expect(page.getByText(RECEBEDOR)).toHaveCount(1); // só no bloco de entregas, para quem tem trip.recipient
    await expect(lista.getByText(RECEBEDOR)).toHaveCount(0);

    await historico.getByLabel('Tipo de evento').selectOption({ label: 'Entrega registrada' });
    await expect(lista.getByRole('listitem')).toHaveCount(1);
    await historico.getByLabel('Tipo de evento').selectOption({ label: 'Todos' });
    await historico.getByLabel('Ordem').selectOption({ label: 'Mais antigos primeiro' });
    await expect(lista.getByRole('listitem').first()).toContainText('Viagem n.º 1 planejada');
  });

  test('o auditor consulta o histórico, não vê ação de escrita e não vê o nome do recebedor', async ({ page }) => {
    const backend = await entrar(page, 'viagens-auditor');
    const { id, chamar } = planejar(backend, [['CIL-006']], { iniciar: true });
    entregar(backend, id, chamar, 1, RECEBEDOR);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 3, name: 'Histórico' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Eventos do histórico da viagem' }).getByRole('listitem').first()).toBeVisible();
    await expect(page.getByText(RECEBEDOR)).toHaveCount(0);
    await expect(page.getByText('(restrito)').first()).toBeVisible();
    for (const nome of ['Concluir viagem', 'Cancelar viagem', 'Registrar entrega', 'Editar viagem']) {
      await expect(page.getByRole('button', { name: nome }).or(page.getByRole('link', { name: nome }))).toHaveCount(0);
    }
  });

  test('os detalhes do cilindro e da unidade mostram as viagens, com link', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006']], { iniciar: true });
    entregar(backend, id, chamar, 1);
    const cilindro = backend.cylinders.cylinders.find((c) => c.serial_number === 'CIL-006')!;
    const unidade = backend.registry.sites[0]!;

    await page.goto(`/cilindros/${cilindro.id}`);
    await expect(page.getByRole('heading', { level: 3, name: 'Viagens' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Viagem n.º 1' })).toHaveAttribute('href', `/viagens/${id}`);
    await expect(page.getByText('Situação do cilindro na viagem: Entregue')).toBeVisible();
    await expect(page.getByText('Custódia: No cliente')).toBeVisible();
    await expect(page.getByRole('link', { name: String(unidade.name) }).first()).toHaveAttribute('href', `/clientes/${String(unidade.customer_id)}/unidades/${String(unidade.id)}`);

    await page.goto(`/clientes/${String(unidade.customer_id)}/unidades/${String(unidade.id)}`);
    await expect(page.getByRole('heading', { level: 3, name: 'Viagens' })).toBeVisible();
    await page.getByRole('link', { name: 'Viagem n.º 1' }).click();
    await expect(page).toHaveURL(new RegExp(`/viagens/${id}$`));
  });

  test('a lista de cilindros mostra a custódia e filtra por ela', async ({ page }) => {
    const backend = await entrar(page);
    planejar(backend, [['CIL-006', 'CIL-007']], { iniciar: true });
    await page.goto('/cilindros');
    await page.getByLabel('Custódia', { exact: true }).selectOption({ label: 'Em trânsito' });
    await expect(page.getByRole('status').filter({ hasText: '2 cilindros encontrados' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'CIL-006' })).toBeVisible();
    await expect(page.getByText('Custódia: Em trânsito').first()).toBeVisible();
  });

  test('sem rolagem horizontal na lista com todos os filtros', async ({ page }) => {
    const backend = await entrar(page);
    planejar(backend, [['CIL-006']]);
    await page.goto('/viagens');
    await expect(page.getByLabel('Veículo')).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
