import { useCallback, useEffect, useState } from 'react';
import { useOverviewSource } from '@/app/overview/overview-source-context';
import { isEmptyContent, type OverviewBlockId, type OverviewBlockState, type OverviewContentMap } from '@/domain/overview/overview-types';

export interface UseOverviewBlock<K extends OverviewBlockId> {
  state: OverviewBlockState<OverviewContentMap[K]>;
  retry: () => void;
}

// Estado independente de um bloco: loading, ready, empty ou error. Respostas de tentativas antigas ou de blocos
// desmontados são descartadas (RF-028, história 4).
export function useOverviewBlock<K extends OverviewBlockId>(blockId: K): UseOverviewBlock<K> {
  const source = useOverviewSource();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; state: OverviewBlockState<OverviewContentMap[K]> } | null>(null);

  useEffect(() => {
    let current = true;
    source.load(blockId).then(
      (content) => {
        if (current) setResult({ attempt, state: isEmptyContent(blockId, content) ? { status: 'empty' } : { status: 'ready', data: content } });
      },
      () => {
        if (current) setResult({ attempt, state: { status: 'error' } });
      },
    );
    return () => { current = false; };
  }, [source, blockId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  // Enquanto a resposta da tentativa atual não chega, o estado é loading (inclusive logo após `retry`).
  const state: OverviewBlockState<OverviewContentMap[K]> = result && result.attempt === attempt ? result.state : { status: 'loading' };
  return { state, retry };
}
