import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ContactInput } from '@/domain/registry/registry-validation';
import { ContactListEditor } from './contact-list-editor';

const CONTACT: ContactInput = { name: 'Maria Souza', role: 'Compras', phone: '11912345678', email: 'maria@exemplo.invalid', isPrimary: true };

function Harness({ initial = [] as ContactInput[], errors = {} as Record<string, string> }) {
  const [contacts, setContacts] = useState<ContactInput[]>(initial);
  return <ContactListEditor contacts={contacts} onChange={setContacts} errors={errors} />;
}

describe('ContactListEditor (RF-003)', () => {
  it('lista vazia mostra orientação e o primeiro contato adicionado já é o principal', () => {
    render(<Harness />);
    expect(screen.getByText(/Nenhum contato informado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar contato' }));
    expect(screen.getByRole('radio', { name: /Contato principal/ })).toBeChecked();
  });

  it('adicionar e remover mantêm a numeração e os rótulos acessíveis', () => {
    render(<Harness initial={[CONTACT]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar contato' }));
    expect(screen.getByRole('heading', { name: 'Contato 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover contato 1' }));
    expect(screen.queryByRole('heading', { name: 'Contato 2' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contato 1' })).toBeInTheDocument();
  });

  it('só um contato fica como principal', () => {
    render(<Harness initial={[CONTACT, { ...CONTACT, name: 'João Lima', isPrimary: false }]} />);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1] as HTMLElement);
    expect(radios[0]).not.toBeChecked();
    expect(radios[1]).toBeChecked();
  });

  it('editar um campo entrega a lista com só aquele contato alterado', () => {
    const onChange = vi.fn();
    render(<ContactListEditor contacts={[CONTACT]} onChange={onChange} errors={{}} />);
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: 'Diretoria' } });
    expect(onChange).toHaveBeenCalledWith([{ ...CONTACT, role: 'Diretoria' }]);
  });

  it('mostra o erro de cada campo junto dele e o erro geral em alerta', () => {
    render(<Harness initial={[CONTACT]} errors={{ 'contacts.0.phone': 'Informe o telefone com DDD, 10 ou 11 dígitos.', contacts: 'Marque só um contato como principal.' }} />);
    expect(screen.getByLabelText('Telefone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe o telefone com DDD, 10 ou 11 dígitos.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Marque só um contato como principal.');
  });

  it('no limite de 10 contatos o botão de adicionar fica desabilitado com explicação', () => {
    render(<Harness initial={Array.from({ length: 10 }, (_, index) => ({ ...CONTACT, name: `Pessoa ${index}`, isPrimary: index === 0 }))} />);
    expect(screen.getByRole('button', { name: 'Adicionar contato' })).toBeDisabled();
    expect(screen.getByText(/Limite de 10 contatos/)).toBeInTheDocument();
  });

  it('desabilitado, nenhum controle aceita edição', () => {
    render(<ContactListEditor contacts={[CONTACT]} onChange={() => undefined} errors={{}} disabled />);
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adicionar contato' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover contato 1' })).toBeDisabled();
  });
});
