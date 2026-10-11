import React, { useCallback, useEffect, useState } from 'react';
import type { Page } from '@/application/registry/registry-views';
import { Alert, Button, Card, DataTable, ErrorState, type ColunaDaTabela } from '@/design-system';

// Resultado de uma página: o das consultas dos cadastros e o das viagens têm a mesma forma (sucesso com a página ou uma falha identificada por kind).
export type ListOutcome<T> = { kind: 'success'; value: Page<T> } | { kind: string };

export interface RegistryListProps<T, Q> {
  // Filtros e busca atuais: quando a identidade muda, a lista recarrega desde a primeira página.
  query: Q;
  fetchPage: (query: Q, cursor: string | null) => Promise<ListOutcome<T>>;
  columns: readonly ColunaDaTabela<T>[];
  getKey: (item: T) => string;
  legend: string;
  // Plural e singular do que a lista conta, para o total anunciado em região de status ("3 clientes encontrados").
  nouns: { one: string; many: string };
  // Rótulo do botão de próxima página, por exemplo "Mostrar mais clientes".
  moreLabel: string;
  // Texto do estado vazio e se algum filtro está ativo (muda a orientação).
  empty: { title: string; filtered: string; unfiltered: string; filtersActive: boolean };
  // Ação de cadastro oferecida só a quem tem permissão.
  create?: { href: string; label: string } | undefined;
  subject: string;
}

type Phase = 'loading' | 'ready' | 'error';
type Failure = { kind: 'access_denied' | 'offline' | 'unavailable'; message: string };

const failureOf = (outcome: { kind: string }, subject: string): Failure => {
  if (outcome.kind === 'access_denied' || outcome.kind === 'mfa_required') return { kind: 'access_denied', message: `Você não tem permissão para ver ${subject}.` };
  if (outcome.kind === 'offline') return { kind: 'offline', message: `Sem conexão. A consulta de ${subject} exige conexão.` };
  return { kind: 'unavailable', message: `Não foi possível carregar ${subject} agora.` };
};

const isSuccess = <T,>(outcome: ListOutcome<T>): outcome is { kind: 'success'; value: Page<T> } => outcome.kind === 'success';

const linkClass = 'inline-flex min-h-alvo items-center justify-center rounded-controle border border-azul-profundo bg-azul-profundo px-4 text-corpo font-semibold text-branco hover:bg-navy';

// Lista paginada dos cadastros: tabela a partir de 768 px e cartões abaixo (DataTable), total anunciado em região de status,
// "mostrar mais" mantendo a busca e os filtros, e os estados de carregamento, vazio, erro e offline (RF-040, RF-044).
export function RegistryList<T, Q>({ query, fetchPage, columns, getKey, legend, nouns, moreLabel, empty, create, subject }: RegistryListProps<T, Q>): React.JSX.Element {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [seen, setSeen] = useState<{ query: Q; tick: number } | null>(null);

  const applyPage = useCallback((page: Page<T>, append: boolean): void => {
    setItems((current) => (append ? [...current, ...page.items] : page.items));
    setTotal(page.total);
    setNext(page.next);
    setFailure(null);
    setPhase('ready');
  }, []);

  // Mudança de filtro ou nova tentativa: o estado "carregando" é marcado no próprio render, antes da resposta.
  if (seen === null || seen.query !== query || seen.tick !== reloadTick) {
    setSeen({ query, tick: reloadTick });
    setPhase('loading');
    setItems([]);
  }

  useEffect(() => {
    let active = true;
    void fetchPage(query, null).then((outcome) => {
      if (!active) return;
      if (isSuccess(outcome)) applyPage(outcome.value, false);
      else { setFailure(failureOf(outcome, subject)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [fetchPage, query, reloadTick, applyPage, subject]);

  const loadMore = async (): Promise<void> => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    const outcome = await fetchPage(query, next);
    setLoadingMore(false);
    if (isSuccess(outcome)) applyPage(outcome.value, true);
    else setFailure(failureOf(outcome, subject));
  };

  const showEmpty = phase === 'ready' && items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {phase === 'ready' && <p role="status" className="text-corpo font-semibold text-grafite">{`${total} ${total === 1 ? nouns.one : nouns.many}`}</p>}

      {failure && phase === 'error' && (
        failure.kind === 'unavailable'
          ? <ErrorState title={`Não foi possível carregar ${subject}`} message="Tente novamente em instantes." onRetry={() => setReloadTick((tick) => tick + 1)} />
          : <ErrorState variant="sem-permissao" title={failure.kind === 'offline' ? 'Sem conexão' : 'Acesso negado'} message={failure.message} />
      )}
      {failure && phase === 'ready' && <Alert variant="erro">{failure.message}</Alert>}

      {phase !== 'error' && (
        showEmpty ? (
          <Card>
            <div className="flex flex-col items-start gap-4">
              <h3 className="text-h3 font-semibold text-navy">{empty.title}</h3>
              <p className="text-corpo">{empty.filtersActive ? empty.filtered : empty.unfiltered}</p>
              {create && <a className={linkClass} href={create.href}>{create.label}</a>}
            </div>
          </Card>
        ) : (
          <DataTable legenda={legend} colunas={columns} linhas={items} chaveDaLinha={getKey} carregando={phase === 'loading'} textoDeCarregamento={`Carregando ${subject}…`} />
        )
      )}

      {phase === 'ready' && next !== null && (
        <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>{moreLabel}</Button>
      )}
    </div>
  );
}

export { linkClass as primaryLinkClass };
