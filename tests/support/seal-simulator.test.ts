// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseSealRequest } from '../../supabase/functions/_shared/seal-protocol';
import { SealSimulator } from './seal-simulator';

// Spec 012 (T020): o simulador fala exatamente o contrato (CA-011) e se comporta como o firmware: fila, reenvio com o mesmo id,
// comando lido da resposta e confirmado no envio seguinte.

const fixture = (nome: string) => JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../fixtures/seal-protocol', nome), 'utf8')) as Record<string, unknown>;

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const next = responses.shift() ?? { status: 200, body: fixture('resposta-200-sem-comando.json') };
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  return { fn, calls };
}

const reply = (results: { message_id: string; status: string }[], extra: Record<string, unknown> = {}) => ({
  status: 200, body: { server_time: '2026-10-17T14:03:01Z', results, command: null, watch: { active: false, version: 0 }, report_interval_s: 60, ...extra },
});

const sim = (fetch: unknown, extra: Partial<ConstructorParameters<typeof SealSimulator>[0]> = {}) => new SealSimulator({
  url: 'http://127.0.0.1:54321', deviceCode: 'DSP-7KQ2M9XT', key: 'chave-de-teste', fetch: fetch as typeof globalThis.fetch,
  now: () => new Date('2026-10-17T14:03:00Z'), ...extra,
});

describe('SealSimulator', () => {
  it('envia para o endpoint com os cabeçalhos do dispositivo e um corpo válido pelo contrato', async () => {
    const { fn, calls } = fakeFetch([]);
    const s = sim(fn);
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect(calls[0]!.url).toBe('http://127.0.0.1:54321/functions/v1/seal-gateway');
    expect(calls[0]!.headers).toMatchObject({ 'X-Device-Id': 'DSP-7KQ2M9XT', 'X-Device-Key': 'chave-de-teste', 'Content-Type': 'application/json' });
    const parsed = parseSealRequest(calls[0]!.body);
    expect(parsed.ok && parsed.value.messages.every((m) => m.problem === null)).toBe(true);
  });

  it('cada mensagem tem identificador único, e o tipo de cada método é o do contrato', async () => {
    const { fn, calls } = fakeFetch([]);
    const s = sim(fn);
    s.activation({ latitude: -7.2, longitude: -39.3 });
    s.position({ latitude: -7.2, longitude: -39.3, quality: 'last_known' });
    s.event('button');
    s.alert('low_battery', 14);
    s.shutdown({ latitude: -7.2, longitude: -39.3 });
    s.networkChange({ ssid: 'Rede-Ficticia', kind: 'list', rssi: -60 }, ['Rede-Ficticia']);
    s.autoLock({ latitude: -7.21, longitude: -39.31 }, '2026-10-17T14:00:00Z');
    await s.send();
    const msgs = calls[0]!.body.messages as { message_id: string; type: string }[];
    expect(new Set(msgs.map((m) => m.message_id)).size).toBe(7);
    expect(msgs.map((m) => m.type)).toEqual(['activation', 'position', 'event', 'alert', 'shutdown', 'network_change', 'auto_lock']);
    const parsed = parseSealRequest(calls[0]!.body);
    expect(parsed.ok && parsed.value.messages.every((m) => m.problem === null)).toBe(true);
  });

  it('sem resposta, guarda e reenvia com os mesmos identificadores; com a resposta, tira da fila', async () => {
    const { fn, calls } = fakeFetch([{ status: 503, body: { error: 'unavailable' } }]);
    const s = sim(fn);
    s.position({ latitude: -7.2, longitude: -39.3 });
    expect((await s.send()).status).toBe(503);
    expect(s.pending).toBe(1);
    const id = (calls[0]!.body.messages as { message_id: string }[])[0]!.message_id;
    fn.mockImplementationOnce(async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      return new Response(JSON.stringify(reply([{ message_id: id, status: 'duplicate' }]).body), { status: 200 });
    });
    await s.send();
    expect((calls[1]!.body.messages as { message_id: string }[])[0]!.message_id).toBe(id);
    expect(s.pending).toBe(0);
  });

  it('envia no máximo 50 por vez', async () => {
    const { fn, calls } = fakeFetch([]);
    const s = sim(fn);
    for (let i = 0; i < 60; i += 1) s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect((calls[0]!.body.messages as unknown[]).length).toBe(50);
  });

  it('executa o comando recebido e confirma no envio seguinte; a válvula começa aberta (RN-010)', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: fixture('resposta-200-trava.json') }]);
    const s = sim(fn);
    expect(s.valve).toBe('open');
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect(s.valve).toBe('closed');
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    const msgs = calls[1]!.body.messages as { type: string; command_id?: string; result?: string }[];
    expect(msgs.find((m) => m.type === 'command_result')).toMatchObject({ command_id: '6c1f0000-0000-4000-8000-000000000001', result: 'executed' });
  });

  it('pode responder erro ao comando, como um acionador com defeito', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: fixture('resposta-200-trava.json') }]);
    const s = sim(fn, { onCommand: () => ({ result: 'error', reason: 'actuator' }) });
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect(s.valve).toBe('open');
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect((calls[1]!.body.messages as { type: string; reason?: string }[]).find((m) => m.type === 'command_result')).toMatchObject({ result: 'error', reason: 'actuator' });
  });

  it('guarda a vigilância e informa a versão que tem', async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: fixture('resposta-200-vigilancia.json') }]);
    const s = sim(fn);
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect(s.watch).toMatchObject({ active: true, version: 4 });
    expect(s.watch.fences).toHaveLength(2);
    s.position({ latitude: -7.2, longitude: -39.3 });
    await s.send();
    expect(calls[1]!.body.watch_version).toBe(4);
  });

  it('sendRaw manda um corpo e cabeçalhos livres, para os testes de recusa', async () => {
    const { fn, calls } = fakeFetch([{ status: 401, body: { error: 'unauthorized' } }]);
    const s = sim(fn);
    const response = await s.sendRaw({ protocol: 1, messages: [] }, { 'X-Device-Key': 'errada' });
    expect(response).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(calls[0]!.headers['X-Device-Key']).toBe('errada');
  });
});

