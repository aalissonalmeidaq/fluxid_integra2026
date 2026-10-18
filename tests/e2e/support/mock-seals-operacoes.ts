import { fail, type Json, type Reply } from './mock-registry';
import type { SealMock } from './mock-seals';

// Operações dos lacres no backend simulado dos E2E (Spec 012, contracts/operacoes-servidor.md): dispositivos, vínculo, comandos de
// trava, posições e alertas, em memória, por organização. As regras de verdade são provadas nas suítes pgTAP e `.live`; aqui basta
// o formato das respostas e as recusas que as telas mostram.

export interface LacresDoCenario {
  serialDe: (cylinderId: string) => string | null;
  itensDaViagem?: (tripId: string) => { id: string; cylinder_id: string }[];
}

const ok = (json: Json, status = 200): Reply => ({ status, json });
const texto = (valor: unknown) => (typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '');
const justificativaValida = (valor: unknown) => texto(valor).length >= 5 && texto(valor).length <= 500;

function resumo(device: Json): Json {
  const campos = ['device_id', 'device_code', 'label', 'status', 'health', 'lock_state', 'seal_state', 'battery_pct', 'signal_dbm', 'last_seen_at',
    'report_interval_s', 'position', 'pending_command', 'watch', 'violation'];
  return Object.fromEntries(campos.map((campo) => [campo, device[campo] ?? null]));
}

