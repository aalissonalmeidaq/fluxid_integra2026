import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MenuToggle } from './menu-toggle';

describe('MenuToggle (RF-012, RF-014)', () => {
  it('é um botão "Menu" com aria-expanded e aria-controls', () => {
    render(<MenuToggle expanded={false} controls="menu-principal" onToggle={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'menu-principal');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('reflete o estado aberto', () => {
    render(<MenuToggle expanded controls="menu-principal" onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('aciona onToggle ao clicar (e, pelo navegador, com Enter e Espaço)', () => {
    const onToggle = vi.fn();
    render(<MenuToggle expanded={false} controls="menu-principal" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('tem alvo de 44 px e só existe abaixo de 768 px', () => {
    render(<MenuToggle expanded={false} controls="menu-principal" onToggle={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button.className).toContain('min-h-alvo');
    expect(button.className).toContain('fixed');
    expect(button.className).toContain('end-2');
    expect(button.className).toContain('min-w-alvo');
    expect(button.className).toContain('tablet:hidden');
  });

  it('expõe o botão por ref para devolver o foco', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<MenuToggle ref={ref} expanded={false} controls="menu-principal" onToggle={vi.fn()} />);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Menu' }));
  });
});

describe('MenuToggle: ícone fixado à direita (Spec 005)', () => {
  it('é só o ícone, sem texto visível, e vira "X" quando aberto', () => {
    const { rerender, container } = render(<MenuToggle expanded={false} controls="menu-principal" onToggle={vi.fn()} />);
    const botao = screen.getByRole('button', { name: 'Menu' });
    expect(botao.textContent).toBe('');
    expect(container.querySelectorAll('svg line')).toHaveLength(3);
    rerender(<MenuToggle expanded controls="menu-principal" onToggle={vi.fn()} />);
    expect(container.querySelectorAll('svg line')).toHaveLength(2);
    expect(botao.className).not.toMatch(/(^|\s)border(\s|$)/);
  });
});
