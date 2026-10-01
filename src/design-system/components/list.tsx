import React, { createContext, useContext } from 'react';

export type ListVariant = 'simples' | 'cartoes';

const ContextoDaLista = createContext<ListVariant>('simples');

export interface ListProps extends Omit<React.ComponentProps<'ul'>, 'ref'> {
  variant?: ListVariant;
}

// Lista semântica. O papel list é explícito para preservar a semântica mesmo com a lista sem marcadores.
export function List({ variant = 'simples', className, children, ...props }: ListProps): React.JSX.Element {
  return (
    <ContextoDaLista.Provider value={variant}>
      <ul {...props} role="list" data-variant={variant} className={['flex flex-col gap-2', className].filter(Boolean).join(' ')}>
        {children}
      </ul>
    </ContextoDaLista.Provider>
  );
}

const CLASSES_DO_ITEM: Record<ListVariant, string> = {
  simples: 'min-w-0 break-words',
  cartoes: 'min-w-0 break-words rounded-card border border-borda-suave bg-branco p-4 shadow-card',
};

export function ListItem({ className, children, ...props }: Omit<React.ComponentProps<'li'>, 'ref'>): React.JSX.Element {
  const variant = useContext(ContextoDaLista);
  return (
    <li {...props} className={[CLASSES_DO_ITEM[variant], className].filter(Boolean).join(' ')}>
      {children}
    </li>
  );
}
