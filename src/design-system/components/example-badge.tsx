import React from 'react';
import { StatusBadge } from './status-badge';

// Marca de dado de exemplo: sempre o texto "Exemplo", para a informação nunca depender só de cor ou ícone (RF-016, RA-002).
export function ExampleBadge(): React.JSX.Element {
  return <StatusBadge variant="pendente">Exemplo</StatusBadge>;
}
