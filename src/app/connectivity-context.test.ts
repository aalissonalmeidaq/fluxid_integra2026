import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConnectivity } from './connectivity-context';

describe('connectivity-context', () => {
  it('fornece valores e funções padrão quando fora de um provider customizado', async () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.result.state).toBe('idle');
    expect(result.current.client).toBeNull();
    expect(result.current.config).toBeNull();

    // Invoca funções padrão para garantir que são funções válidas e no-op
    await expect(result.current.reconnect()).resolves.toBeUndefined();
    expect(() => result.current.reportOperationalError({ statusCode: 500 })).not.toThrow();
  });
});
