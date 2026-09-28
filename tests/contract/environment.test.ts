import { describe, it, expect } from 'vitest';
import { validateEnvironment } from '@/config/environment';
import { createValidEnv, createIncompleteEnv } from '@/test/fixtures/environment';

describe('Contrato de Ambiente (Environment Contract)', () => {
  it('valida com sucesso o modo auto com endpoints configurados', () => {
    const env = createValidEnv('auto');
    const result = validateEnvironment(env);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.config.connectionMode).toBe('auto');
      expect(result.config.probeTimeoutMs).toBe(2000);
      expect(result.config.endpoints.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('valida modos explícitos (local, lan, cloud)', () => {
    for (const mode of ['local', 'lan', 'cloud'] as const) {
      const env = createValidEnv(mode);
      const result = validateEnvironment(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.config.connectionMode).toBe(mode);
        expect(result.config.endpoints).toHaveLength(1);
        expect(result.config.endpoints[0]?.kind).toBe(mode);
      }
    }
  });

  it('rejeita modo de conexão inválido', () => {
    const env = { ...createValidEnv('auto'), VITE_SUPABASE_CONNECTION_MODE: 'invalid_mode' };
    const result = validateEnvironment(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.variable === 'VITE_SUPABASE_CONNECTION_MODE')).toBe(true);
    }
  });

  it('rejeita modo explícito com par URL/chave incompleto', () => {
    for (const mode of ['local', 'lan', 'cloud'] as const) {
      const env = createIncompleteEnv(mode);
      const result = validateEnvironment(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
        // Garante que nenhum valor de chave é exposto na mensagem
        for (const err of result.errors) {
          expect(err.message).not.toContain('mock_local_key');
          expect(err.message).not.toContain('mock_lan_key');
          expect(err.message).not.toContain('mock_cloud_key');
        }
      }
    }
  });

  it('rejeita modo auto sem nenhum endpoint completo', () => {
    const env = {
      VITE_SUPABASE_CONNECTION_MODE: 'auto',
      VITE_SUPABASE_PROBE_TIMEOUT_MS: '2000',
    };
    const result = validateEnvironment(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.variable === 'VITE_SUPABASE_CONNECTION_MODE')).toBe(true);
    }
  });

  it('rejeita modo auto com par parcial (URL presente mas chave ausente)', () => {
    const env = {
      VITE_SUPABASE_CONNECTION_MODE: 'auto',
      VITE_SUPABASE_LOCAL_URL: 'http://127.0.0.1:54321',
      // Chave local omitida
    };
    const result = validateEnvironment(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.variable === 'VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY')).toBe(true);
    }
  });

  it('valida timeout entre 250 e 10000 ms e usa padrão 2000 quando omitido', () => {
    const envWithoutTimeout = createValidEnv('local');
    delete envWithoutTimeout.VITE_SUPABASE_PROBE_TIMEOUT_MS;
    const resDefault = validateEnvironment(envWithoutTimeout);
    expect(resDefault.success).toBe(true);
    if (resDefault.success) {
      expect(resDefault.config.probeTimeoutMs).toBe(2000);
    }

    const envLow = { ...createValidEnv('local'), VITE_SUPABASE_PROBE_TIMEOUT_MS: '200' };
    const resLow = validateEnvironment(envLow);
    expect(resLow.success).toBe(false);

    const envHigh = { ...createValidEnv('local'), VITE_SUPABASE_PROBE_TIMEOUT_MS: '15000' };
    const resHigh = validateEnvironment(envHigh);
    expect(resHigh.success).toBe(false);

    const envValid = { ...createValidEnv('local'), VITE_SUPABASE_PROBE_TIMEOUT_MS: '5000' };
    const resValid = validateEnvironment(envValid);
    expect(resValid.success).toBe(true);
    if (resValid.success) {
      expect(resValid.config.probeTimeoutMs).toBe(5000);
    }
  });
});
