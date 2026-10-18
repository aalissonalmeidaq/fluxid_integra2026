// Simulador do lacre (Spec 012, research.md item 18): fala exatamente o contrato de tests/fixtures/seal-protocol e se comporta
// como o firmware (fila local, lotes de até 50, reenvio com o mesmo identificador, comando lido da resposta e confirmado no envio
// seguinte, vigilância guardada). Usado pelas suítes `.live`, pelo E2E e por scripts/lacre/simulador.mjs. Só valores fictícios.

export interface Position {
  latitude: number;
  longitude: number;
  quality?: 'gps' | 'last_known';
  accuracy_m?: number | null;
  battery_pct?: number;
  signal_dbm?: number;
  seal_state?: 'closed' | 'open' | 'broken' | 'unknown';
  wifi?: { ssid: string; kind: 'default' | 'list'; rssi: number };
}
export interface Command { id: string; kind: string; issued_at: string; ssid?: string; open?: boolean; password?: string }
export interface Watch { active: boolean; version: number; fences?: unknown[] }
export type CommandOutcome = { result: 'executed' | 'error'; reason?: string };

export interface SimulatorOptions {
  url: string;
  deviceCode: string;
  key: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  firmwareVersion?: string;
  // Decide o resultado de cada comando recebido; o padrão executa tudo.
  onCommand?: (command: Command) => CommandOutcome;
}

type Message = Record<string, unknown> & { message_id: string; type: string; read_at: string };

let counter = 0;
const newId = (): string => {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 64);
};

export class SealSimulator {
  readonly queue: Message[] = [];
  valve: 'open' | 'closed' = 'open';
  watch: Watch = { active: false, version: 0 };
  reportIntervalS = 60;
  readonly commands: Command[] = [];
  // Nomes das redes que o lacre guardou (a senha nunca fica aqui).
  readonly wifiSaved: string[] = [];
  private readonly confirmed = new Set<string>();
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => Date;
  private readonly options: SimulatorOptions;

  // Sem propriedade no parâmetro do construtor: o Node executa este arquivo direto (scripts/lacre/simulador.mjs), só removendo os tipos.
  constructor(options: SimulatorOptions) {
    this.options = options;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
  }

  get pending(): number { return this.queue.length; }

  private push(type: string, fields: Record<string, unknown>, readAt?: string): string {
    const message: Message = { message_id: newId(), type, read_at: readAt ?? this.now().toISOString(), ...fields };
    this.queue.push(message);
    return message.message_id;
  }

  private positionFields(p: Position): Record<string, unknown> {
    const fields: Record<string, unknown> = {
      latitude: p.latitude, longitude: p.longitude, quality: p.quality ?? 'gps', accuracy_m: p.accuracy_m ?? (p.quality === 'last_known' ? null : 5),
      battery_pct: p.battery_pct ?? 87, signal_dbm: p.signal_dbm ?? -61, seal_state: p.seal_state ?? 'closed',
    };
    if (p.wifi) fields.wifi = p.wifi;
    return fields;
  }

  position(p: Position, readAt?: string): string { return this.push('position', this.positionFields(p), readAt); }
  activation(p: Position, readAt?: string): string { return this.push('activation', { ...this.positionFields(p), valve: this.valve }, readAt); }
  shutdown(p: Position, readAt?: string): string { return this.push('shutdown', this.positionFields(p), readAt); }
  event(code: string, detail?: string): string { return this.push('event', { code, detail: detail ?? null }); }
  alert(code: string, value?: number): string { return this.push('alert', { code, value: value ?? null }); }
  networkChange(wifi: Position['wifi'], saved: string[]): string { return this.push('network_change', { wifi, saved }); }
  autoLock(p: Position, lockedAt: string): string {
    this.valve = 'closed';
    return this.push('auto_lock', { ...this.positionFields(p), locked_at: lockedAt });
  }
  commandResult(commandId: string, outcome: CommandOutcome): string {
    return this.push('command_result', { command_id: commandId, result: outcome.result, reason: outcome.reason ?? null });
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-Device-Id': this.options.deviceCode, 'X-Device-Key': this.options.key, ...extra };
  }

  async sendRaw(body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await this.fetchImpl(`${this.options.url}/functions/v1/seal-gateway`, {
      method: 'POST', headers: this.headers(headers), body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  }

  // Um envio: até 50 mensagens da fila. Sem resposta 200, tudo continua na fila (reenvio com os mesmos identificadores).
  async send(): Promise<{ status: number; body: Record<string, unknown> }> {
    const batch = this.queue.slice(0, 50);
    const body = { protocol: 1, firmware_version: this.options.firmwareVersion ?? 'sim-1.0.0', watch_version: this.watch.version, messages: batch };
    const response = await this.sendRaw(body);
    if (response.status !== 200) return response;
    const results = (response.body.results ?? []) as { message_id: string; status: string }[];
    // Gravada, repetida ou recusada: o FluxID já decidiu sobre ela, então sai da fila (recusada não adianta reenviar).
    const done = new Set(results.map((r) => r.message_id));
    for (let i = this.queue.length - 1; i >= 0; i -= 1) if (done.has(this.queue[i]!.message_id)) this.queue.splice(i, 1);
    if (typeof response.body.report_interval_s === 'number') this.reportIntervalS = response.body.report_interval_s;
    const watch = response.body.watch as Watch | undefined;
    if (watch) {
      if (!watch.active) this.watch = { active: false, version: watch.version };
      else if (watch.fences) this.watch = { active: true, version: watch.version, fences: watch.fences };
      else this.watch = { ...this.watch, active: true };
    }
    const command = response.body.command as Command | null | undefined;
    if (command && !this.confirmed.has(command.id)) this.execute(command);
    return response;
  }

  private execute(command: Command): void {
    this.commands.push(command);
    this.confirmed.add(command.id);
    const outcome = this.options.onCommand?.(command) ?? { result: 'executed' as const };
    if (outcome.result === 'executed') {
      if (command.kind === 'lock') this.valve = 'closed';
      if (command.kind === 'unlock') this.valve = 'open';
      if (command.kind === 'wifi_add' && command.ssid && !this.wifiSaved.includes(command.ssid)) this.wifiSaved.push(command.ssid);
      if (command.kind === 'wifi_remove' && command.ssid) this.wifiSaved.splice(0, this.wifiSaved.length, ...this.wifiSaved.filter((s) => s !== command.ssid));
      if (command.kind === 'wifi_reset') this.wifiSaved.splice(0, this.wifiSaved.length);
    }
    this.commandResult(command.id, outcome);
  }
}
