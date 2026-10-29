import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { EmailNotificationService } from '@/application/tracking/email-notification-service';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { EmailDeliveriesPanel } from '@/pages/settings/email-notification-settings';
import { AlertDetailView } from './alert-detail-page';

// Spec 012 (T055; RF-036, RF-036c, RF-042, RF-043): detalhe do alerta (destino do toque na notificação) com a última posição do lacre
// no mapa e em texto; reconhecer e encerrar, este com observação de 5 a 500 caracteres.
vi.mock('@/components/maps/osm-map', () => ({
  OsmMap: ({ title, label, details, latitude, longitude }: { title: string; label: string; details: string[]; latitude: number; longitude: number }) => <figure aria-label={title}>{label} · {details.join(' · ')} · Ponto: {latitude}, {longitude}</figure>,
}));

const NOW = new Date('2026-10-17T14:10:00Z');
const ID = 'a1600000-0000-4000-8000-0000000000a1';
const SEAL = {
  device_id: 'd1', device_code: 'DSP-READA001', label: 'Lacre A', status: 'active', health: 'no_comm', lock_state: 'locked', seal_state: 'closed',
  battery_pct: 60, signal_dbm: -70, last_seen_at: '2026-10-17T14:00:00Z', report_interval_s: 60,
  position: { latitude: -7.2, longitude: -39.3, accuracy_m: 5, quality: 'gps', read_at: '2026-10-17T14:00:00Z', last_seen_at: '2026-10-17T14:00:00Z' },
  pending_command: null, watch: null, violation: null,
};
const ALERT = {
  id: ID, kind: 'possible_loss', severity: 'high', source: 'system', status: 'open', opened_at: '2026-10-17T14:02:00Z', recovered_at: null,
  acknowledged_at: null, closed_at: null, device: { id: 'd1', device_code: 'DSP-READA001', label: 'Lacre A' },
  cylinder: { id: 'c1', serial_number: 'CIL-0042' }, trip_id: null, site_id: null, close_note: null, seal: SEAL,
};

function service(byOperation: Record<string, unknown[]>) {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => {
    const queue = byOperation[String(body.operation)] ?? [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return { status: 200, body: next };
  });
  return { service: new SealService({ call } as SealTransport), call };
}
const renderDetail = (s: SealService, extra: Partial<React.ComponentProps<typeof AlertDetailView>> = {}) =>
  render(<AlertDetailView service={s} organizationId="org-a" alertId={ID} online realtime={null} canOperate now={() => NOW} {...extra} />);