export function instalarLacres(mock: SealMock, cenario: LacresDoCenario): SealMock {
  const devices = () => mock.rows('devices');
  const bindings = () => mock.rows('bindings');
  const alerts = () => mock.rows('alerts');
  const positions = () => mock.rows('positions');
  const daOrg = (org: string, id: unknown) => devices().find((d) => d.organization_id === org && d.device_id === id);
  const vinculoAtivo = (filtro: (b: Json) => boolean) => bindings().find((b) => b.unbound_at === null && filtro(b));
  const cilindroDe = (device: Json) => {
    const vinculo = vinculoAtivo((b) => b.device_id === device.device_id);
    return vinculo ? { id: vinculo.cylinder_id, serial_number: vinculo.serial_number, custody_status: 'in_stock' } : null;
  };
  const agora = () => mock.now().toISOString();

  mock.register('list_seals', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const itens = devices().filter((d) => d.organization_id === org)
        .filter((d) => !body.health || d.health === body.health)
        .filter((d) => !body.lock_state || d.lock_state === body.lock_state)
        .filter((d) => body.unbound !== true || cilindroDe(d) === null)
        .map((d) => ({ ...resumo(d), cylinder: cilindroDe(d) }));
      return ok({ code: 'LISTED', items: itens, total: itens.length });
    },
  });

  mock.register('get_seal', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      if (!device) return fail('NOT_FOUND', 404);
      return ok({
        code: 'FOUND',
        seal: {
          ...resumo(device), seal_code: device.seal_code ?? null, activated_at: device.activated_at ?? null, firmware_version: device.firmware_version ?? null,
          wifi_in_use: device.wifi_in_use ?? null, wifi_saved: device.wifi_saved ?? [], version: device.version ?? 1,
          bindings: bindings().filter((b) => b.device_id === device.device_id).map(({ cylinder_id, serial_number, bound_at, unbound_at, unbind_reason }) =>
            ({ cylinder_id, serial_number, bound_at, unbound_at, unbind_reason })),
          commands: device.commands ?? [],
          alerts: alerts().filter((a) => a.device_id === device.device_id).map(({ id, kind, severity, status, opened_at, recovered_at }) =>
            ({ id, kind, severity, status, opened_at, recovered_at: recovered_at ?? null })),
        },
      });
    },
  });

  mock.register('list_unbound_active_seals', {
    kind: 'query', permission: 'seal.read',
    run: ({ org }) => ok({ code: 'LISTED', items: devices().filter((d) => d.organization_id === org && d.status === 'active' && cilindroDe(d) === null).map(resumo) }),
  });

  mock.register('cylinder_seal_view', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const vinculo = vinculoAtivo((b) => b.organization_id === org && b.cylinder_id === body.cylinder_id);
      const device = vinculo ? daOrg(org, vinculo.device_id) : undefined;
      return ok({ code: 'FOUND', seal: device ? resumo(device) : null });
    },
  });

  mock.register('trip_seal_view', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const itens = cenario.itensDaViagem?.(String(body.trip_id)) ?? [];
      return ok({
        code: 'FOUND',
        items: itens.map((item) => {
          const vinculo = vinculoAtivo((b) => b.organization_id === org && b.cylinder_id === item.cylinder_id);
          const device = vinculo ? daOrg(org, vinculo.device_id) : undefined;
          return { item_id: item.id, cylinder_id: item.cylinder_id, serial_number: cenario.serialDe(item.cylinder_id) ?? '', seal: device ? resumo(device) : null, unlock_note: null };
        }),
      });
    },
  });

  mock.register('list_positions', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => ok({
      code: 'LISTED',
      items: positions().filter((p) => p.organization_id === org && (p.cylinder_id === body.cylinder_id || p.device_id === body.device_id))
        .map(({ latitude, longitude, accuracy_m, quality, seal_state, battery_pct, read_at, last_seen_at, repeat_count }) =>
          ({ latitude, longitude, accuracy_m, quality, seal_state, battery_pct, read_at, last_seen_at, repeat_count })),
    }),
  });

  const visaoDoAlerta = (alerta: Json) => {
    const device = devices().find((d) => d.device_id === alerta.device_id)!;
    const vinculo = alerta.cylinder_id ? { id: alerta.cylinder_id, serial_number: cenario.serialDe(String(alerta.cylinder_id)) ?? '' } : null;
    return {
      id: alerta.id, kind: alerta.kind, severity: alerta.severity, source: alerta.source ?? 'system', status: alerta.status, opened_at: alerta.opened_at,
      recovered_at: alerta.recovered_at ?? null, acknowledged_at: alerta.acknowledged_at ?? null, closed_at: alerta.closed_at ?? null,
      device: { id: device.device_id, device_code: device.device_code, label: device.label }, cylinder: vinculo, trip_id: alerta.trip_id ?? null, site_id: null,
    };
  };

  mock.register('list_alerts', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const itens = alerts().filter((a) => a.organization_id === org)
        // `active` é a situação padrão da tela: abertos e reconhecidos.
        .filter((a) => !body.status || (body.status === 'active' ? a.status !== 'closed' : a.status === body.status))
        .filter((a) => !body.severity || a.severity === body.severity)
        .filter((a) => !body.kind || a.kind === body.kind)
        .map(visaoDoAlerta);
      return ok({ code: 'LISTED', items: itens, total: itens.length });
    },
  });

  mock.register('get_alert', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const alerta = alerts().find((a) => a.organization_id === org && a.id === body.alert_id);
      if (!alerta) return fail('NOT_FOUND', 404);
      const device = devices().find((d) => d.device_id === alerta.device_id)!;
      return ok({ code: 'FOUND', alert: { ...visaoDoAlerta(alerta), close_note: alerta.close_note ?? null, seal: resumo(device) } });
    },
  });

  mock.register('acknowledge_alert', {
    kind: 'manage', permission: 'seal.operate',
    run: ({ org, body }) => {
      const alerta = alerts().find((a) => a.organization_id === org && a.id === body.alert_id);
      if (!alerta) return fail('NOT_FOUND', 404);
      if (alerta.status === 'closed') return fail('ALERT_CLOSED', 409);
      Object.assign(alerta, { status: 'acknowledged', acknowledged_at: agora() });
      return ok({ code: 'ACKNOWLEDGED' });
    },
  });

  mock.register('close_alert', {
    kind: 'manage', permission: 'seal.operate',
    run: ({ org, body }) => {
      const alerta = alerts().find((a) => a.organization_id === org && a.id === body.alert_id);
      if (!alerta) return fail('NOT_FOUND', 404);
      if (!justificativaValida(body.note)) return fail('NOTE_REQUIRED', 400);
      Object.assign(alerta, { status: 'closed', closed_at: agora(), close_note: texto(body.note) });
      return ok({ code: 'CLOSED' });
    },
  });

  // Geocercas sobre o mapa do lacre. Cada cenário grava em `geofence_views` o que o banco responderia (dentro e distância vêm do PostGIS).
  mock.register('seal_geofence_view', {
    kind: 'query', permission: 'seal.read',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      if (!device) return fail('NOT_FOUND', 404);
      const salvo = mock.rows('geofence_views').find((v) => v.device_id === device.device_id);
      return ok({ code: 'FOUND', has_position: device.position !== null, expected_reason: null, expected_site_name: null, geofence_access: true, radius_nearby_m: 2000,
        geofences: [], ...(salvo ? { ...salvo, device_id: undefined } : {}) });
    },
  });

  mock.register('push_status', { kind: 'query', permission: 'seal.read', run: () => ok({ code: 'FOUND', active: false }) });

  mock.register('create_device', {
    kind: 'manage', permission: 'seal.admin',
    run: ({ org, body }) => {
      const label = texto(body.label);
      if (label.length < 2 || label.length > 60) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'label', message: 'Dê um nome de 2 a 60 caracteres ao lacre.' }] });
      const device = novoDispositivo(mock, org, label, Number(body.report_interval_s ?? 60));
      return ok({ code: 'CREATED', device_id: device.device_id, device_code: device.device_code, device_key: `fxk_e2e-${String(device.device_code).slice(4).toLowerCase()}-chave-ficticia` });
    },
  });

  mock.register('rotate_device_key', {
    kind: 'manage', permission: 'seal.admin',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      if (!device) return fail('NOT_FOUND', 404);
      if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
      return ok({ code: 'ROTATED', device_key: `fxk_e2e-${String(device.device_code).slice(4).toLowerCase()}-nova-ficticia` });
    },
  });

  mock.register('deactivate_device', {
    kind: 'manage', permission: 'seal.admin',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      if (!device) return fail('NOT_FOUND', 404);
      if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
      const vinculo = vinculoAtivo((b) => b.device_id === device.device_id);
      if (vinculo) Object.assign(vinculo, { unbound_at: agora(), unbind_reason: 'device_inactivated' });
      device.status = 'inactive';
      return ok({ code: 'INACTIVATED' });
    },
  });

  mock.register('bind_seal', {
    kind: 'manage', permission: 'seal.operate',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      const serial = cenario.serialDe(String(body.cylinder_id));
      if (!device || serial === null) return fail('NOT_FOUND', 404);
      if (device.status !== 'active') return fail('SEAL_INACTIVE', 409);
      if (cilindroDe(device)) return fail('SEAL_ALREADY_BOUND', 409);
      if (vinculoAtivo((b) => b.organization_id === org && b.cylinder_id === body.cylinder_id)) return fail('CYLINDER_ALREADY_BOUND', 409);
      bindings().push({ organization_id: org, device_id: device.device_id, cylinder_id: body.cylinder_id, serial_number: serial, bound_at: agora(), unbound_at: null, unbind_reason: null });
      return ok({ code: 'BOUND' });
    },
  });

  mock.register('unbind_seal', {
    kind: 'manage', permission: 'seal.operate',
    run: ({ org, body }) => {
      const device = daOrg(org, body.device_id);
      if (!device) return fail('NOT_FOUND', 404);
      if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
      const vinculo = vinculoAtivo((b) => b.device_id === device.device_id);
      if (!vinculo) return fail('NO_BINDING', 409);
      Object.assign(vinculo, { unbound_at: agora(), unbind_reason: 'manual' });
      return ok({ code: 'UNBOUND' });
    },
  });

  const pedirTrava = (kind: 'lock' | 'unlock') => ({ org, body }: { org: string; body: Json }): Reply => {
    if (!justificativaValida(body.justification)) return fail('JUSTIFICATION_REQUIRED', 400);
    if (kind === 'unlock' && mock.aal !== 'aal2') return fail('MFA_REQUIRED', 403);
    const vinculo = vinculoAtivo((b) => b.organization_id === org && b.cylinder_id === body.cylinder_id);
    const device = vinculo ? daOrg(org, vinculo.device_id) : undefined;
    if (!device) return fail('NO_BINDING', 409);
    if (device.status !== 'active') return fail('SEAL_INACTIVE', 409);
    const comando = { id: mock.nextId('c0'), kind, status: 'pending', origin: kind === 'lock' ? 'manual' : 'exceptional', created_at: agora() };
    device.pending_command = comando;
    return ok({ code: 'REQUESTED', command_id: comando.id });
  };
  mock.register('request_lock', { kind: 'manage', permission: 'seal.operate', run: pedirTrava('lock') });
  mock.register('request_unlock', { kind: 'manage', permission: 'seal.operate', run: pedirTrava('unlock') });
  return mock;
}

