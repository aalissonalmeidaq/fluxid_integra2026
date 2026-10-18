import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import type { SealDetail } from '@/application/seals/seal-views';
import { WifiNetworksPanel } from './wifi-networks-panel';

// Spec 012 (T100; RF-034a a RF-034f, RF-040; História 7): rede em uso e redes guardadas (só nomes), adicionar com campo de senha que
// nunca volta à tela, rede aberta, aviso de risco com viagem ou vigilância, limite de 5, remover e voltar à padrão com justificativa.
const NOW = new Date('2026-10-17T14:10:00Z');
const SEAL = {
  deviceId: 'd1', deviceCode: 'DSP-WIFIA001', label: 'Lacre A', status: 'active', health: 'ok', lockState: 'locked', sealState: 'closed',
  batteryPct: 80, signalDbm: -60, lastSeenAt: '2026-10-17T14:09:00Z', reportIntervalS: 60, position: null, pendingCommand: null, watch: null, violation: null,
  sealCode: 'LCR-1', activatedAt: null, firmwareVersion: null, version: 1, bindings: [], alerts: [],
  wifiInUse: { ssid: 'Rede-Deposito', kind: 'list', rssi: -60, at: '2026-10-17T14:09:00Z' }, wifiSaved: ['Rede-Deposito'],
  wifiAvailable: [{ ssid: 'Rede-Deposito', rssi: -60 }, { ssid: 'Rede-Cliente', rssi: -48 }], wifiAvailableAt: '2026-10-17T14:09:00Z',
  commands: [],
} as unknown as SealDetail;

function service(code: Record<string, { status: number; body: Record<string, unknown> }> = {}) {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => code[String(body.operation)] ?? { status: 200, body: { code: 'REQUESTED', command_id: 'k1' } });
  return { service: new SealService({ call } as SealTransport), call };
}
const renderPanel = (s: SealService, seal: SealDetail = SEAL, extra: { canAdmin?: boolean; online?: boolean; onChanged?: () => void } = {}) =>
  render(<WifiNetworksPanel service={s} organizationId="org-a" seal={seal} online={extra.online ?? true} canAdmin={extra.canAdmin ?? true} now={() => NOW} onChanged={extra.onChanged ?? (() => undefined)} />);

