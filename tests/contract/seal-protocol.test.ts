// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MESSAGE_TYPES, SEAL_PROTOCOLS, parseSealRequest, parseSealResponse, type ParsedRequest,
} from '../../supabase/functions/_shared/seal-protocol';

// Spec 012, contrato das mensagens do lacre (contracts/mensagens-do-lacre.md, CA-011, RF-004, RF-007, RF-007a). Os exemplos de
// tests/fixtures/seal-protocol são a referência exata, usada também pelo simulador e pelos testes nativos do firmware.

const DIR = path.resolve(import.meta.dirname, '../fixtures/seal-protocol');
const fixtures = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as unknown]));
const pedidos = Object.entries(fixtures).filter(([nome]) => nome.startsWith('pedido-'));
const respostas = Object.entries(fixtures).filter(([nome]) => nome.startsWith('resposta-'));
const erros = Object.entries(fixtures).filter(([nome]) => nome.startsWith('erro-'));

const ok = (body: unknown): ParsedRequest => {
  const parsed = parseSealRequest(body);
  if (!parsed.ok) throw new Error(`pedido recusado: ${parsed.error}`);
  return parsed.value;
};
const base = () => structuredClone(fixtures['pedido-position.json']) as { protocol: number; messages: Record<string, unknown>[] };

describe('exemplos canônicos', () => {
  it.each(pedidos)('%s passa no esquema e todas as mensagens são aceitas', (_nome, body) => {
    const value = ok(body);
    expect(value.messages.length).toBeGreaterThan(0);
    expect(value.messages.every((m) => m.problem === null)).toBe(true);
  });

  it('todo tipo de mensagem do contrato tem exemplo', () => {
    const tipos = new Set(pedidos.flatMap(([, body]) => ok(body).messages.map((m) => m.type)));
    expect([...tipos].sort()).toEqual([...MESSAGE_TYPES].sort());
  });

  it.each(respostas)('%s é uma resposta 200 válida', (_nome, body) => {
    expect(parseSealResponse(body)).toEqual({ ok: true });
  });

  it('há exemplo de resposta sem comando, com cada tipo de comando, com e sem cercas, repetida e recusada', () => {
    const corpo = (nome: string) => fixtures[nome] as { command: { kind: string } | null; watch: { fences?: unknown } };
    const kinds = respostas.map(([nome]) => corpo(nome).command?.kind ?? 'nenhum');
    expect(new Set(kinds)).toEqual(new Set(['nenhum', 'lock', 'wifi_add', 'wifi_remove', 'wifi_reset']));
    expect(respostas.some(([nome]) => corpo(nome).watch.fences)).toBe(true);
    expect(respostas.some(([nome]) => (fixtures[nome] as { watch: { active: boolean; fences?: unknown } }).watch.active && !corpo(nome).watch.fences)).toBe(true);
    expect(Object.keys(fixtures)).toEqual(expect.arrayContaining(['resposta-200-repetida.json', 'resposta-200-recusada.json']));
  });

  it('há exemplo de cada erro do contrato', () => {
    const codigos = erros.map(([, body]) => (body as { error: string }).error).sort();
    expect(codigos).toEqual(['invalid_body', 'rate_limited', 'unauthorized', 'unavailable', 'unsupported_protocol']);
  });

  it('os exemplos só usam valores fictícios: nenhuma chave de dispositivo nem endereço real', () => {
    const texto = JSON.stringify(fixtures);
    expect(texto).not.toMatch(/fxk_/);
    expect(texto).not.toMatch(/supabase\.co/);
  });
});