export function novoDispositivo(mock: SealMock, org: string, label: string, intervaloS = 60): Json {
  const numero = mock.rows('devices').length + 1;
  const device: Json = {
    organization_id: org, device_id: mock.nextId('d0'), device_code: `DSP-E2E${String(numero).padStart(5, '0')}`, label, status: 'active',
    health: 'never_seen', lock_state: 'none', seal_state: 'unknown', battery_pct: null, signal_dbm: null, last_seen_at: null,
    report_interval_s: intervaloS, position: null, pending_command: null, watch: null, violation: null, seal_code: null, activated_at: null,
    firmware_version: null, wifi_in_use: null, wifi_saved: [], version: 1, commands: [],
  };
  mock.rows('devices').push(device);
  return device;
}

// O lacre "liga" e fala com o FluxID pela primeira vez (o que a borda faria com a mensagem `activation`).
export function ativarDispositivo(mock: SealMock, deviceId: string, posicao = { latitude: -7.209194, longitude: -39.306367 }): void {
  const device = mock.rows('devices').find((d) => d.device_id === deviceId)!;
  const agora = mock.now().toISOString();
  Object.assign(device, {
    health: 'ok', lock_state: 'unlocked', seal_state: 'closed', battery_pct: 87, signal_dbm: -61, last_seen_at: agora, activated_at: agora,
    seal_code: `LCR-${String(device.device_code).slice(4)}`, firmware_version: '2.0.0',
    wifi_in_use: { ssid: 'Rede-Ficticia-01', kind: 'default', rssi: -61, at: agora },
    position: { ...posicao, accuracy_m: 6.5, quality: 'gps', read_at: agora, last_seen_at: agora },
  });
}

