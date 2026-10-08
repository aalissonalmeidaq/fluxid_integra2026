import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CascadeCounts, RegistryOutcome } from '@/application/registry/registry-service';
import { LifecycleActions } from './lifecycle-actions';

const LABELS = {
  inactivate: 'Inativar cliente', reactivate: 'Reativar cliente', inactivated: 'Cliente inativado.', reactivated: 'Cliente reativado.',
  inactivateTitle: 'Inativar cliente', reactivateTitle: 'Reativar cliente', inactivateDescription: '', reactivateDescription: 'Só o cliente volta a ficar ativo.',
};

function setup(over: Partial<React.ComponentProps<typeof LifecycleActions>> = {}, counts: CascadeCounts = { sites: 2, geofences: 3 }) {
  const preview = vi.fn(async (): Promise<RegistryOutcome<CascadeCounts>> => ({ kind: 'success', value: counts }));
  const inactivate = vi.fn(async (): Promise<RegistryOutcome<unknown>> => ({ kind: 'success', value: { version: 2 } }));
  const reactivate = vi.fn(async (): Promise<RegistryOutcome<unknown>> => ({ kind: 'success', value: { version: 3 } }));
  const onChanged = vi.fn();
  const view = render(<LifecycleActions name="Hospital Teste" active canDeactivate online labels={LABELS} cascade={{ scope: 'customer', preview }} inactivate={inactivate} reactivate={reactivate} onChanged={onChanged} {...over} />);
  return { preview, inactivate, reactivate, onChanged, unmount: view.unmount };
}

describe('diálogo de inativação com cascata (RF-034, história 6)', () => {
  it('mostra as quantidades da prévia antes de confirmar', async () => {
    const { preview } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inativar cliente' });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveTextContent('2 unidades ativas e 3 geocercas ativas');
    expect(dialog).toHaveTextContent('Nada é apagado');
  });

  it('exige justificativa e envia as quantidades que a pessoa viu', async () => {
    const { inactivate, onChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inativar cliente' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    expect(await within(dialog).findByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(inactivate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Contrato encerrado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    await waitFor(() => expect(inactivate).toHaveBeenCalledWith('Contrato encerrado', { sites: 2, geofences: 3 }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Cliente inativado.'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('devolve o foco ao acionador ao cancelar, por Escape ou pelo botão', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Inativar cliente' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Inativar cliente' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('CASCADE_CHANGED reabre o diálogo com os números novos e avisa', async () => {
    const inactivate = vi.fn()
      .mockResolvedValueOnce({ kind: 'cascade_changed', cascadeCounts: { sites: 3, geofences: 5 } })
      .mockResolvedValueOnce({ kind: 'success', value: { version: 2 } });
    const { onChanged } = setup({ inactivate });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inativar cliente' });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Contrato encerrado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    expect(await screen.findByText(/As quantidades mudaram desde a prévia/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('3 unidades ativas e 5 geocercas ativas');
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar inativação' }));
    await waitFor(() => expect(inactivate).toHaveBeenLastCalledWith('Contrato encerrado', { sites: 3, geofences: 5 }));
  });

  it('unidade: só as geocercas entram no texto; sem nada para inativar junto, diz isso', async () => {
    const { unmount } = setup({ cascade: { scope: 'site', preview: async () => ({ kind: 'success', value: { sites: 0, geofences: 1 } }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inativar unidade' });
    expect(dialog).toHaveTextContent('1 geocerca ativa');
    expect(dialog).not.toHaveTextContent('unidade ativa');
    unmount();
    setup({}, { sites: 0, geofences: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Nada mais será inativado junto');
  });

  it('falha da prévia mostra a mensagem em vez de abrir o diálogo', async () => {
    setup({ cascade: { scope: 'customer', preview: async () => ({ kind: 'offline' }) } });
    fireEvent.click(screen.getByRole('button', { name: 'Inativar cliente' }));
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cadastro inativo oferece reativar com justificativa; anonimizado e sem permissão não oferecem nada', async () => {
    const { reactivate, onChanged } = setup({ active: false, cascade: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Reativar cliente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reativar cliente' });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Contrato retomado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reativação' }));
    await waitFor(() => expect(reactivate).toHaveBeenCalledWith('Contrato retomado'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Cliente reativado.'));
  });

  it('sem permissão ou com o cadastro anonimizado não há botões; offline desabilita', () => {
    const first = render(<LifecycleActions name="X" active canDeactivate={false} online labels={LABELS} inactivate={vi.fn()} reactivate={vi.fn()} onChanged={vi.fn()} />);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    const second = render(<LifecycleActions name="X" active={false} blocked canDeactivate online labels={LABELS} inactivate={vi.fn()} reactivate={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Reativar cliente' })).not.toBeInTheDocument();
    second.unmount();
    render(<LifecycleActions name="X" active canDeactivate online={false} labels={LABELS} inactivate={vi.fn()} reactivate={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Inativar cliente' })).toBeDisabled();
  });
});
