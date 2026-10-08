import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentField } from './document-field';

describe('DocumentField (RF-002)', () => {
  it.each([
    ['legal', 'CNPJ', /alfanumérico/],
    ['individual', 'CPF', /Só números/],
    ['', 'Documento', /Escolha antes o tipo de pessoa/],
  ] as const)('o tipo "%s" muda o rótulo para %s e a ajuda', (personType, rotulo, ajuda) => {
    render(<DocumentField personType={personType} value="" onChange={() => undefined} />);
    expect(screen.getByLabelText(rotulo)).toBeInTheDocument();
    expect(screen.getByText(ajuda)).toBeInTheDocument();
  });

  it('pessoa física usa teclado numérico; pessoa jurídica aceita letras do CNPJ alfanumérico', () => {
    const { rerender } = render(<DocumentField personType="individual" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('CPF')).toHaveAttribute('inputmode', 'numeric');
    rerender(<DocumentField personType="legal" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('CNPJ')).toHaveAttribute('inputmode', 'text');
  });

  it('entrega o texto digitado, sem alterar', () => {
    const onChange = vi.fn();
    render(<DocumentField personType="legal" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12.abc.345/01de-35' } });
    expect(onChange).toHaveBeenCalledWith('12.abc.345/01de-35');
  });

  it('mostra o erro junto do campo e o liga ao controle', () => {
    render(<DocumentField personType="legal" value="123" onChange={() => undefined} error="Informe um CNPJ válido." />);
    const campo = screen.getByLabelText('CNPJ');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe um CNPJ válido.')).toBeInTheDocument();
    expect(campo.getAttribute('aria-describedby')).toContain('error');
  });

  it('na edição aceita um texto de apoio no lugar da ajuda e mostra o valor mascarado como dica', () => {
    render(<DocumentField personType="individual" value="" onChange={() => undefined} placeholder="***.***.***-25" help="Deixe em branco para manter o CPF atual." />);
    expect(screen.getByLabelText('CPF')).toHaveAttribute('placeholder', '***.***.***-25');
    expect(screen.getByText('Deixe em branco para manter o CPF atual.')).toBeInTheDocument();
  });

  it('pode ser desabilitado e limita o tamanho do texto', () => {
    render(<DocumentField personType="legal" value="" onChange={() => undefined} disabled />);
    expect(screen.getByLabelText('CNPJ')).toBeDisabled();
    expect(screen.getByLabelText('CNPJ')).toHaveAttribute('maxlength', '18');
  });
});
