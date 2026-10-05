import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordField } from './password-field';

// RF-005, RF-033, RA-005: senha oculta por padrão, botão com estado informado, foco e valor preservados, nada registrado.
function Controlado() {
  const [valor, setValor] = useState('');
  return <PasswordField label="Senha" autoComplete="current-password" value={valor} onChange={(event) => setValor(event.target.value)} />;
}

describe('PasswordField', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mostra a senha oculta por padrão e o botão "Mostrar senha" com aria-pressed falso', () => {
    render(<Controlado />);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('alterna para "Ocultar senha" com aria-pressed verdadeiro, mantendo foco e valor', () => {
    render(<Controlado />);
    const campo = screen.getByLabelText('Senha');
    fireEvent.change(campo, { target: { value: 'Segredo-123' } });
    campo.focus();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(campo).toHaveAttribute('type', 'text');
    expect(campo).toHaveValue('Segredo-123');
    expect(campo).toHaveFocus();
    const botao = screen.getByRole('button', { name: 'Ocultar senha' });
    expect(botao).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(botao);
    expect(campo).toHaveAttribute('type', 'password');
  });

  it('o botão tem alvo de 44 por 44 px', () => {
    render(<Controlado />);
    expect(screen.getByRole('button', { name: 'Mostrar senha' }).className).toMatch(/min-h-alvo/);
    expect(screen.getByRole('button', { name: 'Mostrar senha' }).className).toMatch(/min-w-alvo/);
  });

  it('não copia a senha para atributos além de value nem a registra no console', () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((metodo) => vi.spyOn(console, metodo).mockImplementation(() => undefined));
    const { container } = render(<Controlado />);
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Segredo-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    for (const elemento of container.querySelectorAll('*')) {
      for (const atributo of Array.from(elemento.attributes)) {
        if (atributo.name === 'value') continue;
        expect(atributo.value).not.toContain('Segredo-123');
      }
    }
    for (const espiao of espioes) expect(espiao).not.toHaveBeenCalled();
  });

  it('repassa a ref ao campo e o erro ao rótulo', () => {
    render(<PasswordField label="Senha" error="Informe sua senha." />);
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Informe sua senha.');
  });
});
