import type { OverviewBlockId, OverviewContentMap } from '@/domain/overview/overview-types';

// Porta da fonte de dados da Visão geral: única origem de números e textos. Devolve o conteúdo do bloco ou rejeita (RF-017).
export interface OverviewSource {
  load<K extends OverviewBlockId>(blockId: K): Promise<OverviewContentMap[K]>;
}
