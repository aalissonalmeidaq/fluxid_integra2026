import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import type { GeocodingService } from '@/application/registry/geocoding-service';
import { SealDetailView } from './seal-detail-page';

vi.mock('@/components/maps/osm-map', () => ({
  OsmMap: ({ title, label, details, latitude, longitude, caption, address }: { title: string; label: string; details: string[]; latitude: number; longitude: number; caption?: string; address?: { resolve: () => Promise<string | null> } }) => (
    <figure aria-label={title}>{label} · {details.join(' · ')} · {caption} Ponto: {latitude}, {longitude}
      {address && <button type="button" onClick={() => void address.resolve()}>Mostrar endereço no balão</button>}
    </figure>
  ),
}));

// Spec 012 (T094; RF-031 a RF-034, RF-034a; História 5): detalhe do dispositivo com saúde, trava, bateria, vínculo atual e anteriores,
// comandos e alertas; ações conforme a permissão (gerar chave nova, desativar, desvincular), todas com justificativa.
const NOW = new Date('2026-10-17T14:10:00Z');
const DEVICE = 'a1400000-0000-4000-8000-0000000000a1';
const DETAIL = {
  device_id: DEVICE, device_code: 'DSP-READA001', label: 'Lacre do pátio', status: 'active', health: 'ok', lock_state: 'locked', seal_state: 'closed',
  battery_pct: 87, signal_dbm: -61, last_seen_at: '2026-10-17T14:09:00Z', report_interval_s: 60,
  position: { latitude: -7.209194, longitude: -39.306367, accuracy_m: 6, quality: 'gps', read_at: '2026-10-17T14:09:00Z', last_seen_at: '2026-10-17T14:09:00Z' },
  pending_command: null, watch: null, violation: null,
  seal_code: 'LCR-JKFL6VBR', activated_at: '2026-10-17T08:00:00Z', firmware_version: '2.0.0', version: 3,
  wifi_in_use: { ssid: 'Rede-Deposito', kind: 'list', rssi: -60, at: '2026-10-17T14:09:00Z' }, wifi_saved: ['Rede-Deposito'],
  bindings: [
    { cylinder_id: 'c1', serial_number: 'CIL-0042', bound_at: '2026-10-16T10:00:00Z', unbound_at: null, unbind_reason: null },
    { cylinder_id: 'c0', serial_number: 'CIL-0001', bound_at: '2026-10-10T10:00:00Z', unbound_at: '2026-10-16T09:00:00Z', unbind_reason: 'manual' },
  ],
  commands: [{ id: 'k1', kind: 'lock', origin: 'trip_start', status: 'confirmed', created_at: '2026-10-17T09:00:00Z', delivered_at: '2026-10-17T09:01:00Z', finished_at: '2026-10-17T09:01:30Z', wifi_ssid: null }],
  alerts: [{ id: 'al1', kind: 'no_comm', severity: 'medium', status: 'open', opened_at: '2026-10-17T12:00:00Z', recovered_at: '2026-10-17T12:05:00Z' }],
};

function service(byOperation: Record<string, unknown[]>) {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => {
    const queue = byOperation[String(body.operation)] ?? [{ code: 'OK' }];
    return { status: 200, body: queue.length > 1 ? queue.shift() : queue[0] };
  });
  return { service: new SealService({ call } as SealTransport), call };
}
const renderDetail = (s: SealService, permissions: string[] = ['seal.read', 'seal.operate', 'seal.admin'], geocoder: GeocodingService | null = null) =>
  render(<SealDetailView service={s} organizationId="org-a" deviceId={DEVICE} online realtime={null} permissions={permissions} geocoder={geocoder} now={() => NOW} />);

