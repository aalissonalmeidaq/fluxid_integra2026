import { describe, it, expect } from 'vitest';
import {
  isValidStateTransition,
  transitionState,
  ConnectionState,
} from './connection-state';

describe('Máquina de Estados de Conectividade (Connection State Machine)', () => {
  it('permite transição de idle para probing', () => {
    expect(isValidStateTransition('idle', 'probing')).toBe(true);
    expect(transitionState('idle', 'probing')).toBe('probing');
  });

  it('permite transições a partir de probing para connected, degraded, blocked e offline', () => {
    expect(isValidStateTransition('probing', 'connected')).toBe(true);
    expect(isValidStateTransition('probing', 'degraded')).toBe(true);
    expect(isValidStateTransition('probing', 'blocked')).toBe(true);
    expect(isValidStateTransition('probing', 'offline')).toBe(true);
    expect(isValidStateTransition('probing', 'probing')).toBe(true);
  });

  it('bloqueia transições inválidas a partir de idle', () => {
    const invalidFromIdle: ConnectionState[] = ['connected', 'degraded', 'blocked', 'offline'];
    for (const target of invalidFromIdle) {
      expect(isValidStateTransition('idle', target)).toBe(false);
      expect(() => transitionState('idle', target)).toThrow();
    }
  });

  it('permite transição de connected e degraded para blocked diante de erro operacional', () => {
    expect(isValidStateTransition('connected', 'blocked')).toBe(true);
    expect(transitionState('connected', 'blocked')).toBe('blocked');

    expect(isValidStateTransition('degraded', 'blocked')).toBe(true);
    expect(transitionState('degraded', 'blocked')).toBe('blocked');
  });

  it('impede troca automática de endpoint (de connected para degraded/offline sem nova sondagem)', () => {
    expect(isValidStateTransition('connected', 'degraded')).toBe(false);
    expect(isValidStateTransition('connected', 'offline')).toBe(false);
    expect(isValidStateTransition('degraded', 'connected')).toBe(false);
  });

  it('permite reinício explícito para probing a partir de connected, degraded, blocked e offline', () => {
    expect(isValidStateTransition('connected', 'probing')).toBe(true);
    expect(isValidStateTransition('degraded', 'probing')).toBe(true);
    expect(isValidStateTransition('blocked', 'probing')).toBe(true);
    expect(isValidStateTransition('offline', 'probing')).toBe(true);
  });
});
