import React from 'react';
import { TEXTOS, type MaterialDoProjeto } from '../landing-content';
import { useOnline } from '../use-online';
import { IconeDoMaterial } from './icone-do-material';
import { IconeExterno } from './icone-externo';

export interface MaterialCardProps {
  material: MaterialDoProjeto;
  // A pasta de documentos aparece em destaque, ocupando duas colunas.
  destaque?: boolean;
}

// Link para um material (Spec 011, RF-006 e RF-008): os externos abrem em nova aba com proteção de origem, avisam que são externos antes
// de ativar e, sem conexão, informam que precisam dela; os vídeos levam ao player na própria página. O cartão inteiro é o link.
export function MaterialCard({ material, destaque = false }: MaterialCardProps): React.JSX.Element {
  const online = useOnline();
  const classes = [
    'group flex h-full flex-col gap-4 rounded-card border p-6 desktop:gap-2 text-start no-underline shadow-card transition-all duration-200 hover:shadow-dialogo motion-reduce:transition-none',
    destaque
      ? 'border-azul-profundo bg-azul-profundo text-branco hover:bg-navy'
      : 'border-borda-suave bg-branco text-grafite hover:border-azul-royal',
  ].join(' ');
  return (
    <a href={material.url} target="_blank" rel="noopener noreferrer" className={classes} data-material={material.id}>
      <IconeDoMaterial tipo={material.tipo} negativa={destaque} />
      <h4 className="m-0 text-h3 font-bold leading-tight">{material.titulo}</h4>
      <p className={['m-0 text-corpo leading-relaxed', destaque ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>{material.descricao}</p>
      <span className="mt-auto flex flex-wrap items-center gap-2 text-legenda font-semibold">
        <span className="inline-flex items-center gap-2">
          {TEXTOS.materiais.externo}
          <IconeExterno />
        </span>
        {online ? null : <span className="rounded-controle bg-alerta-fundo px-2 py-1 text-alerta-texto">{TEXTOS.materiais.precisaConexao}</span>}
      </span>
    </a>
  );
}
