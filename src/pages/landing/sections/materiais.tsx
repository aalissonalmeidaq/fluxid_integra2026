import React from 'react';
import { MATERIAIS, TEXTOS, type MaterialDoProjeto } from '../landing-content';
import { MaterialCard } from './material-card';
import { Secao } from './secao';

// Materiais do projeto (Spec 011, RF-006 e RF-008; reorganizada nas críticas de 14/10/2026): os destinos externos em dois blocos (comece por
// aqui, código e evidências), em vez de oito cartões iguais. Os três vídeos tocam nas seções que eles comprovam (pitch, trava e o que já
// funciona), então não se repetem aqui; o canal do YouTube reúne todos. Os links abrem em nova aba.
export function Materiais(): React.JSX.Element {
  const porId = (id: string): MaterialDoProjeto => MATERIAIS.find((material) => material.id === id)!;
  return (
    <Secao id="materiais" titulo={TEXTOS.materiais.titulo} introducao={TEXTOS.materiais.introducao} fundo="gelo">
      <div className="flex flex-col gap-8 desktop:gap-6">
        {TEXTOS.materiais.blocos.map((bloco) => (
          <section key={bloco.id} aria-labelledby={`landing-materiais-${bloco.id}`} className="flex flex-col gap-4" data-revelar>
            <h3 id={`landing-materiais-${bloco.id}`} className="m-0 text-h3 font-bold leading-tight">{bloco.titulo}</h3>
            <div className={['grid gap-4', bloco.id === 'comecar' ? '' : 'tablet:grid-cols-2 desktop:grid-cols-4'].join(' ')}>
              {bloco.materiais.map((id) => <MaterialCard key={id} material={porId(id)} destaque={id === 'documentos'} />)}
            </div>
          </section>
        ))}
      </div>
    </Secao>
  );
}