describe('SealDetailView', () => {
  it('mostra o dispositivo, o vínculo atual e os anteriores, a rede em uso, comandos e alertas', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    renderDetail(s);
    expect(await screen.findByRole('heading', { level: 2, name: 'Lacre do pátio' })).toBeInTheDocument();
    expect(screen.getByText('DSP-READA001')).toBeInTheDocument();
    expect(screen.getByText('Funcionando')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CIL-0042' })).toHaveAttribute('href', '/cilindros/c1');
    expect(screen.getByText(/CIL-0001/)).toBeInTheDocument();
    expect(screen.getAllByText(/Rede-Deposito/)).toHaveLength(2);
    expect(screen.getByText(/Início da viagem/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sem comunicação/ })).toHaveAttribute('href', '/alertas/al1');
    expect(document.body.textContent).not.toMatch(/fxk_|senha/i);
  });

  it('mostra no mapa a posição recebida do Supabase e oferece o histórico em texto', async () => {
    const positions = [{ latitude: -7.209194, longitude: -39.306367, accuracy_m: 6, quality: 'gps', seal_state: 'closed', battery_pct: 87,
      read_at: '2026-10-17T14:09:00Z', last_seen_at: '2026-10-17T14:09:00Z', repeat_count: 1 }];
    const { service: s, call } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }], list_positions: [{ code: 'LISTED', items: positions }] });
    renderDetail(s);

    expect(await screen.findByRole('heading', { level: 3, name: 'Posição enviada' })).toBeInTheDocument();
    expect(screen.getByLabelText('Última posição enviada pelo lacre')).toHaveTextContent('-7.209194, -39.306367');
    expect(screen.getByLabelText('Última posição enviada pelo lacre')).toHaveTextContent('Lacre do pátio · DSP-READA001');
    expect(screen.getByText(/Recebida pelo Supabase há 1 minuto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver as posições em texto' }));
    expect(await screen.findByText(/-7.209194, -39.306367/)).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith('query-seals', expect.objectContaining({ operation: 'list_positions', device_id: DEVICE }));
  });

  it('traduz as coordenadas do lacre em endereço somente depois da confirmação', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    const reverseSeal = vi.fn(async () => ({ kind: 'found' as const, address: {
      street: 'Rua do Pátio', number: '10', district: 'Centro', city: 'Juazeiro do Norte', state: 'CE', postalCode: '63000000',
      displayName: 'Rua do Pátio, 10, Centro, Juazeiro do Norte, CE',
    } }));
    renderDetail(s, ['seal.read'], { reverseSeal } as unknown as GeocodingService);
    fireEvent.click(await screen.findByRole('button', { name: 'Descobrir endereço' }));
    expect(reverseSeal).not.toHaveBeenCalled();
    expect(screen.getByText(/As coordenadas serão enviadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Concordo e buscar endereço' }));
    expect(await screen.findByText(/Rua do Pátio, 10/)).toBeInTheDocument();
    expect(reverseSeal).toHaveBeenCalledWith('org-a', DEVICE, -7.209194, -39.306367, true);
  });

  it('o balão do ponto no mapa consulta o endereço e ele aparece também na seção da posição', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    const reverseSeal = vi.fn(async () => ({ kind: 'found' as const, address: {
      street: 'Rua do Pátio', number: '10', district: 'Centro', city: 'Juazeiro do Norte', state: 'CE', postalCode: '63000000',
      displayName: 'Rua do Pátio, 10, Centro, Juazeiro do Norte, CE',
    } }));
    renderDetail(s, ['seal.read'], { reverseSeal } as unknown as GeocodingService);
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar endereço no balão' }));
    expect(await screen.findByText(/Rua do Pátio, 10/)).toBeInTheDocument();
    expect(reverseSeal).toHaveBeenCalledWith('org-a', DEVICE, -7.209194, -39.306367, true);
    expect(screen.queryByRole('button', { name: 'Descobrir endereço' })).toBeNull();
  });

  it('gerar chave nova: justificativa e a chave aparece uma vez', async () => {
    const { service: s, call } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }], rotate_device_key: [{ code: 'ROTATED', device_key: 'fxk_nova-chave' }] });
    renderDetail(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar chave nova' }));
    fireEvent.change(await screen.findByLabelText('Justificativa'), { target: { value: 'Chave exposta na bancada.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar a chave' }));
    expect(await screen.findByText('fxk_nova-chave')).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'rotate_device_key', justification: 'Chave exposta na bancada.' }));
  });

  it('desvincular com justificativa; em viagem em andamento, explica a recusa', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => (body.operation === 'unbind_seal'
      ? { status: 409, body: { code: 'CYLINDER_IN_TRIP' } } : { status: 200, body: { code: 'FOUND', seal: DETAIL } }));
    renderDetail(new SealService({ call } as SealTransport));
    void s;
    fireEvent.click(await screen.findByRole('button', { name: 'Desvincular' }));
    fireEvent.change(await screen.findByLabelText('Justificativa'), { target: { value: 'Troca do lacre.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular o lacre' }));
    expect(await screen.findByText('O cilindro está numa viagem em andamento.')).toBeInTheDocument();
  });

  it('quem só vê não tem ações', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    renderDetail(s, ['seal.read']);
    await screen.findByRole('heading', { level: 2, name: 'Lacre do pátio' });
    expect(screen.queryByRole('button', { name: 'Gerar chave nova' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desvincular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar rede' })).not.toBeInTheDocument();
  });

  it('redes Wi-Fi (US7): quem administra adiciona pela seção da rede', async () => {
    const { service: s } = service({ get_seal: [{ code: 'FOUND', seal: DETAIL }] });
    renderDetail(s);
    expect(await screen.findByRole('button', { name: 'Adicionar rede' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remover a rede Rede-Deposito' })).toBeInTheDocument();
  });

  it('dispositivo de outra organização: "não encontrado"', async () => {
    const call = vi.fn(async () => ({ status: 404, body: { code: 'NOT_FOUND' } }));
    renderDetail(new SealService({ call } as SealTransport));
    expect(await screen.findByText('Lacre não encontrado')).toBeInTheDocument();
    await waitFor(() => expect(call).toHaveBeenCalled());
  });
});
