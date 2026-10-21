import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformOutcome } from '@/application/seals/platform-seal-service';
import { toEnrollmentView, type EnrollmentPage, type EnrollmentView } from '@/application/seals/platform-seal-views';
import { PlatformSealsView, type PlatformSealsPort } from './platform-seals-page';

// Spec 013 (T020): a tela /admin/lacres (contracts/telas.md). O serviço é falso; as regras de verdade estão no banco (013_*).
const base = {
  conflict: false, conflict_at: null, conflict_calls: 0, first_seen_at: '2026-10-19T11:00:00Z', last_seen_at: '2026-10-19T12:00:00Z', calls: 3,
  signal_dbm: -58, wifi_ssid: 'Rede-Ficticia', firmware_version: '3.0.0', organization: null, device_id: null, last_organization: null,
  networks_cleared: true, forget_networks: null, forget_networks_requested_at: null, decided_at: null, decision_note: null, origin: 'enrollment',
  updated_at: '2026-10-19 12:00:00+00',
};
const item = (over: Record<string, unknown>): EnrollmentView => toEnrollmentView({ ...base, ...over })!;
const pending = item({ id: 'e1', device_code: 'DSP-APR13001', status: 'pending' });
const conflicted = item({ id: 'e2', device_code: 'DSP-APR13002', status: 'pending', conflict: true, conflict_at: '2026-10-19T12:00:00Z' });
const fromA = item({ id: 'e3', device_code: 'DSP-APR13003', status: 'pending', last_organization: { id: 'org-a', name: 'Tenant A' }, networks_cleared: false });
const approved = item({ id: 'e4', device_code: 'DSP-APR13004', status: 'approved', organization: { id: 'org-a', name: 'Tenant A' }, device_id: 'd4' });
const refused = item({ id: 'e5', device_code: 'DSP-APR13005', status: 'refused' });

function page(items: EnrollmentView[], over: Partial<EnrollmentPage> = {}): PlatformOutcome<EnrollmentPage> {
  return { kind: 'success', value: { items, total: items.length, counts: { pending: 3, approved: 1, refused: 0, expired: 0, returned: 0 }, conflicts: 1, rateLimitedLast24h: 0, ...over } };
}
function port(over: Partial<PlatformSealsPort> = {}): PlatformSealsPort {
  return {
    listEnrollments: vi.fn(async () => page([pending, conflicted, fromA])),
    listTenants: vi.fn(async () => ({ kind: 'success' as const, value: [{ id: 'org-a', name: 'Tenant A' }, { id: 'org-b', name: 'Tenant B' }] })),
    approve: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    refuse: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    reopen: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    resolveConflict: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    withdraw: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    requestForgetNetworks: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    revealPortalPassword: vi.fn(async () => ({ kind: 'success' as const, value: 'senha' })),
    ...over,
  };
}
const row = (code: string) => screen.getByRole('rowheader', { name: new RegExp(code) }).closest('tr') as HTMLElement;

afterEach(() => { vi.useRealTimers(); });

