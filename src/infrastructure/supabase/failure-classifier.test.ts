import { describe, it, expect } from 'vitest';
import {
  classifyProbeFailure,
  classifyOperationalError,
  isFallbackAllowed,
  OperationalErrorMetadata,
} from './failure-classifier';

describe('Classificador de Falhas (Failure Classifier - História 3)', () => {
  describe('Falhas de Probe', () => {
    it('classifica timeout, rede e 5xx como elegíveis a fallback', () => {
      expect(classifyProbeFailure({ timeout: true })).toBe('timeout');
      expect(isFallbackAllowed('timeout')).toBe(true);

      expect(classifyProbeFailure({ networkError: true })).toBe('network');
      expect(isFallbackAllowed('network')).toBe(true);

      expect(classifyProbeFailure({ statusCode: 500 })).toBe('service_unavailable');
      expect(classifyProbeFailure({ statusCode: 503 })).toBe('service_unavailable');
      expect(isFallbackAllowed('service_unavailable')).toBe(true);
    });

    it('classifica 4xx do probe como configuração e bloqueante (sem fallback)', () => {
      expect(classifyProbeFailure({ statusCode: 400 })).toBe('configuration');
      expect(classifyProbeFailure({ statusCode: 404 })).toBe('configuration');
      expect(isFallbackAllowed('configuration')).toBe(false);
    });
  });

  describe('Erros Operacionais pós-seleção', () => {
    it('classifica autenticação (401) como bloqueante', () => {
      const meta: OperationalErrorMetadata = { statusCode: 401, code: 'PGRST301' };
      const failure = classifyOperationalError(meta);
      expect(failure).toBe('authentication');
      expect(isFallbackAllowed(failure)).toBe(false);
    });

    it('classifica autorização (403 / 42501) como bloqueante', () => {
      const meta: OperationalErrorMetadata = { statusCode: 403, code: '42501' };
      const failure = classifyOperationalError(meta);
      expect(failure).toBe('authorization');
      expect(isFallbackAllowed(failure)).toBe(false);
    });

    it('classifica isolamento / RLS como bloqueante', () => {
      const meta: OperationalErrorMetadata = { code: 'PGRST116' };
      const failure = classifyOperationalError(meta);
      expect(failure).toBe('isolation');
      expect(isFallbackAllowed(failure)).toBe(false);
    });

    it('classifica validação (422) como bloqueante', () => {
      const meta: OperationalErrorMetadata = { statusCode: 422, code: '23502' };
      const failure = classifyOperationalError(meta);
      expect(failure).toBe('validation');
      expect(isFallbackAllowed(failure)).toBe(false);
    });

    it('classifica erro desconhecido como unknown e bloqueante', () => {
      const meta: OperationalErrorMetadata = { statusCode: 418 };
      const failure = classifyOperationalError(meta);
      expect(failure).toBe('unknown');
      expect(isFallbackAllowed(failure)).toBe(false);
    });
  });
});
