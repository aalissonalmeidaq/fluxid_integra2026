import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { MockBackend } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { abrirAlerta, lacreVinculado } from './support/mock-seals-operacoes';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 012 (T116; RF-035, RF-036, CA-005, MS-009): a lista única de alertas dos lacres, o detalhe com a última posição, reconhecer e
// encerrar com observação, só com teclado; a visão geral leva aos alertas; sem conexão, a tela explica. Axe sem violação crítica ou
// grave e sem rolagem horizontal em 360, 768 e 1920 px.
const LARGURAS = [360, 768, 1920] as const;

async function semViolacoes(page: Page, contexto: string): Promise<void> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const bloqueantes = resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious');
  const evidencia = bloqueantes.map((violacao) => `${violacao.impact}: ${violacao.id} em ${violacao.nodes.map((no) => no.target.join(', ')).join('; ')}`).join('\n');
  expect(bloqueantes, `${contexto}\n${evidencia}`).toEqual([]);
}

async function emTodasAsLarguras(page: Page, nome: string, abrir: () => Promise<void>): Promise<void> {
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    await abrir();
    await semViolacoes(page, `${nome} em ${largura}px`);
    expect(await semRolagemHorizontal(page), `${nome} em ${largura}px: rolagem horizontal`).toBe(true);
  }
}

// Um lacre vinculado ao CIL-006 com três alertas: possível extravio (aberto), bateria baixa (reconhecido) e sem comunicação (encerrado).
function semearAlertas(backend: MockBackend) {
  const cil = backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === 'CIL-006')!;
  const lacre = lacreVinculado(backend.seals, ORG_A, cil.id, 'CIL-006', 'Lacre do pátio');
  const extravio = abrirAlerta(backend.seals, ORG_A, lacre, 'possible_loss', 'critical', { cylinder_id: cil.id });
  abrirAlerta(backend.seals, ORG_A, lacre, 'low_battery', 'medium', { cylinder_id: cil.id, status: 'acknowledged', acknowledged_at: new Date().toISOString() });
  abrirAlerta(backend.seals, ORG_A, lacre, 'no_comm', 'medium', { cylinder_id: cil.id, status: 'closed', closed_at: new Date().toISOString(), close_note: 'Roteador do pátio reiniciado.' });
  return { cil, extravio };
}

async function apertar(page: Page, alvo: ReturnType<Page['getByRole']>): Promise<void> {
  await alvo.focus();
  await page.keyboard.press('Enter');
}

test.describe('Alertas dos lacres', () => {
  test('lista, filtros, detalhe, reconhecer e encerrar só com teclado', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const { cil, extravio } = semearAlertas(backend);

    // A visão geral leva aos alertas.
    await apertar(page, page.getByRole('link', { name: 'Ver os alertas dos lacres' }));
    await expect(page.getByRole('heading', { level: 2, name: 'Alertas' })).toBeVisible();
    const lista = page.getByRole('list', { name: 'Lista de alertas' });
    await expect(lista.getByRole('link')).toHaveCount(2);
    await expect(lista.getByRole('link', { name: /Possível extravio/ })).toBeVisible();
    await expect(lista.getByRole('link', { name: /Bateria baixa/ })).toContainText('Reconhecido');

    await page.getByLabel('Situação').selectOption('closed');
    await expect(lista.getByRole('link')).toHaveCount(1);
    await expect(lista.getByRole('link', { name: /Sem comunicação/ })).toBeVisible();
    await page.getByLabel('Situação').selectOption('open');
    await expect(lista.getByRole('link')).toHaveCount(1);

    await apertar(page, lista.getByRole('link', { name: /Possível extravio/ }));
    await expect(page).toHaveURL(new RegExp(`/alertas/${String(extravio.id)}$`));
    await expect(page.getByRole('heading', { level: 2, name: 'Possível extravio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CIL-006' })).toHaveAttribute('href', `/cilindros/${cil.id}`);
    await expect(page.getByText('Aberto', { exact: true }).first()).toBeVisible();

    await apertar(page, page.getByRole('button', { name: 'Reconhecer' }));
    await expect(page.getByText('Alerta reconhecido.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reconhecer' })).toHaveCount(0);

    const encerrar = page.getByRole('button', { name: 'Encerrar alerta' });
    await apertar(page, encerrar);
    const dialogo = page.getByRole('dialog', { name: 'Encerrar alerta' });
    await expect(dialogo.getByLabel('Observação')).toBeFocused();
    await page.keyboard.type('Cilindro encontrado no depósito do cliente.');
    await apertar(page, dialogo.getByRole('button', { name: 'Encerrar', exact: true }));
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Alerta encerrado.')).toBeVisible();
    await expect(page.getByText('Cilindro encontrado no depósito do cliente.')).toBeVisible();
    expect(backend.seals.rows('alerts').find((a) => a.id === extravio.id)!.status).toBe('closed');
  });

  test('quem só vê lacres não reconhece nem encerra', async ({ page }) => {
    const backend = await entrar(page, 'lacres-auditor');
    const { extravio } = semearAlertas(backend);
    await page.goto(`/alertas/${String(extravio.id)}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Possível extravio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reconhecer' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Encerrar alerta' })).toHaveCount(0);
  });

  test('sem conexão: reconhecer e encerrar ficam desabilitados com o motivo e voltam com a conexão', async ({ page, context }) => {
    const backend = await entrar(page, 'lacres-admin');
    const { extravio } = semearAlertas(backend);
    await page.goto(`/alertas/${String(extravio.id)}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Possível extravio' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Reconhecer' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Encerrar alerta' })).toBeDisabled();
    await expect(page.getByText('Sem conexão: comandos de lacre exigem conexão.')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Encerrar alerta' })).toBeEnabled();
  });

  test.describe('acessibilidade em 360, 768 e 1920 px', () => {
    test.beforeEach(({ browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium', 'As larguras são aplicadas dentro do teste; uma execução basta.');
      test.setTimeout(120_000);
    });

    test('lista, detalhe e diálogo de encerrar', async ({ page }) => {
      const backend = await entrar(page, 'lacres-admin');
      const { extravio } = semearAlertas(backend);
      await emTodasAsLarguras(page, 'lista de alertas', async () => {
        await page.goto('/alertas');
        await expect(page.getByRole('list', { name: 'Lista de alertas' })).toBeVisible();
      });
      await emTodasAsLarguras(page, 'detalhe do alerta', async () => {
        await page.goto(`/alertas/${String(extravio.id)}`);
        await expect(page.getByRole('heading', { level: 2, name: 'Possível extravio' })).toBeVisible();
      });
      await emTodasAsLarguras(page, 'diálogo de encerrar', async () => {
        await page.goto(`/alertas/${String(extravio.id)}`);
        await page.getByRole('button', { name: 'Encerrar alerta' }).click();
        await expect(page.getByRole('dialog', { name: 'Encerrar alerta' })).toBeVisible();
      });
    });
  });
});
