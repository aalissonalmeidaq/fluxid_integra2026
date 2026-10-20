import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { AuthContext, type AuthContextValue } from './auth/auth-context';

// Spec 011, T005 (RF-001, RF-003, RF-004, RF-015): "/" é a landing pública, fora do shell e das rotas protegidas; a Visão geral
// vive em "/visao-geral"; "/login" e rotas desconhecidas continuam caindo no desvio final protegido.
vi.mock('./routing/protected-route', () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => <div data-testid="protegida">{children}</div> }));
vi.mock('./shell/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock('./tenant/tenant-gate', () => ({ TenantGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/pages/overview/overview-page', () => ({ OverviewPage: () => <p>Conteúdo da Visão geral</p> }));
vi.mock('@/pages/landing/landing-page', () => ({ LandingPage: () => <p>Conteúdo da landing</p> }));

const autenticado: AuthContextValue = {
  state: { status: 'authenticated', aal: 'aal1' },
  login: async () => ({ kind: 'unavailable' }),
  logout: async () => undefined,
    };

const modoInstalado = (instalado: boolean): void => {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: instalado && consulta.includes('display-mode: standalone'),
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  }));
};

afterEach(() => {
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('Rota raiz: landing pública', () => {
  it('"/" mostra a landing, sem shell e sem rota protegida', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Conteúdo da landing')).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protegida')).not.toBeInTheDocument();
    expect(screen.queryByText('Conteúdo da Visão geral')).not.toBeInTheDocument();
  });

  it('"/visao-geral" mostra a Visão geral dentro do shell e da rota protegida', async () => {
    window.history.pushState({}, '', '/visao-geral');
    render(<App />);
    expect(await screen.findByText('Conteúdo da Visão geral')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByTestId('protegida')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo da landing')).not.toBeInTheDocument();
  });

  it.each(['/login', '/rota-que-nao-existe'])('%s continua no desvio final protegido (Visão geral para quem tem sessão, login para quem não tem)', async (caminho) => {
    window.history.pushState({}, '', caminho);
    render(<App />);
    expect(await screen.findByText('Conteúdo da Visão geral')).toBeInTheDocument();
    expect(screen.getByTestId('protegida')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo da landing')).not.toBeInTheDocument();
  });
});

describe('Endereço depois de autenticar (F1)', () => {
  it('com sessão autenticada em /login, a URL passa a /visao-geral sem recarregar', async () => {
    window.history.pushState({}, '', '/login');
    render(<AuthContext.Provider value={autenticado}><App /></AuthContext.Provider>);
    expect(await screen.findByText('Conteúdo da Visão geral')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/visao-geral');
  });

  it('sem sessão, /login permanece em /login (o login é exibido)', async () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(await screen.findByText('Conteúdo da Visão geral')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('com sessão autenticada, "/" continua sendo a landing (a pessoa escolhe abrir o sistema)', async () => {
    window.history.pushState({}, '', '/');
    render(<AuthContext.Provider value={autenticado}><App /></AuthContext.Provider>);
    expect(await screen.findByText('Conteúdo da landing')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});

describe('Aplicativo instalado (F2)', () => {
  it('em modo instalado, "/" redireciona para /visao-geral sem passar pela landing', async () => {
    modoInstalado(true);
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Conteúdo da Visão geral')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/visao-geral');
    expect(screen.queryByText('Conteúdo da landing')).not.toBeInTheDocument();
  });

  it('no navegador comum, "/" mostra a landing', async () => {
    modoInstalado(false);
    window.history.pushState({}, '', '/');
    render(<App />);
    expect(await screen.findByText('Conteúdo da landing')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});