describe('recusa do corpo inteiro', () => {
  it('não é objeto, sem messages, ou messages vazio', () => {
    expect(parseSealRequest(null)).toEqual({ ok: false, error: 'invalid_body' });
    expect(parseSealRequest({ protocol: 1 })).toEqual({ ok: false, error: 'invalid_body' });
    expect(parseSealRequest({ protocol: 1, messages: [] })).toEqual({ ok: false, error: 'invalid_body' });
  });

  it('mais de 50 leituras num envio (RF-004)', () => {
    const body = base();
    const uma = body.messages[0];
    body.messages = Array.from({ length: 51 }, (_, i) => ({ ...uma, message_id: `M-${i}` }));
    expect(parseSealRequest(body)).toEqual({ ok: false, error: 'invalid_body' });
    body.messages = body.messages.slice(0, 50);
    expect(ok(body).messages).toHaveLength(50);
  });

  it('protocol fora da lista aceita responde unsupported_protocol (RF-007a)', () => {
    expect(SEAL_PROTOCOLS).toEqual([1]);
    expect(parseSealRequest({ ...base(), protocol: 2 })).toEqual({ ok: false, error: 'unsupported_protocol' });
    expect(parseSealRequest({ ...base(), protocol: '1' })).toEqual({ ok: false, error: 'invalid_body' });
  });

  it('message_id ausente ou acima de 64 caracteres', () => {
    const body = base();
    body.messages[0]!.message_id = 'x'.repeat(65);
    expect(parseSealRequest(body)).toEqual({ ok: false, error: 'invalid_body' });
    delete body.messages[0]!.message_id;
    expect(parseSealRequest(body)).toEqual({ ok: false, error: 'invalid_body' });
  });

  it('watch_version e firmware_version fora do formato', () => {
    expect(parseSealRequest({ ...base(), watch_version: -1 })).toEqual({ ok: false, error: 'invalid_body' });
    expect(parseSealRequest({ ...base(), firmware_version: 'v'.repeat(41) })).toEqual({ ok: false, error: 'invalid_body' });
  });
});

describe('recusa de um item (o resto do envio continua)', () => {
  const problema = (alterar: (m: Record<string, unknown>) => void) => {
    const body = base();
    alterar(body.messages[0]!);
    return ok(body).messages[0]!.problem;
  };

  it('tipo desconhecido', () => expect(problema((m) => { m.type = 'telemetry'; })).toBe('invalid_field'));
  it('quality fora de gps e last_known', () => expect(problema((m) => { m.quality = 'wifi'; })).toBe('invalid_field'));
  it('coordenadas fora do intervalo', () => expect(problema((m) => { m.latitude = 91; })).toBe('invalid_field'));
  it('bateria fora de 0 a 100', () => expect(problema((m) => { m.battery_pct = 101; })).toBe('invalid_field'));
  it('bateria sem medição vai como null e é aceita', () => expect(problema((m) => { m.battery_pct = null; })).toBeNull());
  it('read_at sem fuso', () => expect(problema((m) => { m.read_at = '2026-10-17 14:03'; })).toBe('invalid_field'));
  it('estado do lacre desconhecido', () => expect(problema((m) => { m.seal_state = 'cut'; })).toBe('invalid_field'));
  it('rede com nome acima de 32 bytes', () => expect(problema((m) => { m.wifi = { ssid: 'r'.repeat(33), kind: 'list', rssi: -60 }; })).toBe('invalid_field'));
  it('aceita redes disponíveis sem senha e recusa sinal ou quantidade inválidos', () => {
    const body = base();
    body.messages[0]!.available_networks = [{ ssid: 'Rede-Cliente', rssi: -48 }];
    expect(ok(body).messages[0]!.data.available_networks).toEqual([{ ssid: 'Rede-Cliente', rssi: -48 }]);
    body.messages[0]!.available_networks = [{ ssid: 'Rede-Cliente', rssi: 1 }];
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
    body.messages[0]!.available_networks = Array.from({ length: 31 }, (_, index) => ({ ssid: `Rede-${index}`, rssi: -60 }));
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
  });

  it('command_result exige command_id uuid e result executed ou error', () => {
    const body = structuredClone(fixtures['pedido-command-result.json']) as { messages: Record<string, unknown>[] };
    body.messages[0]!.result = 'done';
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
    body.messages[0]!.result = 'error';
    body.messages[0]!.command_id = 'abc';
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
  });

  it('network_change guarda no máximo 5 redes', () => {
    const body = structuredClone(fixtures['pedido-network-change.json']) as { messages: Record<string, unknown>[] };
    body.messages[0]!.saved = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
  });

  it('activation exige valve open ou closed (RN-010)', () => {
    const body = structuredClone(fixtures['pedido-activation.json']) as { messages: Record<string, unknown>[] };
    body.messages[0]!.valve = 'half';
    expect(ok(body).messages[0]!.problem).toBe('invalid_field');
  });

  it('o item aceito chega normalizado, sem campos extras', () => {
    const body = base();
    body.messages[0]!.extra = 'ignorado';
    const m = ok(body).messages[0]!;
    expect(m.data).not.toHaveProperty('extra');
    expect(m.data).toMatchObject({ latitude: -7.209194, longitude: -39.306367, quality: 'gps', battery_pct: 87 });
  });
});
