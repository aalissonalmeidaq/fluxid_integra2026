import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import { TenantContext, type TenantContextValue } from '@/app/tenant/tenant-context';
import { OverviewPage } from './overview-page';

// RF-008 a RF-016, RF-023, RF-032, CA-003, CA-009: a Visão geral mostra só dados de exemplo, todos rotulados, sem rede.
const TITULOS_DOS_BLOCOS = [
  'Indicadores principais',
  'Cilindros e viagens no mapa',
  'Movimentação de cilindros',
  'Cilindros por situação',
  'Alertas recentes',
  'Cilindros recentes',
  'Desempenho operacional',
];

async function renderizar() {
  const resultado = render(<OverviewPage />);
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  return resultado;
}

describe('OverviewPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mostra o título "Visão geral" como h2, o subtítulo e a identificação de dados de exemplo', async () => {
    await renderizar();
    expect(screen.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByText(/dados de exemplo/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('mostra os quatro cartões de indicadores com ícone, valor, rótulo e nota', async () => {
    await renderizar();
    const bloco = screen.getByRole('region', { name: 'Indicadores principais' });
    for (const rotulo of ['Cilindros cadastrados', 'Em viagem', 'Alertas críticos', 'Lacres conectados']) {
      expect(within(bloco).getByText(rotulo)).toBeInTheDocument();
    }
    expect(within(bloco).getAllByRole('listitem')).toHaveLength(4);
    expect(bloco.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
  });

  it('traz os sete blocos, cada um como região com título h3, nome acessível e a marca "Exemplo"', async () => {
    await renderizar();
    for (const titulo of TITULOS_DOS_BLOCOS) {
      const regiao = screen.getByRole('region', { name: titulo });
      expect(within(regiao).getByRole('heading', { level: 3, name: titulo })).toBeInTheDocument();
      expect(regiao).toHaveTextContent('Exemplo');
    }
    const regioes = screen.getAllByRole('region');
    expect(regioes).toHaveLength(TITULOS_DOS_BLOCOS.length);
    for (const regiao of regioes) {
      expect(regiao).toHaveAccessibleName();
      expect(regiao).toHaveTextContent('Exemplo');
    }
  });

  it('o mapa mostra a região de exemplo, com texto de fase futura e sem marcador de operação', async () => {
    await renderizar();
    const mapa = screen.getByRole('region', { name: 'Cilindros e viagens no mapa' });
    expect(mapa).toHaveTextContent(/fase futura/i);
    expect(mapa.querySelector('.fluxid-map-point, [data-marker]')).toBeNull();
    expect(await within(mapa).findByRole('group', { name: 'Mapa da região de exemplo' })).toBeInTheDocument();
  });

  it('os gráficos de movimentação e de situação têm descrição e tabela equivalente', async () => {
    await renderizar();
    const movimentacao = screen.getByRole('region', { name: 'Movimentação de cilindros' });
    expect(within(movimentacao).getByRole('img', { name: /movimentação/i })).toBeInTheDocument();
    expect(within(movimentacao).getByRole('table')).toBeInTheDocument();
    const situacao = screen.getByRole('region', { name: 'Cilindros por situação' });
    expect(within(situacao).getByRole('img')).toBeInTheDocument();
    expect(within(situacao).getByRole('table')).toBeInTheDocument();
    expect(within(situacao).getByRole('list', { name: 'Legenda' })).toHaveTextContent('46%');
  });

  it('as listas de alertas e de cilindros recentes e as três medidas aparecem com o vocabulário do PRD', async () => {
    await renderizar();
    expect(within(screen.getByRole('region', { name: 'Alertas recentes' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('region', { name: 'Cilindros recentes' })).getAllByRole('listitem').length).toBeGreaterThan(0);
    const medidas = screen.getByRole('region', { name: 'Desempenho operacional' });
    expect(medidas).toHaveTextContent('Cilindros com teste hidrostático em dia');
    expect(medidas).toHaveTextContent('Tempo médio de retorno de cilindros');
    expect(medidas).toHaveTextContent('Alertas tratados');
  });

  it('não tem "Ver todos", busca, ajuda, notificações nem o texto da fundação técnica', async () => {
    await renderizar();
    expect(screen.queryByText(/ver todos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/ajuda|notificações/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fundação técnica ativa/i)).not.toBeInTheDocument();
  });

  it('não faz requisição de rede e produz o mesmo conteúdo para duas pessoas e dois tenants', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const auth: AuthContextValue = { state: { status: 'authenticated', aal: 'aal1' }, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), mfa: null };
    const tenant = (organizationId: string, displayName: string): TenantContextValue => ({
      status: 'ready',
      selection: { kind: 'selected', option: { organizationId, displayName, kind: 'tenant' } },
      options: [{ organizationId, displayName, kind: 'tenant' }],
      activeOrganizationId: organizationId,
      switching: false,
      select: vi.fn(),
      beginSwitch: vi.fn(),
      cancelSwitch: vi.fn(),
      reload: vi.fn(),
    });
    const html: string[] = [];
    for (const [org, nome] of [['org-a', 'Gases Norte'], ['org-b', 'Gases Sul']] as const) {
      const { container, unmount } = render(
        <AuthContext.Provider value={auth}><TenantContext.Provider value={tenant(org, nome)}><OverviewPage /></TenantContext.Provider></AuthContext.Provider>,
      );
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
      // O interior do mapa é montado pelo Leaflet (painéis, blocos e posições calculadas em momentos que dependem da carga da
      // máquina); o que deve coincidir é o conteúdo do FluxID, incluindo o quadro do mapa e o nome acessível dele.
      // Os atributos da raiz também são do Leaflet (classes de animação e de arrasto que mudam com o tempo): só ficam o papel e o nome acessível.
      container.querySelectorAll('.fluxid-map').forEach((mapa) => {
        const [papel, nome] = [mapa.getAttribute('role'), mapa.getAttribute('aria-label')];
        mapa.replaceChildren();
        mapa.getAttributeNames().forEach((atributo) => mapa.removeAttribute(atributo));
        mapa.setAttribute('data-mapa', '');
        if (papel) mapa.setAttribute('role', papel);
        if (nome) mapa.setAttribute('aria-label', nome);
      });
      // Os identificadores gerados pelo React mudam a cada montagem; o conteúdo é o que deve coincidir.
      html.push(container.innerHTML.replace(/(id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, '$1=""').replace(/url\(#[^)]*\)/g, 'url(#)'));
      unmount();
    }
    // Se divergirem, o trecho em que começam a diferir aparece na mensagem de falha (a comparação inteira é longa demais para ler).
    const [a, b] = [html[0] ?? '', html[1] ?? ''];
    let diferenca = 0;
    while (diferenca < a.length && a[diferenca] === b[diferenca]) diferenca += 1;
    expect(b.slice(Math.max(0, diferenca - 160), diferenca + 160)).toBe(a.slice(Math.max(0, diferenca - 160), diferenca + 160));
    expect(html[0]).toBe(html[1]);
    expect(html[0]).not.toMatch(/Gases Norte|Gases Sul|org-a|org-b/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cada cartão de indicador tem uma cor própria, com ícone e rótulo', async () => {
    await renderizar();
    const cartoes = within(screen.getByRole('region', { name: 'Indicadores principais' })).getAllByRole('listitem');
    const tons = cartoes.map((cartao) => cartao.getAttribute('data-tone'));
    expect(tons).toEqual(['cadastro', 'viagem', 'critico', 'sucesso']);
    expect(new Set(cartoes.map((cartao) => cartao.className)).size).toBe(4);
  });

  it('os alertas novos têm o destaque "Novo" e cada alerta leva à página de alertas com o alerta escolhido', async () => {
    await renderizar();
    const regiao = screen.getByRole('region', { name: 'Alertas recentes' });
    const links = within(regiao).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute('href', '/alertas?alerta=EX-A-01');
    expect(within(links[0] as HTMLElement).getByText('Novo')).toBeInTheDocument();
    expect(within(links[2] as HTMLElement).queryByText('Novo')).not.toBeInTheDocument();
    expect(within(regiao).getByText(/2 novos/i)).toBeInTheDocument();
  });
});
