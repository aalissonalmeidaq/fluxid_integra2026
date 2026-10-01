import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cores } from '../tokens';
import { verificarUsos } from '../verificar-contraste';
import { Alert } from './alert';
import { Card } from './card';
import { FormSection } from './form-section';
import { List, ListItem } from './list';
import { CORES_DOS_ALERTAS, CORES_DOS_SELOS } from './cores';
import { StatusBadge } from './status-badge';

// RF-007, RF-020: card (raio 12 px, padding 24 px, borda de 1 px e sombra suave), alerta, indicador de status,
// lista e seção de formulário; nada depende só de cor.
describe('Card', () => {
  it('tem raio de 12 px, padding de 24 px, borda de 1 px e sombra suave', () => {
    render(<Card>Conteúdo</Card>);
    const classes = screen.getByText('Conteúdo').className;
    for (const classe of ['rounded-card', 'p-6', 'border', 'shadow-card', 'bg-branco']) expect(classes).toContain(classe);
  });

  it.each(['informativo', 'indicador', 'alerta'] as const)('tem a variante %s', (variant) => {
    render(<Card variant={variant}>Conteúdo</Card>);
    expect(screen.getByText('Conteúdo')).toHaveAttribute('data-variant', variant);
  });

  it('a variante de alerta usa o fundo e a borda de alerta, com texto legível', () => {
    render(<Card variant="alerta">Conteúdo</Card>);
    const classes = screen.getByText('Conteúdo').className;
    expect(classes).toContain('bg-alerta-fundo');
    expect(classes).toContain('text-alerta-texto');
  });

  it('pode ser outro elemento semântico, como section ou article', () => {
    render(<Card as="section" aria-label="Resumo">Conteúdo</Card>);
    expect(screen.getByRole('region', { name: 'Resumo' }).tagName).toBe('SECTION');
  });
});

describe('Alert', () => {
  it('o erro é anunciado como alerta e os demais como status', () => {
    const { rerender } = render(<Alert variant="erro">Falhou</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    for (const variant of ['informacao', 'sucesso', 'alerta'] as const) {
      rerender(<Alert variant={variant}>Mensagem</Alert>);
      expect(screen.getByRole('status')).toHaveTextContent('Mensagem');
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('traz ícone decorativo e texto em todas as variantes, nunca só cor', () => {
    for (const variant of ['informacao', 'sucesso', 'alerta', 'erro'] as const) {
      const { container, unmount } = render(<Alert variant={variant} title="Título">Texto</Alert>);
      expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(container).toHaveTextContent('Título');
      expect(container).toHaveTextContent('Texto');
      unmount();
    }
  });

  it('o texto de cada variante atende 4,5:1 sobre o próprio fundo', () => {
    const usos = Object.values(CORES_DOS_ALERTAS).map(({ texto, fundo }) => ({ texto, fundo, finalidade: 'texto-normal' as const }));
    expect(verificarUsos(cores, usos)).toEqual([]);
  });

  it('aceita um identificador para ser referenciado por aria-describedby', () => {
    render(<Alert variant="erro" id="erro-form">Falhou</Alert>);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'erro-form');
  });
});

describe('StatusBadge', () => {
  it.each(['ativo', 'conectado', 'pendente', 'bloqueado', 'erro'] as const)('a variante %s mostra texto e ícone decorativo', (variant) => {
    const { container } = render(<StatusBadge variant={variant}>Situação</StatusBadge>);
    expect(screen.getByText('Situação')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.firstElementChild).toHaveAttribute('data-variant', variant);
  });

  it('o texto de cada variante atende 4,5:1 sobre o próprio fundo', () => {
    const usos = Object.values(CORES_DOS_SELOS).map(({ texto, fundo }) => ({ texto, fundo, finalidade: 'texto-normal' as const }));
    expect(verificarUsos(cores, usos)).toEqual([]);
  });
});

describe('List', () => {
  it('é uma lista com semântica preservada e itens', () => {
    render(
      <List>
        <ListItem>Primeiro</ListItem>
        <ListItem>Segundo</ListItem>
      </List>,
    );
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('a variante de cartões usa o padrão de card em cada item', () => {
    render(
      <List variant="cartoes">
        <ListItem>Item</ListItem>
      </List>,
    );
    expect(screen.getByRole('listitem').className).toContain('rounded-card');
    expect(screen.getByRole('list')).toHaveAttribute('data-variant', 'cartoes');
  });

  it('nomes longos quebram sem estourar o contêiner', () => {
    render(
      <List>
        <ListItem>{'Organização com um nome extremamente longo '.repeat(5)}</ListItem>
      </List>,
    );
    const classes = screen.getByRole('listitem').className;
    expect(classes).toContain('min-w-0');
    expect(classes).toContain('break-words');
  });
});

describe('FormSection', () => {
  it('agrupa campos em fieldset com legend', () => {
    render(
      <FormSection legend="Dados pessoais" description="Informações do seu perfil.">
        <input aria-label="Nome" />
      </FormSection>,
    );
    const grupo = screen.getByRole('group', { name: 'Dados pessoais' });
    expect(grupo.tagName).toBe('FIELDSET');
    expect(grupo).toHaveAccessibleDescription('Informações do seu perfil.');
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });
});
