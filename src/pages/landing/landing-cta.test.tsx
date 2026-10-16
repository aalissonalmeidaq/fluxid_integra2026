import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import type { AuthState } from '@/domain/identity/session';
import { LandingCta } from './landing-cta';

// Spec 011, T015 (RF-003, História 1): o botão principal depende só do estado da sessão, sem chamada ao servidor, e a troca do
// rótulo não desloca o layout.
const contexto = (state: AuthState): AuthContextValue => ({
  state,
  login: async () => ({ kind: 'unavailable' }),
  logout: async () => undefined,
  confirmMfa: async () => false,
  mfa: null,
});

const renderizar = (state: AuthState, props: { variante?: 'principal' | 'cabecalho' } = {}) =>
  render(<AuthContext.Provider value={contexto(state)}><LandingCta {...props} /></AuthContext.Provider>);

describe('LandingCta', () => {
  it.each<[string, AuthState]>([
    ['sessão em verificação', { status: 'checking' }],
    ['sem sessão', { status: 'signed_out' }],
    ['segundo fator pendente', { status: 'mfa_required' }],
  ])('%s: "Entrar no sistema" leva a /login', (_, state) => {
    renderizar(state);
    const link = screen.getByRole('link', { name: 'Entrar no sistema' });
    expect(link).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Abrir o sistema' })).not.toBeInTheDocument();
  });

  it.each<[string, AuthState]>([
    ['sessão autenticada', { status: 'authenticated', aal: 'aal1' }],
    ['sessão autenticada com segundo fator', { status: 'authenticated', aal: 'aal2' }],
    ['acesso offline restrito', { status: 'authenticated', aal: 'aal1', offline: true }],
  ])('%s: "Abrir o sistema" leva a /visao-geral', (_, state) => {
    renderizar(state);
    const link = screen.getByRole('link', { name: 'Abrir o sistema' });
    expect(link).toHaveAttribute('href', '/visao-geral');
    expect(screen.queryByRole('link', { name: 'Entrar no sistema' })).not.toBeInTheDocument();
  });

  it('é um link (ativado por Enter) e não um botão: a navegação é por carga de página', () => {
    renderizar({ status: 'signed_out' });
    expect(screen.getByRole('link', { name: 'Entrar no sistema' }).tagName).toBe('A');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reserva a largura do rótulo mais longo, para a troca não deslocar o layout', () => {
    const { container, unmount } = renderizar({ status: 'signed_out' });
    const reserva = container.querySelector('[data-reserva]');
    expect(reserva).toHaveAttribute('aria-hidden', 'true');
    expect(reserva).toHaveTextContent('Entrar no sistema');
    unmount();
    const depois = renderizar({ status: 'authenticated', aal: 'aal1' });
    expect(depois.container.querySelector('[data-reserva]')).toHaveTextContent('Entrar no sistema');
  });

  it('a reserva fica fora do nome acessível', () => {
    renderizar({ status: 'signed_out' });
    expect(screen.getByRole('link')).toHaveAccessibleName('Entrar no sistema');
  });

  it('a variante do cabeçalho mantém o mesmo destino e o mesmo nome', () => {
    renderizar({ status: 'authenticated', aal: 'aal1' }, { variante: 'cabecalho' });
    expect(screen.getByRole('link', { name: 'Abrir o sistema' })).toHaveAttribute('href', '/visao-geral');
  });
});
