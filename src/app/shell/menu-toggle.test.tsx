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
    expect(button.className).toContain('min-w-alvo');
    expect(button.className).toContain('tablet:hidden');
  });

  it('expõe o botão por ref para devolver o foco', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<MenuToggle ref={ref} expanded={false} controls="menu-principal" onToggle={vi.fn()} />);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Menu' }));
  });
});
