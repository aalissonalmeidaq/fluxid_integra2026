import React from 'react';
import { TEXTOS, type MaterialDoProjeto } from '../landing-content';
import { useOnline } from '../use-online';
import { IconeDoMaterial } from './icone-do-material';
import { IconeExterno } from './icone-externo';

export interface MaterialCardProps {
  material: MaterialDoProjeto;
  // A pasta de documentos aparece em destaque, ocupando duas colunas.
  destaque?: boolean;
  // Os demais destinos formam uma lista compacta dentro de uma única superfície.
  secundario?: boolean;
}

// Link para um material (Spec 011, RF-006 e RF-008): os externos abrem em nova aba com proteção de origem, avisam que são externos antes
// de ativar e, sem conexão, informam que precisam dela; os vídeos levam ao player na própria página. O cartão inteiro é o link.
export function MaterialCard({ material, destaque = false, secundario = false }: MaterialCardProps): React.JSX.Element {
  const online = useOnline();
  const classes = [
    'group flex h-full text-start no-underline transition-colors duration-200 motion-reduce:transition-none',
    destaque
      ? 'flex-col gap-4 rounded-card bg-azul-profundo p-6 text-branco shadow-dialogo hover:bg-navy'
      : secundario
        ? 'items-start gap-4 p-4 text-grafite hover:bg-info-fundo'
        : 'flex-col gap-4 rounded-card border border-borda-suave bg-branco p-6 text-grafite shadow-card hover:border-azul-royal',
  ].join(' ');
  return (
    <a href={material.url} target="_blank" rel="noopener noreferrer" className={classes} data-material={material.id} data-material-secundario={secundario ? '' : undefined}>
      <IconeDoMaterial tipo={material.tipo} negativa={destaque} />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <h4 className={['m-0 font-bold leading-tight', secundario ? 'text-corpo' : 'text-h3'].join(' ')}>{material.titulo}</h4>
        <p className={['m-0 leading-relaxed', secundario ? 'text-legenda' : 'text-corpo', destaque ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>{material.descricao}</p>
        <span className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-legenda font-semibold">
          <span className="inline-flex items-center gap-2">
            {TEXTOS.materiais.externo}
            <IconeExterno />
          </span>
          {online ? null : <span className="rounded-controle bg-alerta-fundo px-2 py-1 text-alerta-texto">{TEXTOS.materiais.precisaConexao}</span>}
        </span>
      </span>
    </a>
  );
}