describe('AlertDetailView', () => {
  it('Spec 015 (US6): a falha do aviso por e-mail aparece no detalhe e não muda nem duplica o alerta', async () => {
    const { service: s, call } = service({ get_alert: [{ code: 'FOUND', alert: ALERT }] });
    const email = new EmailNotificationService({ call: vi.fn(async () => ({ status: 200, body: { code: 'FOUND', items: [
      { category: 'seal_high_critical', transition: 'opened', status: 'failed', updated_at: '2026-10-17T14:03:00Z', sent_at: null, error_code: 'DELIVERY_REJECTED' },
    ] } })) } as TrackingTransport);
    renderDetail(s, { emailDeliveries: <EmailDeliveriesPanel service={email} organizationId="org-a" alertId={ID} /> });
    expect(await screen.findByText(/Abertura: Falhou — o provedor recusou o envio/)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2, name: 'Possível extravio' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Encerrar alerta' })).toBeEnabled();
    expect(call.mock.calls.every(([fn]) => fn.startsWith('query-')), JSON.stringify(call.mock.calls.map(([fn]) => fn))).toBe(true);
  });

  it('mostra tipo, severidade, lacre, cilindro e a última posição no mapa e em texto', async () => {
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: ALERT }] });
    renderDetail(s);
    expect(await screen.findByRole('heading', { level: 2, name: 'Possível extravio' })).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getAllByText(/DSP-READA001/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'CIL-0042' })).toHaveAttribute('href', '/cilindros/c1');
    expect(screen.getByLabelText('Última posição do lacre')).toHaveTextContent('-7.2, -39.3');
    expect(screen.getByLabelText('Última posição do lacre')).toHaveTextContent('Possível extravio · Lacre A · DSP-READA001 · CIL-0042');
    expect(screen.getByText(/há 10 minutos/)).toBeInTheDocument();
  });

  it('volta do lacre aparece no alerta, que continua aberto', async () => {
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: { ...ALERT, recovered_at: '2026-10-17T14:08:00Z' } }] });
    renderDetail(s);
    expect(await screen.findByText(/O lacre voltou a comunicar há 2 minutos/)).toBeInTheDocument();
  });

  it('reconhecer e encerrar com observação', async () => {
    const { service: s, call } = service({
      get_alert: [{ code: 'FOUND', alert: ALERT }, { code: 'FOUND', alert: { ...ALERT, status: 'acknowledged' } },
        { code: 'FOUND', alert: { ...ALERT, status: 'closed', close_note: 'Conferido no depósito.' } }],
      acknowledge_alert: [{ code: 'ACKNOWLEDGED' }], close_alert: [{ code: 'CLOSED' }],
    });
    renderDetail(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconhecer' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'acknowledge_alert', alert_id: ID })));
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar alerta' }));
    const field = await screen.findByLabelText('Observação');
    fireEvent.change(field, { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(await screen.findByText(/pelo menos 5 caracteres/)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'Conferido no depósito.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'close_alert', note: 'Conferido no depósito.' })));
    expect(await screen.findByText('Encerrado')).toBeInTheDocument();
  });

  it('sem permissão de operar: sem ações', async () => {
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: ALERT }] });
    renderDetail(s, { canOperate: false });
    await screen.findByRole('heading', { level: 2, name: 'Possível extravio' });
    expect(screen.queryByRole('button', { name: 'Reconhecer' })).not.toBeInTheDocument();
  });

  it('offline: ações desabilitadas com o motivo', async () => {
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: ALERT }] });
    const { rerender } = renderDetail(s);
    await screen.findByRole('button', { name: 'Reconhecer' });
    rerender(<AlertDetailView service={s} organizationId="org-a" alertId={ID} online={false} realtime={null} canOperate now={() => NOW} />);
    expect(screen.getByRole('button', { name: 'Reconhecer' })).toBeDisabled();
    expect(screen.getByText('Sem conexão: comandos de lacre exigem conexão.')).toBeInTheDocument();
  });

  it('alerta de outra organização: "não encontrado"', async () => {
    const call = vi.fn(async () => ({ status: 404, body: { code: 'NOT_FOUND' } }));
    renderDetail(new SealService({ call } as SealTransport));
    expect(await screen.findByText('Alerta não encontrado')).toBeInTheDocument();
  });

  // Spec 015 (T069): o alerta de afastamento leva à ocorrência de proximidade, com as evidências e o tratamento próprios.
  it('alerta de afastamento mostra o link para a ocorrência e diz quando foi detectado depois', async () => {
    const proximity = { ...ALERT, kind: 'proximity_separation', occurrence_id: 'f1560000-0000-4000-8000-0000000000a1', retrospective: true };
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: proximity }] });
    renderDetail(s);
    expect(await screen.findByRole('link', { name: 'Ver a ocorrência de afastamento' })).toHaveAttribute('href', '/rastreamento/ocorrencias/f1560000-0000-4000-8000-0000000000a1');
    expect(screen.getByText(/detectado depois/)).toBeInTheDocument();
  });

  it('outros alertas não mostram o link da ocorrência', async () => {
    const { service: s } = service({ get_alert: [{ code: 'FOUND', alert: ALERT }] });
    renderDetail(s);
    await screen.findByText('CIL-0042');
    expect(screen.queryByRole('link', { name: 'Ver a ocorrência de afastamento' })).toBeNull();
  });
});