describe('WifiNetworksPanel', () => {
  it('mostra a rede em uso (da lista, sinal, horário) e só os nomes das redes guardadas', () => {
    renderPanel(service().service);
    expect(screen.getByText(/Em uso: Rede-Deposito \(rede da lista, sinal -60 dBm\)/)).toBeInTheDocument();
    expect(screen.getByText(/há 1 minuto/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Redes guardadas' })).getByText('Rede-Deposito')).toBeInTheDocument();
  });

  it('adicionar: a senha vai ao servidor, o campo é limpo e a senha não aparece mais na tela', async () => {
    const changed = vi.fn();
    const { service: s, call } = service();
    renderPanel(s, SEAL, { onChanged: changed });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));
    fireEvent.change(await screen.findByLabelText('Nome da rede'), { target: { value: 'Rede-Cliente' } });
    const password = screen.getByLabelText('Senha da rede');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(password, { target: { value: 'senha-ficticia-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'wifi_add', ssid: 'Rede-Cliente', password: 'senha-ficticia-123', open: false, confirm_risk: false })));
    expect(await screen.findByText(/A rede só entra na lista quando o lacre confirmar/)).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain('senha-ficticia-123');
  });

  it('mostra as redes conhecidas pelo lacre e preenche o nome ao selecionar', async () => {
    renderPanel(service().service);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));

    expect(screen.getByRole('group', { name: 'Redes disponíveis para conexão' })).toBeInTheDocument();
    expect(screen.getByText('Em uso · Sinal médio')).toBeInTheDocument();
    expect(screen.getByText('Rede-Cliente')).toBeInTheDocument();
    expect(screen.getByText('Sinal forte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Rede-Deposito/ }));
    expect(screen.getByLabelText('Nome da rede')).toHaveValue('Rede-Deposito');
  });

  it('senha curta: erro no campo e nada é enviado', async () => {
    const { service: s, call } = service();
    renderPanel(s);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));
    fireEvent.change(await screen.findByLabelText('Nome da rede'), { target: { value: 'Rede-Cliente' } });
    fireEvent.change(screen.getByLabelText('Senha da rede'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    expect(await screen.findByText('A senha da rede tem de 8 a 63 caracteres.')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('rede aberta: sem campo de senha e sem senha enviada', async () => {
    const { service: s, call } = service();
    renderPanel(s);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));
    fireEvent.change(await screen.findByLabelText('Nome da rede'), { target: { value: 'Visitantes' } });
    fireEvent.click(screen.getByLabelText('Rede aberta (sem senha)'));
    expect(screen.queryByLabelText('Senha da rede')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'wifi_add', ssid: 'Visitantes', password: null, open: true })));
  });

  it('sob vigilância: aviso de risco e confirmação obrigatória', async () => {
    const { service: s, call } = service();
    renderPanel(s, { ...SEAL, watch: { siteId: 's1' } } as unknown as SealDetail);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));
    fireEvent.change(await screen.findByLabelText('Nome da rede'), { target: { value: 'Rede-Cliente' } });
    fireEvent.change(screen.getByLabelText('Senha da rede'), { target: { value: 'senha-ficticia-123' } });
    expect(screen.getByText(/está em viagem ou sob vigilância/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    expect(await screen.findByText('Confirme que entende o risco para continuar.')).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Entendo que o lacre pode ficar sem comunicar/));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ confirm_risk: true })));
  });

  it('viagem em andamento descoberta pelo servidor: pede a confirmação do risco', async () => {
    const { service: s } = service({ wifi_add: { status: 400, body: { code: 'WIFI_RISK_NOT_CONFIRMED' } } });
    renderPanel(s);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar rede' }));
    fireEvent.change(await screen.findByLabelText('Nome da rede'), { target: { value: 'Rede-Cliente' } });
    fireEvent.change(screen.getByLabelText('Senha da rede'), { target: { value: 'senha-ficticia-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao lacre' }));
    expect(await screen.findByLabelText(/Entendo que o lacre pode ficar sem comunicar/)).toBeInTheDocument();
  });

  it('lista cheia: explica o limite de 5 redes e não abre o formulário', () => {
    renderPanel(service().service, { ...SEAL, wifiSaved: ['R1', 'R2', 'R3', 'R4', 'R5'] } as SealDetail);
    expect(screen.getByRole('button', { name: 'Adicionar rede' })).toBeDisabled();
    expect(screen.getByText(/O lacre guarda até 5 redes/)).toBeInTheDocument();
  });

  it('remover uma rede da lista', async () => {
    const { service: s, call } = service();
    renderPanel(s);
    fireEvent.click(screen.getByRole('button', { name: 'Remover a rede Rede-Deposito' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover do lacre' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'wifi_remove', ssid: 'Rede-Deposito' })));
  });

  it('voltar à rede padrão exige justificativa', async () => {
    const { service: s, call } = service();
    renderPanel(s);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à rede padrão' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar à padrão' }));
    expect(call).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Rede do cliente mudou.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à padrão' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'wifi_reset', justification: 'Rede do cliente mudou.' })));
  });

  it('comando de rede aguardando o lacre aparece', () => {
    renderPanel(service().service, { ...SEAL, commands: [{ id: 'k1', kind: 'wifi_add', origin: 'admin_network', status: 'delivered', createdAt: '2026-10-17T14:08:00Z', deliveredAt: null, finishedAt: null, wifiSsid: 'Rede-Cliente' }] } as unknown as SealDetail);
    expect(screen.getByText(/Aguardando o lacre: Adicionar rede \(Rede-Cliente\)/)).toBeInTheDocument();
  });

  it('quem só vê não tem ações; offline desabilita', () => {
    const { unmount } = renderPanel(service().service, SEAL, { canAdmin: false });
    expect(screen.queryByRole('button', { name: 'Adicionar rede' })).not.toBeInTheDocument();
    unmount();
    renderPanel(service().service, SEAL, { online: false });
    expect(screen.getByRole('button', { name: 'Adicionar rede' })).toBeDisabled();
  });
});
