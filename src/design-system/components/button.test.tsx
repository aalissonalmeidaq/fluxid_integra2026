import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cores, type UsoDeCor } from '../tokens';
import { verificarUsos } from '../verificar-contraste';
import { Button } from './button';
import { CORES_DAS_VARIANTES } from './cores';

// RF-007, RF-008: botão primário, secundário e perigoso, com estados normal, foco, desabilitado e carregando,
// alvo de toque de 44 px e rótulo com contraste suficiente.
describe('Button', () => {
  it('é um button nativo do tipo "button" por padrão e dispara o clique', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao).toHaveAttribute('type', 'button');
    fireEvent.click(botao);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('aceita type="submit"', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it.each([
    ['primario', 'bg-azul-profundo'],
    ['secundario', 'border-azul-profundo'],
    ['perigoso', 'bg-erro'],
  ] as const)('a variante %s aplica %s', (variant, classe) => {
    render(<Button variant={variant}>Ação</Button>);
    const botao = screen.getByRole('button', { name: 'Ação' });
    expect(botao).toHaveAttribute('data-variant', variant);
    expect(botao.className).toContain(classe);
  });

  it('o rótulo de cada variante atende 4,5:1 contra o fundo (texto normal)', () => {
    const usos: UsoDeCor[] = Object.values(CORES_DAS_VARIANTES).map(({ texto, fundo }) => ({ texto, fundo, finalidade: 'texto-normal' }));
    expect(verificarUsos(cores, usos)).toEqual([]);
  });

  it('tem alvo de toque mínimo de 44 px', () => {
    render(<Button>Ação</Button>);
    const classes = screen.getByRole('button').className;
    expect(classes).toContain('min-h-alvo');
    expect(classes).toContain('min-w-alvo');
  });

  it('desabilitado usa o atributo disabled e não dispara o clique', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Ação</Button>);
    const botao = screen.getByRole('button', { name: 'Ação' });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carregando marca aria-busy, ignora o clique e mantém o nome acessível', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Salvar alterações</Button>);
    const botao = screen.getByRole('button', { name: 'Salvar alterações' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(botao);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carregando pode trocar o texto visível sem perder o botão', () => {
    render(<Button loading loadingLabel="Salvando…">Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeInTheDocument();
  });

  it('o indicador de carregamento é decorativo e respeita movimento reduzido', () => {
    const { container } = render(<Button loading>Salvar</Button>);
    const indicador = container.querySelector('[data-indicador]') as HTMLElement;
    expect(indicador).toHaveAttribute('aria-hidden', 'true');
    expect(indicador.className).toContain('motion-safe:animate-spin');
  });

  it('mantém o foco no botão quando está carregando (não usa disabled)', () => {
    render(<Button loading>Salvar</Button>);
    const botao = screen.getByRole('button');
    botao.focus();
    expect(botao).toHaveFocus();
  });

  it('repassa atributos nativos e uma referência', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref} name="acao" aria-label="Fechar painel">x</Button>);
    expect(screen.getByRole('button', { name: 'Fechar painel' })).toHaveAttribute('name', 'acao');
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
