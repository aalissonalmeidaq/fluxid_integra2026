import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { MockBackend } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { lacreVinculado, registrarPosicoes } from './support/mock-seals-operacoes';
import { entrar, planejar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 012 (T116; CA-005, MS-008, RF-042, RF-043): acompanhar o cilindro e a viagem pelo lacre, com backend simulado. O bloco "Lacre" do
// cilindro mostra saúde, trava e a última posição, com as posições em texto como alternativa ao mapa; travar e destravar só com
// teclado, com justificativa e o foco devolvido; o segundo fator é decidido pelo servidor; sem conexão, os comandos ficam desabilitados
// com o motivo. Axe sem violação crítica ou grave e sem rolagem horizontal em 360, 768 e 1920 px.
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

function cilindroComLacre(backend: MockBackend, serial: string, extra: Record<string, unknown> = {}) {
  const cil = backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === serial)!;
  const lacre = lacreVinculado(backend.seals, ORG_A, cil.id, serial, `Lacre do ${serial}`, extra);
  registrarPosicoes(backend.seals, ORG_A, lacre, cil.id, 3);
  return { cil, lacre };
}

// Ativa o controle com o teclado (foco e Enter), sem clique.
async function apertar(page: Page, alvo: ReturnType<Page['getByRole']>): Promise<void> {
  await alvo.focus();
  await page.keyboard.press('Enter');
}

