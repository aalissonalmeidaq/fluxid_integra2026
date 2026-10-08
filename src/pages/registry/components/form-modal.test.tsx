import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormActions, FormCancel, FormCard, FormHeader, RegistryFormModal } from './form-modal';

const header = <FormHeader titleId="t" eyebrow="Clientes" title="Cadastrar cliente" description="Informe o cliente." />;

describe('formulário em modal', () => {
  it('como página, mostra o cabeçalho completo, o cartão e o link de cancelar', () => {
    render(<><FormCard>{header}</FormCard><FormCancel href="/clientes" /></>);
    expect(screen.getByRole('heading', { level: 2, name: 'Cadastrar cliente' })).toBeInTheDocument();
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/clientes');
  });

  it('no modal, o diálogo leva o título, o cabeçalho fica só com a descrição e cancelar fecha sem recarregar', () => {
    const onClose = vi.fn();
    render(
      <RegistryFormModal title="Cadastrar cliente" onClose={onClose} onNavigate={vi.fn()}>
        <FormCard>
          {header}
          <FormActions><FormCancel href="/clientes" /></FormActions>
        </FormCard>
      </RegistryFormModal>,
    );
    expect(screen.getByRole('dialog', { name: 'Cadastrar cliente' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Cadastrar cliente' })).toHaveLength(1);
    expect(screen.getByText('Informe o cliente.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cancelar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape fecha o modal', () => {
    const onClose = vi.fn();
    render(<RegistryFormModal title="Editar veículo" onClose={onClose} onNavigate={vi.fn()}><FormCancel href="/x" /></RegistryFormModal>);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('as ações ficam coladas ao pé do modal para o botão de salvar nunca sumir', () => {
    render(<RegistryFormModal title="Editar" onClose={vi.fn()} onNavigate={vi.fn()}><FormActions><button type="submit">Salvar</button></FormActions></RegistryFormModal>);
    expect(screen.getByRole('button', { name: 'Salvar' }).parentElement).toHaveClass('sticky', '-bottom-6');
  });
});
