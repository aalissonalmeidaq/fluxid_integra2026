import { expect, type Page } from '@playwright/test';
import { MockBackend, threeSessions } from './mock-backend';

// Catálogo das telas da Spec 003 para as verificações transversais (T070 a T073): cada item sabe chegar à tela com o
// backend simulado e informa o título que a identifica.
export interface Tela {
  nome: string;
  titulo: string | RegExp;
  abrir: (page: Page) => Promise<void>;
}

const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ORG_B = '20000000-0000-0000-0000-00000000000b';

const vinculo = (organizationId: string, nome: string) => ({
  id: `30000000-0000-0000-0000-00000000000${organizationId.slice(-1)}`,
  organization_id: organizationId,
  status: 'active',
  organizations: { id: organizationId, kind: 'tenant', status: 'active', display_name: nome },
});

async function entrar(page: Page, backend: MockBackend, aal: 'aal1' | 'aal2'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
}

const autenticada = (caminho: string, titulo: string, aal: 'aal1' | 'aal2' = 'aal2') =>
  async (page: Page): Promise<void> => {
    await entrar(page, new MockBackend(), aal);
    await page.goto(caminho);
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  };

const publica = (caminho: string, titulo: string) =>
  async (page: Page): Promise<void> => {
    await new MockBackend().install(page);
    await page.goto(caminho);
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
  };

// Telas de cilindros (Spec 006): perfil com todas as permissões de cilindros no Tenant A.
const cilindros = (caminho: string, titulo: string) =>
  async (page: Page): Promise<void> => {
    await entrar(page, new MockBackend().asProfile('cilindros-admin'), 'aal1');
    await page.goto(caminho);
    await expect(page.getByRole('heading', { level: 2, name: titulo })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /carregando/i })).toHaveCount(0);
  };

export const TELAS: readonly Tela[] = [
  { nome: 'entrada', titulo: 'Bem-vindo de volta', abrir: publica('/', 'Bem-vindo de volta') },
  { nome: 'recuperação: solicitação', titulo: 'Recuperar acesso', abrir: publica('/?recovery=1', 'Recuperar acesso') },
  { nome: 'recuperação: nova senha', titulo: 'Definir nova senha', abrir: publica('/recuperar-senha/confirmar', 'Definir nova senha') },
  {
    nome: 'verificação em duas etapas',
    titulo: 'Verificação em duas etapas',
    abrir: async (page) => {
      const backend = new MockBackend();
      backend.loginResponses = [backend.authenticated('MFA_REQUIRED')];
      backend.statusResponse = backend.activeStatus('aal2', false);
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('global@e2e.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Global-1');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
      await expect(page.getByLabel(/código de 6 dígitos/i)).toBeVisible();
    },
  },
  {
    nome: 'limite de sessões (diálogo)',
    titulo: /limite de sessões/i,
    abrir: async (page) => {
      const backend = new MockBackend();
      backend.loginResponses = [{ status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions: threeSessions } }, backend.authenticated()];
      backend.statusResponse = backend.activeStatus();
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('ana@e2e.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('dialog', { name: /limite de sessões/i })).toBeVisible();
    },
  },
  {
    nome: 'escolha da organização',
    titulo: 'Escolha a organização',
    abrir: async (page) => {
      const backend = new MockBackend();
      backend.tenantMemberships = [vinculo(ORG_A, 'Tenant A'), vinculo(ORG_B, 'Tenant B')];
      await entrar(page, backend, 'aal2');
      await page.goto('/admin/membros');
      await expect(page.getByRole('heading', { name: 'Escolha a organização' })).toBeVisible();
    },
  },
  { nome: 'visão geral', titulo: 'Visão geral', abrir: autenticada('/', 'Visão geral', 'aal1') },
  { nome: 'perfil', titulo: 'Meu perfil', abrir: autenticada('/perfil', 'Meu perfil', 'aal1') },
  { nome: 'organizações', titulo: 'Organizações', abrir: autenticada('/admin/tenants', 'Organizações') },
  { nome: 'pessoas do tenant', titulo: 'Pessoas do tenant', abrir: autenticada('/admin/membros', 'Pessoas do tenant') },
  { nome: 'papéis e permissões', titulo: 'Papéis e permissões', abrir: autenticada('/admin/papeis', 'Papéis e permissões') },
  { nome: 'auditoria do tenant', titulo: 'Auditoria do tenant', abrir: autenticada('/admin/auditoria', 'Auditoria do tenant') },
  { nome: 'auditoria da plataforma', titulo: 'Auditoria da plataforma', abrir: autenticada('/admin/auditoria-global', 'Auditoria da plataforma') },
  { nome: 'lista de cilindros', titulo: 'Cilindros da organização', abrir: cilindros('/cilindros', 'Cilindros da organização') },
  { nome: 'cadastro de cilindro', titulo: 'Cadastrar cilindro', abrir: cilindros('/cilindros/novo', 'Cadastrar cilindro') },
  { nome: 'detalhe de cilindro', titulo: 'Cilindro CIL-001', abrir: cilindros('/cilindros/72000000-0000-4000-8000-000000000001', 'Cilindro CIL-001') },
  { nome: 'entrada no estoque', titulo: 'Entrada no estoque', abrir: cilindros('/estoque/entrada', 'Entrada no estoque') },
];