describe('PlatformSealsView', () => {
  it('abas por situação com a contagem, Aguardando por padrão', async () => {
    render(<PlatformSealsView service={port()} online />);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Aguardando3', 'Em operação1', 'Devolvidos0', 'Recusados0', 'Expirados0']);
    expect(screen.getByRole('tab', { name: /Aguardando/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('as setas do teclado movem entre as abas e carregam a situação escolhida', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    const first = await screen.findByRole('tab', { name: /Aguardando/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Em operação/ })).toHaveFocus();
    expect(screen.getByRole('tab', { name: /Em operação/ })).toHaveAttribute('aria-selected', 'true');
    expect(service.listEnrollments).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'approved' }));
  });

  it('a linha mostra código, firmware, situação com texto, conflito, chamadas, rede e sinal em texto', async () => {
    render(<PlatformSealsView service={port()} online />);
    const line = within(await screen.findByRole('row', { name: /DSP-APR13002/ }));
    expect(line.getByText('Aguardando vinculação a uma empresa')).toBeInTheDocument();
    expect(line.getByText('Outro aparelho com este código')).toBeInTheDocument();
    expect(line.getByText('Sinal forte (-58 dBm)')).toBeInTheDocument();
    expect(line.getByText('Rede-Ficticia')).toBeInTheDocument();
    expect(line.getByText('Firmware 3.0.0')).toBeInTheDocument();
  });

  it('aprovar: escolhe a empresa, confere o código em destaque, justifica e envia', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13001/ });
    fireEvent.click(within(row('DSP-APR13001')).getByRole('button', { name: /Aprovar/ }));
    const dialog = await screen.findByRole('dialog', { name: /Aprovar o lacre/ });
    await within(dialog).findByRole('option', { name: 'Tenant B' });
    expect(within(dialog).getByText('Confira se é o código do lacre em mãos')).toBeInTheDocument();
    expect(within(dialog).getByText('DSP-APR13001')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Empresa de destino'), { target: { value: 'org-b' } });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Lacre conferido na bancada' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprovar e destinar' }));
    expect(service.approve).toHaveBeenCalledWith(pending, 'org-b', 'Lacre conferido na bancada');
    expect(await screen.findByText('Lacre DSP-APR13001 aprovado para Tenant B.')).toBeInTheDocument();
  });

  it('aprovar sem justificativa válida mostra o erro no campo e não envia', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13001/ });
    fireEvent.click(within(row('DSP-APR13001')).getByRole('button', { name: /Aprovar/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Tenant A' });
    fireEvent.change(within(dialog).getByLabelText('Empresa de destino'), { target: { value: 'org-a' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprovar e destinar' }));
    expect(within(dialog).getByText('Escreva uma justificativa de 5 a 500 caracteres.')).toBeInTheDocument();
    expect(service.approve).not.toHaveBeenCalled();
  });

  it('com conflito, Aprovar fica desabilitado e o motivo aparece em texto', async () => {
    render(<PlatformSealsView service={port()} online />);
    await screen.findByRole('row', { name: /DSP-APR13002/ });
    const line = within(row('DSP-APR13002'));
    expect(line.getByRole('button', { name: /Aprovar/ })).toBeDisabled();
    expect(line.getByText(/Resolva o conflito antes de aprovar/)).toBeInTheDocument();
  });

  it('para outra empresa que não o último, o diálogo avisa das redes e não deixa aprovar', async () => {
    render(<PlatformSealsView service={port()} online />);
    await screen.findByRole('row', { name: /DSP-APR13003/ });
    fireEvent.click(within(row('DSP-APR13003')).getByRole('button', { name: /Aprovar/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('option', { name: 'Tenant B' });
    fireEvent.change(within(dialog).getByLabelText('Empresa de destino'), { target: { value: 'org-b' } });
    expect(within(dialog).getByText(/ainda pode ter redes da empresa Tenant A/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Aprovar e destinar' })).toBeDisabled();
  });

  it('esquecer todas as redes num pedido que ainda tem redes da empresa anterior', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13003/ });
    fireEvent.click(within(row('DSP-APR13003')).getByRole('button', { name: /Esquecer todas as redes/ }));
    const dialog = await screen.findByRole('dialog', { name: /Esquecer todas as redes/ });
    expect(within(dialog).getByText(/volta ao portal/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Vai para o Tenant B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir o esquecimento' }));
    expect(service.requestForgetNetworks).toHaveBeenCalledWith(fromA, 'Vai para o Tenant B');
  });

  it('recusar pede justificativa', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13001/ });
    fireEvent.click(within(row('DSP-APR13001')).getByRole('button', { name: /Recusar/ }));
    const dialog = await screen.findByRole('dialog', { name: /Recusar o pedido/ });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Lacre desconhecido' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar o pedido' }));
    expect(service.refuse).toHaveBeenCalledWith(pending, 'Lacre desconhecido');
  });

  it('lacres recusados retornam para aguardando antes de uma nova aprovação', async () => {
    const service = port({ listEnrollments: vi.fn(async () => page([refused])) });
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13005/ });
    expect(within(row('DSP-APR13005')).queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
    fireEvent.click(within(row('DSP-APR13005')).getByRole('button', { name: /Retornar para aguardando/ }));
    const dialog = await screen.findByRole('dialog', { name: /Retornar para aguardando/ });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Revisão do cadastro concluída' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retornar para aguardando' }));
    expect(service.reopen).toHaveBeenCalledWith(refused, 'Revisão do cadastro concluída');
  });

  it('resolver conflito: as duas saídas, com justificativa', async () => {
    const service = port();
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13002/ });
    fireEvent.click(within(row('DSP-APR13002')).getByRole('button', { name: /Resolver conflito/ }));
    const dialog = await screen.findByRole('dialog', { name: /Resolver o conflito/ });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Aceitar a chave do aparelho novo/ }));
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Lacre reinstalado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolver o conflito' }));
    expect(service.resolveConflict).toHaveBeenCalledWith(conflicted, false, 'Lacre reinstalado');
  });

  it('retirar de operação: escolha das redes, com "Manter a rede principal" por padrão', async () => {
    const service = port({ listEnrollments: vi.fn(async () => page([approved])) });
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13004/ });
    expect(within(row('DSP-APR13004')).getByText('Tenant A')).toBeInTheDocument();
    fireEvent.click(within(row('DSP-APR13004')).getByRole('button', { name: /Retirar de operação/ }));
    const dialog = await screen.findByRole('dialog', { name: /Retirar de operação/ });
    expect(within(dialog).getByRole('radio', { name: /Manter a rede principal/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Esquecer todas as redes/ }));
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Recolhido para manutenção' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirar de operação' }));
    expect(service.withdraw).toHaveBeenCalledWith(approved, 'all', 'Recolhido para manutenção');
  });

  it('recusa do servidor aparece no diálogo, em texto', async () => {
    const service = port({ refuse: vi.fn(async () => ({ kind: 'stale' as const })) });
    render(<PlatformSealsView service={service} online />);
    await screen.findByRole('row', { name: /DSP-APR13001/ });
    fireEvent.click(within(row('DSP-APR13001')).getByRole('button', { name: /Recusar/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Lacre desconhecido' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar o pedido' }));
    expect(await within(dialog).findByText(/O pedido mudou/)).toBeInTheDocument();
  });

  it('vazio por aba', async () => {
    render(<PlatformSealsView service={port({ listEnrollments: vi.fn(async () => page([])) })} online />);
    expect(await screen.findByText('Nenhum lacre aguardando vinculação a uma empresa')).toBeInTheDocument();
  });

  it('erro com a ação de tentar de novo', async () => {
    const service = port({ listEnrollments: vi.fn(async () => ({ kind: 'unavailable' as const })) });
    render(<PlatformSealsView service={service} online />);
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('sem conexão explica e não chama o servidor', () => {
    const service = port();
    render(<PlatformSealsView service={service} online={false} />);
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
    expect(service.listEnrollments).not.toHaveBeenCalled();
  });

  it('mostra quantos pedidos foram descartados pelo limite', async () => {
    render(<PlatformSealsView service={port({ listEnrollments: vi.fn(async () => page([pending], { rateLimitedLast24h: 4 })) })} online />);
    expect(await screen.findByText('4 pedidos novos descartados pelo limite nas últimas 24 horas.')).toBeInTheDocument();
  });

  it('a cada 30 s atualiza e anuncia os pedidos novos num status, sem mover o foco', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fresh = item({ id: 'e9', device_code: 'DSP-NOVO0001', status: 'pending' });
    const listEnrollments = vi.fn().mockResolvedValueOnce(page([pending])).mockResolvedValue(page([pending, fresh]));
    render(<PlatformSealsView service={port({ listEnrollments })} online />);
    const tab = await screen.findByRole('tab', { name: /Aguardando/ });
    tab.focus();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText('1 pedido novo de lacre aguardando vinculação a uma empresa: DSP-NOVO0001.')).toHaveAttribute('role', 'status');
    expect(tab).toHaveFocus();
  });
});