test.describe('Acompanhar o cilindro e a viagem pelo lacre', () => {
  test('bloco do cilindro: saúde, trava, posições em texto e travar só com teclado', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const { cil } = cilindroComLacre(backend, 'CIL-006');
    await page.goto(`/cilindros/${cil.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await expect(bloco.getByText('Funcionando')).toBeVisible();
    await expect(bloco.getByText('Destravada')).toBeVisible();
    await expect(bloco.getByText('87%')).toBeVisible();

    const posicoes = bloco.getByRole('button', { name: 'Ver as posições em texto' });
    await apertar(page, posicoes);
    await expect(bloco.getByRole('button', { name: 'Ocultar as posições em texto' })).toHaveAttribute('aria-expanded', 'true');
    await expect(bloco.getByText(/-7[.,]2/).first()).toBeVisible();

    const travar = bloco.getByRole('button', { name: 'Travar', exact: true });
    await apertar(page, travar);
    const dialogo = page.getByRole('dialog', { name: 'Travar o lacre · CIL-006' });
    await expect(dialogo.getByLabel('Justificativa')).toBeFocused();
    await page.keyboard.type('Cilindro parado no pátio durante a noite.');
    await apertar(page, dialogo.getByRole('button', { name: 'Pedir para travar' }));
    await expect(dialogo).toHaveCount(0);
    await expect(travar).toBeFocused();
    await expect(bloco.getByText('Pedido de travar enviado. A trava muda quando o lacre confirmar.')).toBeVisible();
    await expect(bloco.getByText('Travamento pendente')).toBeVisible();
  });

  // Spec 013 (RF-021): destravar pede só a justificativa; não há segundo fator.
  test('destravar com e-mail e senha: só a justificativa, e o pedido fica pendente', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    const { cil } = cilindroComLacre(backend, 'CIL-007', { lock_state: 'locked' });
    backend.seals.aal = 'aal1';
    await page.goto(`/cilindros/${cil.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await expect(bloco.getByText('Travada', { exact: true })).toBeVisible();
    await apertar(page, bloco.getByRole('button', { name: 'Destravar', exact: true }));
    const dialogo = page.getByRole('dialog', { name: 'Destravar o lacre · CIL-007' });
    await dialogo.getByLabel('Justificativa').fill('Cliente pediu a liberação fora da entrega.');
    await apertar(page, dialogo.getByRole('button', { name: 'Pedir para destravar' }));
    await expect(dialogo).toHaveCount(0);
    await expect(bloco.getByText(/Pedido de destravar enviado/)).toBeVisible();
    expect(backend.seals.rows('devices').find((d) => d.label === 'Lacre do CIL-007')!.pending_command).not.toBeNull();
  });

  test('quem só vê lacres acompanha sem os botões de comando', async ({ page }) => {
    const backend = await entrar(page, 'lacres-auditor');
    const { cil } = cilindroComLacre(backend, 'CIL-006');
    await page.goto(`/cilindros/${cil.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await expect(bloco.getByText('Funcionando')).toBeVisible();
    await expect(bloco.getByRole('button', { name: 'Travar', exact: true })).toHaveCount(0);
    await expect(bloco.getByRole('button', { name: 'Destravar', exact: true })).toHaveCount(0);
  });

  test('viagem: a trava física de cada cilindro, com "sem lacre" quando não há vínculo', async ({ page }) => {
    const backend = await entrar(page, 'lacres-admin');
    cilindroComLacre(backend, 'CIL-006', { lock_state: 'locked' });
    const viagem = planejar(backend, [['CIL-006', 'CIL-007']], { iniciar: true });
    await page.goto(`/viagens/${viagem.id}`);
    const painel = page.getByRole('list', { name: 'Trava física dos cilindros' });
    await expect(painel.getByRole('listitem').filter({ hasText: 'CIL-006' }).getByText('Travada')).toBeVisible();
    await expect(painel.getByRole('listitem').filter({ hasText: 'CIL-007' }).getByText('Sem lacre (só o bloqueio lógico)')).toBeVisible();
  });

  test('sem conexão: os comandos ficam desabilitados e dizem por quê', async ({ page, context }) => {
    const backend = await entrar(page, 'lacres-admin');
    const { cil } = cilindroComLacre(backend, 'CIL-006');
    await page.goto(`/cilindros/${cil.id}`);
    const bloco = page.getByRole('region', { name: 'Lacre' });
    await expect(bloco.getByText('Funcionando')).toBeVisible();
    await context.setOffline(true);
    await expect(bloco.getByRole('button', { name: 'Travar', exact: true })).toBeDisabled();
    await expect(bloco.getByText('Sem conexão: comandos de lacre exigem conexão.')).toBeVisible();
    await context.setOffline(false);
    await expect(bloco.getByRole('button', { name: 'Travar', exact: true })).toBeEnabled();
  });

  test.describe('acessibilidade em 360, 768 e 1920 px', () => {
    test.beforeEach(({ browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'desktop-chromium', 'As larguras são aplicadas dentro do teste; uma execução basta.');
      test.setTimeout(180_000);
    });

    test('cilindro, lista e detalhe do lacre, viagem e diálogos', async ({ page }) => {
      const backend = await entrar(page, 'lacres-admin');
      const { cil, lacre } = cilindroComLacre(backend, 'CIL-006');
      const viagem = planejar(backend, [['CIL-006', 'CIL-007']], { iniciar: true });

      await emTodasAsLarguras(page, 'detalhe do cilindro com lacre', async () => {
        await page.goto(`/cilindros/${cil.id}`);
        await expect(page.getByRole('region', { name: 'Lacre' }).getByText('Funcionando')).toBeVisible();
      });
      await emTodasAsLarguras(page, 'diálogo de travar', async () => {
        await page.goto(`/cilindros/${cil.id}`);
        await page.getByRole('region', { name: 'Lacre' }).getByRole('button', { name: 'Travar', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Travar o lacre · CIL-006' })).toBeVisible();
      });
      await emTodasAsLarguras(page, 'lista de lacres', async () => {
        await page.goto('/lacres');
        await expect(page.getByRole('heading', { level: 2, name: 'Lacres' })).toBeVisible();
        await expect(page.getByText('Lacre do CIL-006').first()).toBeVisible();
      });
      await emTodasAsLarguras(page, 'detalhe do lacre', async () => {
        await page.goto(`/lacres/${String(lacre.device_id)}`);
        await expect(page.getByRole('heading', { level: 2, name: 'Lacre do CIL-006' })).toBeVisible();
      });
      await emTodasAsLarguras(page, 'adicionar rede Wi-Fi', async () => {
        await page.goto(`/lacres/${String(lacre.device_id)}`);
        await page.getByRole('button', { name: 'Adicionar rede' }).click();
        await expect(page.getByRole('dialog', { name: 'Adicionar rede Wi-Fi' })).toBeVisible();
      });
      await emTodasAsLarguras(page, 'detalhe da viagem com a trava física', async () => {
        await page.goto(`/viagens/${viagem.id}`);
        await expect(page.getByRole('list', { name: 'Trava física dos cilindros' })).toBeVisible();
      });
    });
  });
});
