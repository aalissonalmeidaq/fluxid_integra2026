import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

// A autenticação tem testes próprios; aqui o foco é o carregamento assíncrono das rotas (RNF-003).
vi.mock('./routing/protected-route', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/pages/overview/overview-page', () => ({ OverviewPage: () => <p>Conteúdo da Visão geral</p> }));
vi.mock('./tenant/tenant-gate', () => ({ TenantGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/pages/cylinders/cylinder-area', () => ({ CylinderArea: ({ route }: { route: { kind: string } }) => <p>Conteúdo de cilindros: {route.kind}</p> }));
vi.mock('@/pages/alerts/alerts-page', () => ({ AlertsPage: () => <p>Conteúdo dos alertas</p> }));

afterEach(() => window.history.pushState({}, '', '/'));

describe('Rotas carregadas sob demanda (RNF-003)', () => {
  it.each([
    ['/', 'Conteúdo da Visão geral'],
    ['/alertas', 'Conteúdo dos alertas'],
    ['/cilindros/novo', 'Conteúdo de cilindros: new'],
  ])('%s mostra o fallback acessível e depois a página', async (path, conteudo) => {
    window.history.pushState({}, '', path);
    render(<App />);

    const status = screen.getByText('Carregando a página…').closest('[role="status"]');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText(conteudo)).not.toBeInTheDocument();

    expect(await screen.findByText(conteudo)).toBeInTheDocument();
    expect(screen.queryByText('Carregando a página…')).not.toBeInTheDocument();
  });
});
