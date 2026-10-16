import React from 'react';
import { StatusBadge } from '@/design-system';
import { PREVIAS } from '../landing-content';
import { PreviaBase } from './previa-base';

// Prévia ilustrada da fila de envio sem sinal (Spec 010): cada operação mostra o estado em texto, não só em cor.
export function PreviaDeFila({ compacto = false }: { compacto?: boolean } = {}): React.JSX.Element {
  const { titulo, descricao, itens } = PREVIAS.fila;
  return (
    <PreviaBase titulo={titulo} descricao={descricao} compacto={compacto}>
      {itens.map((item) => (
        <div key={item.texto} className={['flex items-center justify-between gap-2 border-b border-borda-suave last:border-b-0', compacto ? 'py-1' : 'py-2'].join(' ')}>
          <span className="text-legenda font-semibold">{item.texto}</span>
          <StatusBadge variant={item.estado === 'Enviado' ? 'ativo' : 'pendente'}>{item.estado}</StatusBadge>
        </div>
      ))}
    </PreviaBase>
  );
}
