import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { SealPositionMap } from './seal-position-map';

// Spec 012: o mapa do lacre com as geocercas, para conferir de olho se ele está onde deveria. A legenda em texto diz, sem depender
// do desenho nem da cor, se o lacre está dentro ou fora de cada geocerca e a que distância (RF-042).
const POSITION = { latitude: -7.258314, longitude: -39.309741, accuracyM: 6, quality: 'gps' as const, readAt: '2026-10-18T14:00:00Z', lastSeenAt: '2026-10-18T14:00:00Z' };
const CERCA = (extra: Record<string, unknown>) => ({
  id: 'g1', name: 'Bancada', site_name: 'Laboratório', expected: false, shape: 'circle', center: { latitude: -7.258314, longitude: -39.309741 },
  radius_m: 150, vertices: null, inside: true, distance_m: 0, ...extra,
});

function service(body: Record<string, unknown>) {
  const call = vi.fn(async () => ({ status: 200, body: { code: 'FOUND', has_position: true, expected_reason: null, expected_site_name: null, geofence_access: true, radius_nearby_m: 2000, ...body } }));
  return { service: new SealService({ call } as SealTransport), call };
}
const renderMap = (s: SealService) => render(<SealPositionMap service={s} organizationId="org-a" deviceId="d1" position={POSITION} title="Última posição enviada pelo lacre" label="Lacre A" />);

describe('SealPositionMap', () => {
  it('lista as geocercas próximas com dentro e fora em texto', async () => {
    const { service: s, call } = service({ geofences: [CERCA({}), CERCA({ id: 'g2', name: 'Depósito', inside: false, distance_m: 1049 })] });
    renderMap(s);
    const lista = await screen.findByRole('list', { name: 'Geocercas perto do lacre' });
    expect(within(lista).getByText('Dentro de Bancada.')).toBeInTheDocument();
    expect(within(lista).getByText('Fora de Depósito, a 1 km.')).toBeInTheDocument();
    expect(screen.getByText(/Sem geocerca esperada/)).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith('query-seals', expect.objectContaining({ operation: 'seal_geofence_view', device_id: 'd1' }));
  });

  it('a esperada aparece primeiro, marcada em texto, com o motivo', async () => {
    const { service: s } = service({ expected_reason: 'watch', expected_site_name: 'Hospital Alfa', geofences: [CERCA({ name: 'Pátio', expected: true, inside: false, distance_m: 600 })] });
    renderMap(s);
    expect(await screen.findByText(/Geocerca esperada: Hospital Alfa \(unidade em vigilância\)/)).toBeInTheDocument();
    const item = within(screen.getByRole('list', { name: 'Geocercas perto do lacre' })).getByRole('listitem');
    expect(item).toHaveTextContent('Esperada');
    expect(item).toHaveTextContent('Fora de Pátio, a 600 m.');
  });

  it('unidade esperada sem geocerca cadastrada é avisada', async () => {
    const { service: s } = service({ expected_reason: 'trip', expected_site_name: 'Clínica Beta', geofences: [] });
    renderMap(s);
    expect(await screen.findByText(/Clínica Beta \(destino da viagem\) não tem geocerca cadastrada/)).toBeInTheDocument();
  });

  it('sem geofence.read: só o ponto, e a tela explica', async () => {
    const { service: s } = service({ geofence_access: false, geofences: [] });
    renderMap(s);
    expect(await screen.findByText(/Você não tem acesso às geocercas/)).toBeInTheDocument();
  });

  it('nenhuma geocerca a até 2 km', async () => {
    const { service: s } = service({ geofences: [] });
    renderMap(s);
    expect(await screen.findByText('Nenhuma geocerca da organização a até 2 km.')).toBeInTheDocument();
  });

  it('falha ao carregar as geocercas não esconde o ponto', async () => {
    const call = vi.fn(async () => ({ status: 500, body: {} }));
    renderMap(new SealService({ call } as SealTransport));
    expect(await screen.findByText('Não foi possível carregar as geocercas agora. O ponto do lacre continua no mapa.')).toBeInTheDocument();
    expect(screen.getByText(/-7.258314, -39.309741/)).toBeInTheDocument();
  });
});
