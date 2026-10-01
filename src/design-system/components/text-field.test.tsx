import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './field';
import { Select } from './select';
import { TextField } from './text-field';

// RF-007, RF-010: rótulo visível, ajuda e erro ligados ao controle, erro com texto e ícone (nunca só cor).
describe('TextField', () => {
  it('liga o rótulo visível ao campo', () => {
    render(<TextField label="E-mail" />);
    expect(screen.getByLabelText('E-mail')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByText('E-mail').tagName).toBe('LABEL');
  });

  it.each([
    ['text', 'textbox'],
    ['email', 'textbox'],
    ['password', null],
    ['file', null],
  ] as const)('aceita o tipo %s', (type, papel) => {
    render(<TextField label="Campo" type={type} />);
    const campo = screen.getByLabelText('Campo');
    expect(campo).toHaveAttribute('type', type);
    if (papel) expect(screen.getByRole(papel)).toBe(campo);
  });

  it('descreve o campo pela ajuda', () => {
    render(<TextField label="Nome" help="Como aparece para os colegas." />);
    expect(screen.getByLabelText('Nome')).toHaveAccessibleDescription('Como aparece para os colegas.');
  });

  it('o erro marca aria-invalid, é descrição do campo e traz ícone além do texto', () => {
    const { container } = render(<TextField label="Nome" help="Dica" error="Informe o nome." />);
    const campo = screen.getByLabelText('Nome');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Dica Informe o nome.');
    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('o rótulo não inclui o texto do erro no nome acessível', () => {
    render(<TextField label="Nome" error="Informe o nome." />);
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
  });

  it('sem erro não marca aria-invalid como verdadeiro', () => {
    render(<TextField label="Nome" />);
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'false');
  });

  it('desabilitado usa o atributo disabled', () => {
    render(<TextField label="Nome" disabled />);
    expect(screen.getByLabelText('Nome')).toBeDisabled();
  });

  it('tem alvo de 44 px, borda de componente com contraste e borda de erro quando inválido', () => {
    const { rerender } = render(<TextField label="Nome" />);
    expect(screen.getByLabelText('Nome').className).toContain('min-h-alvo');
    expect(screen.getByLabelText('Nome').className).toContain('border-borda-controle');
    rerender(<TextField label="Nome" error="Erro" />);
    expect(screen.getByLabelText('Nome').className).toContain('border-erro');
  });

  it('repassa atributos nativos e a referência', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<TextField ref={ref} label="Senha" type="password" name="senha" autoComplete="current-password" required />);
    const campo = screen.getByLabelText(/Senha/);
    expect(campo).toHaveAttribute('name', 'senha');
    expect(campo).toHaveAttribute('autocomplete', 'current-password');
    expect(campo).toBeRequired();
    expect(ref.current).toBe(campo);
  });
});

describe('Select', () => {
  it('liga rótulo, ajuda e erro ao seletor nativo', () => {
    render(
      <Select label="Papel" help="Escolha um papel." error="Selecione um papel.">
        <option value="">Selecione</option>
        <option value="admin">Administrador</option>
      </Select>,
    );
    const seletor = screen.getByLabelText('Papel');
    expect(seletor).toBeInstanceOf(HTMLSelectElement);
    expect(seletor).toHaveAttribute('aria-invalid', 'true');
    expect(seletor).toHaveAccessibleDescription('Escolha um papel. Selecione um papel.');
    expect(seletor.className).toContain('min-h-alvo');
  });

  it('desabilitado usa o atributo disabled', () => {
    render(<Select label="Papel" disabled><option>Um</option></Select>);
    expect(screen.getByLabelText('Papel')).toBeDisabled();
  });
});

describe('Field (compatível com o FormField da Spec 002)', () => {
  it('entrega as propriedades de acessibilidade ao controle que o chama', () => {
    render(
      <Field label="Motivo" error="Obrigatório">
        {(controle) => <textarea {...controle} />}
      </Field>,
    );
    const campo = screen.getByLabelText('Motivo');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('Obrigatório');
  });
});
