import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TestView } from '@/application/cylinders/cylinder-views';
import { HydrostaticTestForm } from './hydrostatic-test-form';

const TODAY = '2026-10-05';
const ORIGINAL: TestView = {
  id: 't1', performedOn: '2026-09-01', result: 'approved', reportNumber: 'L-9', executor: 'Laboratório X', nextDueOn: '2026-12-01', notes: null,
  rectifiesTestId: null, rectificationJustification: null, createdAt: '2026-09-01T10:00:00Z', superseded: false,
};

const setup = (props: Partial<React.ComponentProps<typeof HydrostaticTestForm>> = {}) => {
  const onSubmit = vi.fn(async () => ({ kind: 'success' as const, value: {} }));
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(<HydrostaticTestForm mode="register" online today={TODAY} onSubmit={onSubmit} onDone={onDone} onCancel={onCancel} {...props} />);
  return { onSubmit, onDone, onCancel };
};

const fill = (values: Record<string, string>) => {
  for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('formulário de teste hidrostático (RF-019)', () => {
  it('mostra os campos com rótulos visíveis e um único envio', () => {
    setup();
    for (const label of ['Data de realização', 'Resultado', 'Executor', 'Número do laudo', 'Próxima data', 'Observações']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText('Justificativa da retificação')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Registrar teste' })).toHaveLength(1);
  });

  it('envia um teste aprovado válido e avisa o fim', async () => {
    const { onSubmit, onDone } = setup();
    fill({ 'Data de realização': '2026-10-01', Resultado: 'approved', Executor: ' Laboratório X ', 'Próxima data': '2027-10-01' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ performedOn: '2026-10-01', result: 'approved', reportNumber: null, executor: 'Laboratório X', nextDueOn: '2027-10-01', notes: null }, '');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('data de realização futura: erro junto do campo e foco nele', async () => {
    const { onSubmit } = setup();
    fill({ 'Data de realização': '2026-10-06', Resultado: 'approved', Executor: 'Lab', 'Próxima data': '2027-10-06' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    expect(await screen.findByText('A data de realização não pode ser futura.')).toBeInTheDocument();
    expect(screen.getByLabelText('Data de realização')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Data de realização')).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('próxima data anterior à realização, e aprovado sem próxima data', async () => {
    setup();
    fill({ 'Data de realização': '2026-10-01', Resultado: 'approved', Executor: 'Lab', 'Próxima data': '2026-09-01' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    expect(await screen.findByText('A próxima data deve ser posterior à data de realização.')).toBeInTheDocument();
    fill({ 'Próxima data': '' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    expect(await screen.findByText('Informe a próxima data do teste.')).toBeInTheDocument();
  });

  it('reprovado não exige a próxima data', async () => {
    const { onSubmit } = setup();
    fill({ 'Data de realização': '2026-10-01', Resultado: 'rejected', Executor: 'Lab' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('erros do servidor por campo aparecem junto do campo', async () => {
    const onSubmit = vi.fn(async () => ({ kind: 'invalid' as const, fields: { executor: 'Informe quem executou o teste, com 2 a 120 caracteres.' } }));
    setup({ onSubmit });
    fill({ 'Data de realização': '2026-10-01', Resultado: 'rejected', Executor: 'Lab' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    expect(await screen.findByText('Informe quem executou o teste, com 2 a 120 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Executor')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sem conexão: o envio fica desabilitado com o motivo', () => {
    const { onSubmit } = setup({ online: false });
    expect(screen.getByText(/exige conexão/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar teste' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancelar fecha o formulário sem enviar', () => {
    const { onCancel, onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('falha desconhecida do servidor: alerta e o formulário continua preenchido', async () => {
    const onSubmit = vi.fn(async () => ({ kind: 'unknown' as const }));
    setup({ onSubmit });
    fill({ 'Data de realização': '2026-10-01', Resultado: 'rejected', Executor: 'Lab' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar teste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível confirmar/i);
    expect((screen.getByLabelText('Executor') as HTMLInputElement).value).toBe('Lab');
  });
});

describe('retificação (RF-022)', () => {
  const rectify = () => setup({ mode: 'rectify', initial: ORIGINAL });

  it('traz os dados do registro original e exige justificativa', async () => {
    const { onSubmit } = rectify();
    expect((screen.getByLabelText('Executor') as HTMLInputElement).value).toBe('Laboratório X');
    expect((screen.getByLabelText('Data de realização') as HTMLInputElement).value).toBe('2026-09-01');
    expect(screen.getByLabelText('Justificativa da retificação')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retificação' }));
    expect(await screen.findByText('Explique o motivo com pelo menos 5 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa da retificação')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia a retificação com a justificativa', async () => {
    const { onSubmit, onDone } = rectify();
    fill({ 'Próxima data': '2027-09-01', 'Justificativa da retificação': 'Data digitada errada' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retificação' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ nextDueOn: '2027-09-01', executor: 'Laboratório X', reportNumber: 'L-9' }), 'Data digitada errada');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it('registro já retificado: avisa para recarregar', async () => {
    const onSubmit = vi.fn(async () => ({ kind: 'invalid' as const, fields: { test_id: 'Este registro já foi retificado.' } }));
    setup({ mode: 'rectify', initial: ORIGINAL, onSubmit });
    fill({ 'Justificativa da retificação': 'Data digitada errada' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retificação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/já foi retificado/i);
  });
});
