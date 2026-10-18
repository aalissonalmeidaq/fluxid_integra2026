// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATUSES, COMMAND_KINDS, COMMAND_ORIGINS, COMMAND_STATUSES, HEALTH_STATES, LOCK_STATES,
  SEAL_STATES, alertKind, alertSeverity, commandOrigin, commandStatus, health, lockState, sealState,
} from './seal-vocabulary';

// Spec 012 (RF-042, data-model.md): as listas do TypeScript são exatamente as das restrições do banco, e cada valor tem texto e ícone
// (a saúde, a trava e a severidade nunca dependem só de cor).
const MIGRATIONS = path.resolve(import.meta.dirname, '../../../supabase/migrations');
const schema = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((f) => f.endsWith('_seals_schema.sql'))!), 'utf8');
const listAfter = (pattern: RegExp): string[] => [...pattern.exec(schema)![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);

describe('vocabulário igual ao do banco', () => {
  it('saúde, trava e estado do lacre', () => {
    expect(listAfter(/seal_devices_health_check check \(health in \(([^)]*)\)/)).toEqual([...HEALTH_STATES]);
    expect(listAfter(/seal_devices_lock_state_check check \(lock_state in \(([^)]*)\)/)).toEqual([...LOCK_STATES]);
    expect(listAfter(/seal_devices_seal_state_check check \(seal_state in \(([^)]*)\)/)).toEqual([...SEAL_STATES]);
  });

  it('comandos', () => {
    expect(listAfter(/seal_commands_kind_check check \(kind in \(([^)]*)\)/)).toEqual([...COMMAND_KINDS]);
    expect(listAfter(/seal_commands_origin_check check \(origin in \(([^)]*)\)/)).toEqual([...COMMAND_ORIGINS]);
    expect(listAfter(/seal_commands_status_check check \(status in \(([^)]*)\)/)).toEqual([...COMMAND_STATUSES]);
  });

  it('alertas', () => {
    expect(listAfter(/seal_alerts_kind_check check \(kind in \(([^)]*)\)\)/)).toEqual([...ALERT_KINDS]);
    expect(listAfter(/seal_alerts_severity_check check \(severity in \(([^)]*)\)/)).toEqual([...ALERT_SEVERITIES]);
    expect(listAfter(/seal_alerts_status_check check \(status in \(([^)]*)\)/)).toEqual([...ALERT_STATUSES]);
  });
});

describe('apresentação', () => {
  it('todo valor tem rótulo em português, ícone e tom', () => {
    for (const v of HEALTH_STATES) expect(health(v)).toMatchObject({ label: expect.any(String), icon: expect.any(String), tone: expect.any(String) });
    for (const v of LOCK_STATES) expect(lockState(v).label.length).toBeGreaterThan(3);
    for (const v of ALERT_KINDS) expect(alertKind(v).label.length).toBeGreaterThan(3);
    for (const v of COMMAND_STATUSES) expect(commandStatus(v).label.length).toBeGreaterThan(3);
    for (const v of COMMAND_ORIGINS) expect(commandOrigin(v).length).toBeGreaterThan(3);
    for (const v of SEAL_STATES) expect(sealState(v).label.length).toBeGreaterThan(3);
  });

  it('os rótulos pedidos pela spec', () => {
    expect(health('ok').label).toBe('Funcionando');
    expect(health('no_comm').label).toBe('Sem comunicação');
    expect(health('no_gps').label).toBe('Sem GPS');
    expect(health('off').label).toBe('Desligado');
    expect(lockState('locked').label).toBe('Travada');
    expect(lockState('unconfirmed').label).toBe('Não confirmada');
    expect(lockState('locked_violation').label).toBe('Travada por violação de geocerca');
    expect(lockState('locked_comm_loss').label).toBe('Travada por perda de comunicação');
    expect(lockState('none').label).toBe('Sem trava');
    expect(alertKind('possible_loss').label).toBe('Possível extravio');
  });

  it('a trava pendente aparece como "travamento pendente" ou "destravamento pendente" (RF-030)', () => {
    expect(lockState('unlocked', 'lock').label).toBe('Travamento pendente');
    expect(lockState('locked', 'unlock').label).toBe('Destravamento pendente');
    expect(lockState('locked', 'lock').label).toBe('Travada');
  });

  it('severidade com texto e tom distintos', () => {
    expect(alertSeverity('critical')).toMatchObject({ label: 'Crítica', tone: 'erro' });
    expect(alertSeverity('high')).toMatchObject({ label: 'Alta', tone: 'erro' });
    expect(alertSeverity('medium')).toMatchObject({ label: 'Média', tone: 'pendente' });
  });

  it('valor desconhecido é recusado, nunca presumido', () => {
    expect(() => health('dead' as never)).toThrow();
    expect(() => lockState('jammed' as never)).toThrow();
    expect(() => alertKind('bad' as never)).toThrow();
  });
});