// Cenário pronto: lacre ativo, já vinculado ao cilindro e com a última posição (sem passar pela tela).
export function lacreVinculado(mock: SealMock, org: string, cylinderId: string, serial: string, label: string, extra: Json = {}): Json {
  const device = novoDispositivo(mock, org, label);
  ativarDispositivo(mock, String(device.device_id));
  Object.assign(device, extra);
  mock.rows('bindings').push({ organization_id: org, device_id: device.device_id, cylinder_id: cylinderId, serial_number: serial, bound_at: mock.now().toISOString(), unbound_at: null, unbind_reason: null });
  return device;
}

// Posições do lacre, uma por minuto até agora, para a lista em texto (alternativa ao mapa).
export function registrarPosicoes(mock: SealMock, org: string, device: Json, cylinderId: string, quantas: number): void {
  for (let i = quantas; i >= 1; i -= 1) {
    const lida = new Date(mock.now().getTime() - i * 60_000).toISOString();
    mock.rows('positions').push({
      organization_id: org, device_id: device.device_id, cylinder_id: cylinderId, latitude: -7.209194 + i * 0.0003, longitude: -39.306367, accuracy_m: 6.5,
      quality: 'gps', seal_state: 'closed', battery_pct: 87, read_at: lida, last_seen_at: lida, repeat_count: 0,
    });
  }
}

export function abrirAlerta(mock: SealMock, org: string, device: Json, kind: string, severity: string, extra: Json = {}): Json {
  const alerta: Json = {
    organization_id: org, id: mock.nextId('a0'), device_id: device.device_id, cylinder_id: null, kind, severity, source: 'system', status: 'open',
    opened_at: new Date(mock.now().getTime() - 5 * 60_000).toISOString(), ...extra,
  };
  mock.rows('alerts').push(alerta);
  return alerta;
}
