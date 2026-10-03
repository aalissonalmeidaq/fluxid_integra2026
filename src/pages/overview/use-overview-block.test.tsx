import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OverviewSource } from '@/application/overview/overview-source';
import { OverviewSourceProvider } from '@/app/overview/overview-source-context';
import { useOverviewBlock } from './use-overview-block';

// RF-028, história 4, CA-006: estado por bloco, independente dos demais, com nova tentativa e sem corrida.
function fonte(load: (id: string) => Promise<unknown>): OverviewSource {
  return { load } as unknown as OverviewSource;
}

function envolver(source: OverviewSource) {
  return ({ children }: { children: React.ReactNode }) => <OverviewSourceProvider source={source}>{children}</OverviewSourceProvider>;
}

const ALERTAS = { items: [{ id: 'a', text: 't', type: 'x', when: 'agora' }] };

describe('useOverviewBlock', () => {
  it('fica em loading enquanto pendente e vai a ready com os dados', async () => {
    let resolver: (valor: unknown) => void = () => undefined;
    const source = fonte(() => new Promise((resolve) => { resolver = resolve; }));
    const { result } = renderHook(() => useOverviewBlock('alertas'), { wrapper: envolver(source) });
    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => { resolver(ALERTAS); });
    expect(result.current.state.status).toBe('ready');
  });

  it('vai a empty quando não há itens', async () => {
    const source = fonte(async () => ({ items: [] }));
    const { result } = renderHook(() => useOverviewBlock('alertas'), { wrapper: envolver(source) });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'empty' }));
  });

  it('vai a error na rejeição e retry volta a loading e resolve', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce(ALERTAS);
    const { result } = renderHook(() => useOverviewBlock('alertas'), { wrapper: envolver(fonte(load)) });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
    act(() => result.current.retry());
    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a falha de um bloco não altera os demais', async () => {
    const source = fonte(async (id) => {
      if (id === 'alertas') throw new Error('falha');
      return { items: [{ id: 'a', gas: 'g', status: 's' }] };
    });
    const { result } = renderHook(() => ({ a: useOverviewBlock('alertas'), c: useOverviewBlock('cilindros') }), { wrapper: envolver(source) });
    await waitFor(() => expect(result.current.a.state.status).toBe('error'));
    await waitFor(() => expect(result.current.c.state.status).toBe('ready'));
  });

  it('descarta a resposta de uma tentativa antiga', async () => {
    const resolvers: ((valor: unknown) => void)[] = [];
    const source = fonte(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const { result } = renderHook(() => useOverviewBlock('alertas'), { wrapper: envolver(source) });
    act(() => result.current.retry());
    await act(async () => { resolvers[1]?.({ items: [{ id: 'nova', text: 't', type: 'x', when: 'agora' }] }); });
    await act(async () => { resolvers[0]?.({ items: [{ id: 'antiga', text: 't', type: 'x', when: 'agora' }] }); });
    const state = result.current.state;
    expect(state.status === 'ready' && JSON.stringify(state.data)).toContain('nova');
  });

  it('desmonta sem aviso de estado', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let resolver: (valor: unknown) => void = () => undefined;
    const source = fonte(() => new Promise((resolve) => { resolver = resolve; }));
    const { unmount } = renderHook(() => useOverviewBlock('alertas'), { wrapper: envolver(source) });
    unmount();
    await act(async () => { resolver({ items: [] }); });
    expect(erro).not.toHaveBeenCalled();
    erro.mockRestore();
  });
});
