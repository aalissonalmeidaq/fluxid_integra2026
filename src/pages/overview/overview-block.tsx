import React, { useId } from 'react';
import { Alert, Button, Loading } from '@/design-system';
import { ExampleBadge } from '@/design-system/components/example-badge';
import type { OverviewBlockId, OverviewBlockState } from '@/domain/overview/overview-types';

export interface OverviewBlockProps {
  id: OverviewBlockId;
  title: string;
  state: OverviewBlockState;
  onRetry: () => void;
  // Altura mínima reservada para a estrutura não saltar quando o conteúdo chega.
  className?: string;
  // Falso quando o bloco mostra dados reais: some a marca "Exemplo" (padrão: verdadeiro).
  example?: boolean;
  // Sem moldura: o conteúdo já tem caixas próprias. O título e a marca "Exemplo" seguem na página para leitores de tela.
  bare?: boolean;
  children?: React.ReactNode;
}

// Moldura única dos blocos da Visão geral: região com o título (h3) como nome, a marca "Exemplo" e os quatro estados.
// Há no máximo um role="status" por bloco, anunciado uma vez, e o foco nunca se move (RF-016, RF-028, RA-002, RA-004).
export function OverviewBlock({ id, title, state, onRetry, className, example = true, bare = false, children }: OverviewBlockProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-block={id}
      className={['flex min-h-16 w-full min-w-0 flex-col gap-4', bare ? '' : 'rounded-card border border-borda-suave bg-branco p-6', className].filter(Boolean).join(' ')}
    >
      <div className={bare ? 'sr-only' : 'flex flex-wrap items-start justify-between gap-2'}>
        <h3 id={titleId} className="min-w-0 break-words text-h3 font-semibold text-navy">{title}</h3>
        {example && <ExampleBadge />}
      </div>
      {state.status === 'loading' && <Loading label={`Carregando ${title.toLowerCase()}…`} />}
      {state.status === 'empty' && <p className="text-corpo text-grafite">{example ? 'Nenhum item de exemplo para mostrar neste bloco.' : 'Nenhum item para mostrar neste bloco.'}</p>}
      {state.status === 'error' && (
        <Alert variant="erro">
          <p>Não foi possível carregar este bloco.</p>
          <Button variant="secundario" className="mt-2" onClick={onRetry}>Tentar de novo</Button>
        </Alert>
      )}
      {state.status === 'ready' && children}
    </section>
  );
}
