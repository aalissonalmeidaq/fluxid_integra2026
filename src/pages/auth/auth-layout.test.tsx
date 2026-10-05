import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthLayout } from './auth-layout';

// RF-001, RF-007: moldura pública com painel de marca; duas colunas a partir de 1024 px, uma abaixo, sem barra superior nem menu.
describe('AuthLayout', () => {
  it('põe o painel de marca antes do formulário no DOM', () => {
    render(<AuthLayout><form aria-label="Formulário">campos</form></AuthLayout>);
    const painel = screen.getByRole('heading', { level: 1 });
    const formulario = screen.getByRole('form', { name: 'Formulário' });
    expect(painel.compareDocumentPosition(formulario) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('usa duas colunas a partir do ponto de quebra desktop e uma coluna abaixo', () => {
    const { container } = render(<AuthLayout><p>conteúdo</p></AuthLayout>);
    const grade = container.firstElementChild as HTMLElement;
    expect(grade.className).toMatch(/desktop:grid-cols-2/);
    expect(grade.className).not.toMatch(/(^|\s)grid-cols-2/);
  });

  it('não tem barra superior nem menu', () => {
    render(<AuthLayout><p>conteúdo</p></AuthLayout>);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('tem um só h1 (o logotipo do painel)', () => {
    render(<AuthLayout><h2>Bem-vindo de volta</h2></AuthLayout>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('mostra "Instalar App" só quando o app é instalável', () => {
    render(<AuthLayout><p>conteúdo</p></AuthLayout>);
    expect(screen.queryByRole('button', { name: 'Instalar App' })).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' }) })); });
    expect(screen.getByRole('button', { name: 'Instalar App' })).toBeInTheDocument();
  });
});
