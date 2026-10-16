import React from 'react';
import { ROTULO_DA_SITUACAO, type SituacaoNaSolucao } from '../landing-content';

const CORES: Record<SituacaoNaSolucao, string> = {
  plataforma: 'border-sucesso-fundo bg-sucesso-fundo text-verde-acessivel',
  piloto: 'border-alerta-faixa/30 bg-alerta-fundo text-alerta-texto',
};

// Diz onde cada parte da solução está hoje (Spec 011, adaptação ao pitch): já na plataforma ou em validação no piloto. O texto carrega o
// significado; a cor e o ponto só reforçam.
export function SeloSituacao({ situacao }: { situacao: SituacaoNaSolucao }): React.JSX.Element {
  return (
    <span
      data-situacao={situacao}
      className={[
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-legenda font-semibold shadow-card',
        CORES[situacao],
      ].join(' ')}
    >
      <span
        className={[
          'inline-block size-2 rounded-full',
          situacao === 'plataforma' ? 'bg-verde-escuro' : 'bg-alerta-faixa',
        ].join(' ')}
        aria-hidden="true"
      />
      {ROTULO_DA_SITUACAO[situacao]}
    </span>
  );
}
