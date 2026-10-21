import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext } from '@/app/auth/auth-context';

// Spec 014, História 4 (RF-009): com VITE_DEMO_ACCESS=false, a tela de login não tem o botão nem o modal dos acessos de teste.
// A decisão é tomada quando o módulo carrega (no build, o Vite troca a expressão por uma constante), então cada caso recarrega a tela.
async function renderLogin() {
  vi.resetModules();
  const { LoginPage } = await import('./login-page');
  render(<AuthContext.Provider value={{ state: { status: 'signed_out' }, login: vi.fn(), logout: vi.fn() }}><LoginPage /></AuthContext.Provider>);
}

describe('LoginPage: acessos de teste desligados', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('com VITE_DEMO_ACCESS=false, não há botão nem credencial de demonstração', async () => {
    vi.stubEnv('VITE_DEMO_ACCESS', 'false');
    await renderLogin();
    await screen.findByRole('button', { name: 'Entrar' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: 'Acessos de teste' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/demo\.fluxid\.invalid|FluxID-Demo/);
  });

  it('com qualquer outro valor, o botão aparece', async () => {
    vi.stubEnv('VITE_DEMO_ACCESS', 'true');
    await renderLogin();
    expect(await screen.findByRole('button', { name: 'Acessos de teste' })).toBeInTheDocument();
  });
});
