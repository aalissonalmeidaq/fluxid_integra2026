import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { RegistryRoute } from '@/app/registry/registry-routes';
import { RegistryArea } from './registry-area';

const ID = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';

describe('RegistryArea', () => {
  it('rota sem tela registrada mostra o estado "Página não encontrada", sem quebrar', () => {
    render(<RegistryArea route={{ area: 'customers', kind: 'not_found' }} />);
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
  });

  it('as rotas de cadastro e edição abrem um modal; as demais, não', () => {
    // Os formulários e as telas de trás pedem o servidor; sem serviço eles mostram o estado de erro, o que basta para ver o modal.
    const { unmount } = render(<RegistryArea route={{ area: 'vehicles', kind: 'new' }} />);
    expect(screen.getByRole('dialog', { name: 'Cadastrar veículo' })).toBeInTheDocument();
    unmount();
    render(<RegistryArea route={{ area: 'customers', kind: 'not_found' }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each<[RegistryRoute, string, string]>([
    [{ area: 'customers', kind: 'new' }, 'Cadastrar cliente', '/clientes'],
    [{ area: 'customers', kind: 'edit', id: ID }, 'Editar cliente', `/clientes/${ID}`],
    [{ area: 'customers', kind: 'site_new', customerId: ID }, 'Cadastrar unidade', `/clientes/${ID}`],
    [{ area: 'customers', kind: 'site_edit', customerId: ID, siteId: SITE }, 'Editar unidade', `/clientes/${ID}/unidades/${SITE}`],
    [{ area: 'geofences', kind: 'new' }, 'Cadastrar geocerca', '/geocercas'],
    [{ area: 'geofences', kind: 'edit', id: ID }, 'Editar geocerca', `/geocercas/${ID}`],
    [{ area: 'vehicles', kind: 'new' }, 'Cadastrar veículo', '/veiculos'],
    [{ area: 'vehicles', kind: 'edit', id: ID }, 'Editar veículo', `/veiculos/${ID}`],
    [{ area: 'drivers', kind: 'new' }, 'Cadastrar motorista', '/motoristas'],
    [{ area: 'drivers', kind: 'edit', id: ID }, 'Editar motorista', `/motoristas/${ID}`],
  ])('a rota %j abre o modal "%s" e Escape leva ao endereço pai %s', async (route, title, parent) => {
    window.history.replaceState(null, '', '/qualquer');
    render(<RegistryArea route={route} />);
    expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(window.location.pathname).toBe(parent));
  });

  it.each<RegistryRoute>([
    { area: 'customers', kind: 'list' }, { area: 'customers', kind: 'detail', id: ID }, { area: 'customers', kind: 'site_detail', customerId: ID, siteId: SITE },
    { area: 'geofences', kind: 'list' }, { area: 'geofences', kind: 'detail', id: ID }, { area: 'vehicles', kind: 'list' }, { area: 'vehicles', kind: 'detail', id: ID },
    { area: 'drivers', kind: 'list' }, { area: 'drivers', kind: 'detail', id: ID },
  ])('a rota %j mostra a tela sem modal e sem "Página não encontrada"', async (route) => {
    render(<RegistryArea route={route} />);
    await waitFor(() => expect(screen.queryByText('Carregando a página…')).not.toBeInTheDocument(), { timeout: 15000 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Página não encontrada')).not.toBeInTheDocument();
  });

  it('as áreas de rota inexistente mostram "Página não encontrada" em cada área', () => {
    for (const area of ['geofences', 'vehicles', 'drivers'] as const) {
      const { unmount } = render(<RegistryArea route={{ area, kind: 'not_found' }} />);
      expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
      unmount();
    }
  });
});

describe('RegistryArea: links de cadastro abrem o modal sem recarregar', () => {
  afterEach(() => { document.body.querySelectorAll('a[data-teste]').forEach((anchor) => anchor.remove()); });

  const link = (href: string, attrs: Record<string, string> = {}): HTMLAnchorElement => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = 'ir';
    anchor.dataset.teste = 'sim';
    for (const [name, value] of Object.entries(attrs)) anchor.setAttribute(name, value);
    document.body.append(anchor);
    return anchor;
  };

  it('o clique simples em âncora de cadastro troca só o endereço e marca a entrada como aberta de dentro do app', () => {
    window.history.replaceState(null, '', '/clientes');
    render(<RegistryArea route={{ area: 'customers', kind: 'list' }} />);
    const anchor = link('/clientes/novo');
    expect(fireEvent.click(anchor)).toBe(false);
    expect(window.location.pathname).toBe('/clientes/novo');
    expect(window.history.state).toEqual({ fluxidModal: true });
  });

  it.each([
    ['âncora para uma tela que não é formulário', '/clientes', {}],
    ['alvo em outra aba', '/clientes/novo', { target: '_blank' }],
    ['download', '/clientes/novo', { download: '' }],
  ])('%s não é interceptada', (_name, href, attrs) => {
    window.history.replaceState(null, '', '/clientes');
    render(<RegistryArea route={{ area: 'customers', kind: 'list' }} />);
    const anchor = link(href, attrs);
    anchor.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(anchor);
    expect(window.location.pathname).toBe('/clientes');
  });

  it('clique com Ctrl e clique fora de âncora seguem o comportamento do navegador', () => {
    window.history.replaceState(null, '', '/clientes');
    render(<RegistryArea route={{ area: 'customers', kind: 'list' }} />);
    const anchor = link('/clientes/novo');
    anchor.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(anchor, { ctrlKey: true });
    fireEvent.click(document.body);
    expect(window.location.pathname).toBe('/clientes');
  });
});
