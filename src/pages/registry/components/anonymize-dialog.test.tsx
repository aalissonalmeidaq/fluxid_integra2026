import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnonymizedResult, RegistryOutcome } from '@/application/registry/registry-service';
import { AnonymizeAction } from './anonymize-action';
import { AnonymizeDialog } from './anonymize-dialog';

const WORD = 'ANONIMIZAR';

function setupDialog(subject: 'driver' | 'customer' | 'contact' = 'driver', over: Partial<React.ComponentProps<typeof AnonymizeDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<AnonymizeDialog subject={subject} name="Carlos" returnFocusTo={null} onCancel={onCancel} onConfirm={onConfirm} {...over} />);
  return { onConfirm, onCancel };
}
const fill = (dialog: HTMLElement, values: { reason?: string; justification?: string; word?: string }): void => {
  if (values.reason !== undefined) fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: values.reason } });
  if (values.justification !== undefined) fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: values.justification } });
  if (values.word !== undefined) fireEvent.change(within(dialog).getByLabelText(`Digite ${WORD} para confirmar`), { target: { value: values.word } });
};

describe('diálogo de anonimização (RF-062, história 8)', () => {
  it('lista o que será removido e o que permanece e avisa que é irreversível', () => {
    setupDialog('driver');
    const dialog = screen.getByRole('dialog', { name: 'Anonimizar dados pessoais do motorista' });
    expect(within(dialog).getByText('Esta ação é irreversível')).toBeInTheDocument();
    const removed = within(dialog).getByRole('region', { name: 'O que será removido' });
    for (const item of ['CPF', 'Número da CNH', 'Telefone']) expect(within(removed).getByText(new RegExp(item))).toBeInTheDocument();
    const kept = within(dialog).getByRole('region', { name: 'O que permanece' });
    expect(within(kept).getByText(/Categoria e validade da CNH/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Cópias de segurança e registros da plataforma/)).toBeInTheDocument();
  });

  it('a lista muda por tipo: cliente fala de contatos e unidades; contato, só dos próprios dados', () => {
    const { unmount } = render(<AnonymizeDialog subject="customer" name="Ana" returnFocusTo={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const removed = screen.getByRole('region', { name: 'O que será removido' });
    expect(removed).toHaveTextContent('De todos os contatos');
    expect(removed).toHaveTextContent('De todas as unidades');
    expect(screen.getByRole('region', { name: 'O que permanece' })).toHaveTextContent('geocercas');
    unmount();
    render(<AnonymizeDialog subject="contact" name="Rita" returnFocusTo={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Anonimizar dados pessoais do contato' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'O que permanece' })).toHaveTextContent('O cadastro do cliente');
  });

  it('exige motivo, justificativa e a palavra digitada, com o erro junto de cada campo, e não envia', async () => {
    const { onConfirm } = setupDialog();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    expect(await within(dialog).findByText('Escolha o motivo.')).toBeInTheDocument();
    expect(within(dialog).getByText('Explique em 5 a 500 caracteres.')).toBeInTheDocument();
    expect(within(dialog).getByText(`Digite ${WORD} para confirmar.`)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fill(dialog, { reason: 'other', justification: 'Pedido do titular', word: 'anonimizando' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    expect(await within(dialog).findByText(`Digite ${WORD} para confirmar.`)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('com tudo preenchido, entrega o motivo e a justificativa já validados', async () => {
    const { onConfirm } = setupDialog();
    const dialog = screen.getByRole('dialog');
    fill(dialog, { reason: 'data_subject_request', justification: '  Pedido do titular dos dados ', word: WORD });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: 'data_subject_request', justification: 'Pedido do titular dos dados' }));
  });

  it('Escape e Cancelar fecham sem anonimizar', () => {
    const { onCancel, onConfirm } = setupDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('o erro do servidor aparece dentro do diálogo e o botão fica ocupado durante o envio', () => {
    setupDialog('driver', { error: 'Esta ação exige o segundo fator.', busy: true });
    expect(screen.getByText('Esta ação exige o segundo fator.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anonimizando…' })).toBeDisabled();
  });
});

describe('botão "Anonimizar dados pessoais"', () => {
  const ok: RegistryOutcome<AnonymizedResult> = { kind: 'success', value: { anonymizedAt: '2026-10-07T15:00:00Z' } };
  const setup = (outcome: RegistryOutcome<AnonymizedResult>, over: Partial<React.ComponentProps<typeof AnonymizeAction>> = {}) => {
    const anonymize = vi.fn(async () => outcome);
    const onDone = vi.fn();
    render(<AnonymizeAction subject="driver" name="Carlos" online anonymize={anonymize} onDone={onDone} {...over} />);
    return { anonymize, onDone };
  };
  const run = async (): Promise<void> => {
    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados pessoais' }));
    const dialog = await screen.findByRole('dialog');
    fill(dialog, { reason: 'other', justification: 'Pedido do titular', word: WORD });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonimizar dados pessoais' }));
  };

  it('fica desabilitado com o motivo à vista enquanto o cadastro está ativo', () => {
    const { anonymize } = setup(ok, { blockedReason: 'Inative o motorista antes de anonimizar.' });
    const button = screen.getByRole('button', { name: 'Anonimizar dados pessoais' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Inative o motorista antes de anonimizar.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Inative o motorista antes de anonimizar.');
    expect(anonymize).not.toHaveBeenCalled();
  });

  it('sem conexão fica desabilitado, com o motivo', () => {
    setup(ok, { online: false });
    expect(screen.getByRole('button', { name: 'Anonimizar dados pessoais' })).toBeDisabled();
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });

  it('confirma, chama o servidor com o pedido e fecha o diálogo', async () => {
    const { anonymize, onDone } = setup(ok);
    await run();
    await waitFor(() => expect(anonymize).toHaveBeenCalledWith({ reason: 'other', justification: 'Pedido do titular' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ anonymizedAt: '2026-10-07T15:00:00Z' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('MFA_REQUIRED mostra a orientação de confirmar o segundo fator e mantém o diálogo aberto', async () => {
    const { onDone } = setup({ kind: 'mfa_required' });
    await run();
    expect(await screen.findByText(/exige o segundo fator de autenticação/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'active_record' } as const, /Inative o cadastro antes/],
    [{ kind: 'already_anonymized' } as const, /já foram anonimizados/],
    [{ kind: 'version_conflict' } as const, /alterado por outra pessoa/],
    [{ kind: 'unknown' } as const, /Não foi possível confirmar/],
  ])('falha %j vira mensagem dentro do diálogo', async (outcome, texto) => {
    setup(outcome);
    await run();
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('devolve o foco ao botão ao cancelar', async () => {
    setup(ok);
    const trigger = screen.getByRole('button', { name: 'Anonimizar dados pessoais' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
