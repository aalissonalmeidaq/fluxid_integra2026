import React from 'react';
import { List, ListItem } from '@/design-system';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Lista curta de cilindros de exemplo, com identificadores fictícios e sem "Ver todos" (RF-014).
export function CylindersBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('cilindros');
  return (
    <OverviewBlock id="cilindros" title="Cilindros recentes" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <List>
          {state.data.items.map((item) => (
            <ListItem key={item.id} className="flex flex-col border-b border-borda-suave pb-2">
              <span className="break-words text-corpo font-semibold text-navy">{item.id}</span>
              <span className="break-words text-legenda text-texto-secundario">{item.gas} · {item.status}</span>
            </ListItem>
          ))}
        </List>
      )}
    </OverviewBlock>
  );
}
