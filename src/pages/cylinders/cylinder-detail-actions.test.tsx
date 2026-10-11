import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { CylinderDetailView, type DetailAbilities } from './cylinder-detail-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';
const TYPE: CylinderTypeView = { id: 't1', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', classification: 'medicinal', active: true };
const ALL: DetailAbilities = { write: true, deactivate: true, identifier: true, test: true, history: true };

const detail = (cylinder: Partial<CylinderDetail['cylinder']> = {}): CylinderDetail => ({
  cylinder: {
    id: CYL, serialNumber: 'AB-1', type: TYPE, manufacturer: null, manufactureYear: null, workingPressureBar: null, notes: null, status: 'active',
    inactivationReason: null, stockStatus: 'in_stock', custodyStatus: 'in_organization', custodySite: null, hydroLastResult: null, hydroNextDueOn: null, version: 3, createdAt: '2026-10-05T13:30:00Z', ...cylinder,
  },
  identifiers: [
    { id: 'i1', kind: 'qr_code', value: 'QR-1', status: 'active', createdAt: '2026-10-05T13:30:00Z', deactivatedAt: null, deactivationJustification: null, transferred: false },
    { id: 'i2', kind: 'nfc_tag', value: 'NFC-OLD', status: 'deactivated', createdAt: '2026-10-01T13:30:00Z', deactivatedAt: '2026-10-04T13:30:00Z', deactivationJustification: 'Etiqueta danificada', transferred: false },
  ],
  tests: [], hydroStatus: 'sem_teste',
});
const inactiveDetail = () => ({ kind: 'success' as const, value: detail({ status: 'inactive', inactivationReason: 'lost', stockStatus: 'out_of_stock' }) });

type Svc = CylinderService & Record<'get' | 'inactivate' | 'reactivate' | 'addIdentifier' | 'deactivateIdentifier' | 'transferIdentifier', ReturnType<typeof vi.fn>>;

function service(over: Record<string, unknown> = {}): Svc {
  return {
    get: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    history: vi.fn(async () => ({ kind: 'success' as const, value: { events: [], next: null } })),
    inactivate: vi.fn(async () => ({ kind: 'success', value: { version: 4 } })),
    reactivate: vi.fn(async () => ({ kind: 'success', value: { version: 5 } })),
    addIdentifier: vi.fn(async () => ({ kind: 'success', value: { identifierId: 'i9' } })),
    deactivateIdentifier: vi.fn(async () => ({ kind: 'success', value: {} })),
    transferIdentifier: vi.fn(async () => ({ kind: 'success', value: { identifierId: 'i10' } })),
    ...over,
  } as unknown as Svc;
}

const renderDetail = (svc: Svc, can: DetailAbilities = ALL) =>
  render(<CylinderDetailView organizationId={ORG} service={svc} online cylinderId={CYL} can={can} />);

describe('inativar e reativar (história 6)', () => {
  it('inativa com motivo e justificativa, preserva o histórico e anuncia o resultado', async () => {
    const svc = service();
    renderDetail(svc);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar cilindro' }));
    const dialog = screen.getByRole('dialog', { name: 'Inativar cilindro' });
    fireEvent.change(within(dialog).getByLabelText('Motivo da inativação'), { target: { value: 'condemned' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    expect(within(dialog).getByText('Explique o motivo com pelo menos 5 caracteres.')).toBeInTheDocument();
    expect(svc.inactivate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Reprovado no teste' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    await waitFor(() => expect(svc.inactivate).toHaveBeenCalledWith(ORG, { cylinderId: CYL, reason: 'condemned', justification: 'Reprovado no teste' }));
    expect(await screen.findByText(/cilindro inativado.*histórico foi preservado/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('inativação simultânea: o diálogo avisa que o cilindro já estava inativo', async () => {
    renderDetail(service({ inactivate: vi.fn(async () => ({ kind: 'already_inactive' })) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar cilindro' }));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Perdido em campo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar inativação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/já estava inativo/i);
  });

  it('reativa cilindro inativo com justificativa; "Inativar" não aparece para ele', async () => {
    const svc = service({ get: vi.fn(async () => inactiveDetail()) });
    renderDetail(svc);
    expect(await screen.findByRole('button', { name: 'Reativar cilindro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar cilindro' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar cilindro' }));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Inativação foi engano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reativação' }));
    await waitFor(() => expect(svc.reactivate).toHaveBeenCalledWith(ORG, { cylinderId: CYL, justification: 'Inativação foi engano' }));
    expect(await screen.findByText(/reativado.*nova entrada/i)).toBeInTheDocument();
  });

  it('sem cylinder.deactivate nenhuma das duas ações aparece', async () => {
    renderDetail(service(), { ...ALL, deactivate: false });
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: /inativar|reativar/i })).not.toBeInTheDocument();
  });

  it('o diálogo devolve o foco ao botão que o abriu ao cancelar', async () => {
    renderDetail(service());
    const trigger = await screen.findByRole('button', { name: 'Inativar cilindro' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});

describe('identificadores (história 5)', () => {
  it('acrescenta identificador: erros junto do campo e, no sucesso, recarrega', async () => {
    const svc = service();
    renderDetail(svc);
    fireEvent.click(await screen.findByRole('button', { name: 'Acrescentar identificador' }));
    fireEvent.submit(screen.getByLabelText('Valor do identificador').closest('form') as HTMLFormElement);
    expect(await screen.findByText('Escolha o tipo do identificador.')).toBeInTheDocument();
    expect(screen.getByText('Informe o valor do identificador.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo do identificador'), { target: { value: 'hull_number' } });
    fireEvent.change(screen.getByLabelText('Valor do identificador'), { target: { value: ' HULL-9\n' } });
    fireEvent.submit(screen.getByLabelText('Valor do identificador').closest('form') as HTMLFormElement);
    await waitFor(() => expect(svc.addIdentifier).toHaveBeenCalledWith(ORG, { cylinderId: CYL, kind: 'hull_number', value: 'HULL-9' }));
    expect(await screen.findByText('Identificador acrescentado.')).toBeInTheDocument();
  });

  it('identificador usado por outro cilindro e identificador desativado têm mensagens próprias', async () => {
    const addIdentifier = vi.fn()
      .mockResolvedValueOnce({ kind: 'identifier_conflict', ownerCylinderId: 'x' })
      .mockResolvedValueOnce({ kind: 'identifier_unavailable' });
    renderDetail(service({ addIdentifier }));
    fireEvent.click(await screen.findByRole('button', { name: 'Acrescentar identificador' }));
    fireEvent.change(screen.getByLabelText('Tipo do identificador'), { target: { value: 'qr_code' } });
    fireEvent.change(screen.getByLabelText('Valor do identificador'), { target: { value: 'QR-2' } });
    fireEvent.submit(screen.getByLabelText('Valor do identificador').closest('form') as HTMLFormElement);
    expect(await screen.findByText('Este identificador já está vinculado a outro cilindro.')).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('Valor do identificador').closest('form') as HTMLFormElement);
    expect(await screen.findByText(/foi usado e desativado/i)).toBeInTheDocument();
  });

  it('desativa só identificador ativo, com justificativa', async () => {
    const svc = service();
    renderDetail(svc);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar identificador QR-1' }));
    expect(screen.queryByRole('button', { name: 'Desativar identificador NFC-OLD' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Etiqueta danificada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    await waitFor(() => expect(svc.deactivateIdentifier).toHaveBeenCalledWith(ORG, { identifierId: 'i1', justification: 'Etiqueta danificada' }));
    expect(await screen.findByText(/identificador desativado.*continua no histórico/i)).toBeInTheDocument();
  });

  it('reutiliza identificador desativado por transferência: exige valor, confirmação e justificativa', async () => {
    const svc = service();
    renderDetail(svc);
    fireEvent.click(await screen.findByRole('button', { name: 'Reutilizar identificador desativado' }));
    const dialog = screen.getByRole('dialog', { name: 'Reutilizar identificador desativado' });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Etiqueta reaproveitada' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar transferência' }));
    expect(within(dialog).getByText('Informe o valor do identificador desativado.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Valor do identificador desativado'), { target: { value: 'NFC-OLD' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar transferência' }));
    expect(within(dialog).getByText('Confirme a transferência para continuar.')).toBeInTheDocument();
    expect(svc.transferIdentifier).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar transferência' }));
    await waitFor(() => expect(svc.transferIdentifier).toHaveBeenCalledWith(ORG, { value: 'NFC-OLD', targetCylinderId: CYL, justification: 'Etiqueta reaproveitada' }));
    expect(await screen.findByText('Identificador transferido para este cilindro.')).toBeInTheDocument();
  });

  it('erros da transferência aparecem no diálogo', async () => {
    renderDetail(service({ transferIdentifier: vi.fn(async () => ({ kind: 'identifier_conflict', ownerCylinderId: 'x' })) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reutilizar identificador desativado' }));
    fireEvent.change(screen.getByLabelText('Valor do identificador desativado'), { target: { value: 'QR-1' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Tentando reaproveitar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferência' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ativo em outro cilindro/i);
  });

  it('sem cylinder.identifier nenhuma ação de identificador aparece', async () => {
    renderDetail(service(), { ...ALL, identifier: false });
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: /acrescentar identificador|reutilizar|desativar identificador/i })).not.toBeInTheDocument();
  });

  it('cilindro inativo não recebe identificador novo, mas seus identificadores ativos podem ser desativados', async () => {
    renderDetail(service({ get: vi.fn(async () => inactiveDetail()) }));
    await screen.findByRole('region', { name: 'Dados do cilindro' });
    expect(screen.queryByRole('button', { name: 'Acrescentar identificador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reutilizar identificador desativado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar identificador QR-1' })).toBeInTheDocument();
  });
});
