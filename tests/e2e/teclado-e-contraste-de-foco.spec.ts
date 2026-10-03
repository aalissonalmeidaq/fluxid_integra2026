import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';
import { TELAS } from './support/telas';

test.use({ serviceWorkers: 'block' });

// CA-006 e MS-004: toda função das histórias 1 a 6 opera só pelo teclado, o anel de foco tem 3:1 ou mais e não há
// armadilha de foco. O WebKit do Playwright no Windows não encaminha Tab, então o percurso roda em Chromium.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'O WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
});

interface FocoLido {
  rotulo: string;
  larguraDoAnel: number;
  contraste: number;
  naPagina: boolean;
  internoDoNavegador: boolean;
}

// Lê o elemento com foco e mede o anel (contorno ou sombra) contra o fundo efetivo, pela fórmula de luminância da WCAG.
function lerFoco(page: Page): Promise<FocoLido> {
  return page.evaluate(() => {
    const analisar = (texto: string): [number, number, number, number] | null => {
      const m = texto.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const partes = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return [partes[0] ?? 0, partes[1] ?? 0, partes[2] ?? 0, partes[3] ?? 1];
    };
    const luminancia = ([r, g, b]: [number, number, number, number]): number => {
      const canal = (valor: number): number => {
        const v = valor / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const razao = (a: [number, number, number, number], b: [number, number, number, number]): number => {
      const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
      return (maior + 0.05) / (menor + 0.05);
    };
    const elemento = document.activeElement as HTMLElement | null;
    if (!elemento || elemento === document.body || elemento === document.documentElement) {
      return { rotulo: 'fora da página', larguraDoAnel: 0, contraste: 0, naPagina: false, internoDoNavegador: false };
    }
    // O botão do seletor de data e hora é um controle interno do navegador, que desenha o próprio indicador de foco.
    const internoDoNavegador = elemento.matches('input[type="datetime-local"]') && !elemento.matches(':focus');
    const estilo = getComputedStyle(elemento);
    const largura = estilo.outlineStyle === 'none' ? 0 : parseFloat(estilo.outlineWidth);
    const cor = analisar(estilo.outlineColor) ?? [0, 0, 0, 1];
    let fundo: [number, number, number, number] = [255, 255, 255, 1];
    for (let atual: HTMLElement | null = elemento.parentElement; atual; atual = atual.parentElement) {
      const candidato = analisar(getComputedStyle(atual).backgroundColor);
      if (candidato && candidato[3] > 0.95) {
        fundo = candidato;
        break;
      }
    }
    const rotulo = (elemento.getAttribute('aria-label') ?? elemento.textContent ?? elemento.tagName).trim().slice(0, 40) || elemento.tagName;
    const tipo = elemento.getAttribute('type') ?? '';
    const id = elemento.id ? `#${elemento.id.replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
    return { rotulo: `${elemento.tagName.toLowerCase()}${tipo ? `[${tipo}]` : ''}${id} "${rotulo}"`, larguraDoAnel: largura, contraste: razao(cor, fundo), naPagina: true, internoDoNavegador };
  });
}

for (const tela of TELAS) {
  test(`${tela.nome}: foco visível com 3:1 e sem armadilha`, async ({ page }) => {
    await tela.abrir(page);
    await page.waitForLoadState('networkidle');
    const modal = (await page.getByRole('dialog').count()) > 0;
    // Começa do início do documento, como quem acabou de chegar à tela.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const visitados: string[] = [];
    let anterior = '';
    let repeticoes = 0;
    for (let passo = 0; passo < 60; passo += 1) {
      await page.keyboard.press('Tab');
      const foco = await lerFoco(page);
      if (!foco.naPagina) break;
      if (!foco.internoDoNavegador) {
        expect(foco.larguraDoAnel, `Anel de foco de ${foco.rotulo}`).toBeGreaterThanOrEqual(3);
        expect(foco.contraste, `Contraste do anel de ${foco.rotulo}`).toBeGreaterThanOrEqual(3);
      }
      repeticoes = foco.rotulo === anterior ? repeticoes + 1 : 0;
      // O campo de data e hora tem um segmento focável por parte (dia, mês, ano, hora, minuto): o mesmo elemento repete.
      const limite = foco.rotulo.includes('[datetime-local]') ? 10 : 2;
      expect(repeticoes, `Armadilha de foco em ${foco.rotulo}`).toBeLessThan(limite);
      anterior = foco.rotulo;
      if (visitados.includes(foco.rotulo) && visitados[0] === foco.rotulo) break;
      visitados.push(foco.rotulo);
    }
    expect(visitados.length, 'A tela tem ao menos um controle focável.').toBeGreaterThan(0);
    // Um diálogo modal prende o foco de propósito; sai-se dele pelo Escape.
    if (modal) {
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}

// Funções das histórias 1 a 6 que ainda não tinham percurso só por teclado (as demais estão em auth-session,
// tenant-selection, profile e audit-log).
async function entrarComoAdministrador(page: Page, caminho: string): Promise<void> {
  const backend = new MockBackend();
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Local-only-002!');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  await page.goto(caminho);
}

test.describe('Funções administrativas só pelo teclado', () => {
  test('organizações: abrir o formulário, preencher e criar', async ({ page }) => {
    await entrarComoAdministrador(page, '/admin/tenants');
    await page.getByRole('button', { name: 'Nova organização' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Razão social').focus();
    await page.keyboard.type('Empresa Teclado Ltda.');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Empresa Teclado');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Cadastro feito só com o teclado');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Criar organização' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /criada com sucesso/i })).toBeVisible();
  });

  test('pessoas: bloquear um vínculo pelo diálogo, só com o teclado, e o foco volta ao acionador', async ({ page }) => {
    await entrarComoAdministrador(page, '/admin/membros?organization_id=20000000-0000-0000-0000-00000000000a');
    const acionador = page.getByRole('button', { name: 'Bloquear Operador A' });
    await acionador.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Justificativa da alteração')).toBeFocused();
    await page.keyboard.type('Afastamento temporário aprovado');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Confirmar bloqueio' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: /vínculo atualizado/i })).toBeVisible();
  });

  test('pessoas: o diálogo cancela com Escape e devolve o foco ao botão que o abriu', async ({ page }) => {
    await entrarComoAdministrador(page, '/admin/membros?organization_id=20000000-0000-0000-0000-00000000000a');
    const acionador = page.getByRole('button', { name: 'Bloquear Operador A' });
    await acionador.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(acionador).toBeFocused();
  });

  test('papéis: abrir o formulário de novo papel e marcar uma permissão', async ({ page }) => {
    await entrarComoAdministrador(page, '/admin/papeis');
    await page.getByRole('button', { name: 'Novo papel' }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Nome do papel').focus();
    await page.keyboard.type('Conferente');
    await page.getByRole('checkbox', { name: /audit\.read/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: /audit\.read/ })).toBeChecked();
  });
});