// Spec 013 (T032): o modo "aguardando aprovação" (contracts/pedido-de-aprovacao.md; research.md, item 4).
describe('SealSimulator aguardando aprovação', () => {
  const pending = (extra: Record<string, unknown> = {}) => ({ status: 202, body: { status: 'pending_approval', report_interval_s: 60, ...extra } });

  it('manda só boot e a rede em uso, num corpo válido pelo contrato, sem leituras na fila', async () => {
    const { fn, calls } = fakeFetch([pending()]);
    const s = sim(fn);
    await s.requestApproval();
    const parsed = parseSealRequest(calls[0]!.body);
    expect(parsed.ok).toBe(true);
    expect((calls[0]!.body.messages as { type: string; code?: string }[]).map((m) => m.code ?? m.type)).toEqual(['boot', 'network_change']);
    expect(s.pending).toBe(0);
    expect(s.approval).toBe('pending');
  });

  it('recusado: 403 e a situação fica recusada', async () => {
    const { fn } = fakeFetch([{ status: 403, body: { status: 'refused' } }]);
    const s = sim(fn);
    await s.requestApproval();
    expect(s.approval).toBe('refused');
  });

  it('forget_networks: apaga as redes extras e confirma com networks_forgotten até o 202 deixar de pedir', async () => {
    const { fn, calls } = fakeFetch([pending({ forget_networks: 'all' }), pending()]);
    const s = sim(fn);
    s.wifiSaved.push('Rede-Do-Tenant-A');
    await s.requestApproval();
    expect(s.wifiSaved).toEqual([]);
    expect(s.forgotten).toBe('all');
    await s.requestApproval();
    const second = calls[1]!.body.messages as { code?: string; detail?: string }[];
    expect(second.find((m) => m.code === 'networks_forgotten')?.detail).toBe('all');
    expect(s.forgotten).toBeNull();
  });

  it('aprovado: 200 e passa a operar', async () => {
    const { fn } = fakeFetch([reply([])]);
    const s = sim(fn);
    await s.requestApproval();
    expect(s.approval).toBe('approved');
  });
});
