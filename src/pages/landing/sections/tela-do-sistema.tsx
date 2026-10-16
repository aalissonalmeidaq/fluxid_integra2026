import React, { useState } from 'react';
import { ExampleBadge } from '@/design-system';
import { ENDERECO_OFICIAL, type TelaCapturada } from '../landing-content';

export interface TelaDoSistemaProps {
  tela: TelaCapturada;
}

// Captura real de uma tela do sistema (Spec 011, RF-013; mockup de 16/10/2026): imagem local em WebP dentro da moldura do aparelho, um
// notebook (tela com barra do navegador e base) ou um celular (moldura com barra de status). A moldura é decorativa; a imagem é descrita em texto,
// tem dimensões fixas (não desloca o layout) e o selo "Exemplo" fica na barra do navegador ou na barra de status, fora do conteúdo. Se a
// imagem falhar, a descrição entra no lugar.
export function TelaDoSistema({ tela }: TelaDoSistemaProps): React.JSX.Element {
  const [falhou, setFalhou] = useState(false);
  const celular = tela.dispositivo === 'celular';
  const imagem = falhou ? (
    <p className="m-0 bg-branco p-4 text-corpo text-grafite">{tela.alt}</p>
  ) : (
    <img
      src={tela.arquivo}
      alt={tela.alt}
      width={tela.largura}
      height={tela.altura}
      loading="lazy"
      decoding="async"
      onError={() => setFalhou(true)}
      className="block h-auto w-full"
    />
  );
  return (
    <figure data-tela={tela.id} data-dispositivo={tela.dispositivo} data-revelar className={['m-0 flex flex-col gap-4', celular ? 'landing-tela-celular' : 'landing-tela-computador'].join(' ')}>
      {celular ? (
        <div data-moldura="celular" className="landing-moldura-celular relative">
          <div className="landing-moldura-visor overflow-hidden bg-branco">
            {/* Barra de status do aparelho: o selo "Exemplo" no canto, fora do conteúdo da tela. */}
            <div className="landing-moldura-status flex items-center justify-end px-4">
              <ExampleBadge />
            </div>
            {imagem}
          </div>
        </div>
      ) : (
        <div data-moldura="notebook" className="landing-moldura-notebook">
          <div className="landing-moldura-tampa">
            <div className="flex items-center gap-4 rounded-t-controle bg-cinza-gelo px-4 py-2">
              <span className="flex shrink-0 gap-1" aria-hidden="true">
                <span className="size-2 rounded-full bg-erro" />
                <span className="size-2 rounded-full bg-alerta-faixa" />
                <span className="size-2 rounded-full bg-verde-vivo" />
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-branco px-4 py-1 text-legenda text-texto-secundario" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="truncate">{ENDERECO_OFICIAL}/viagens</span>
              </span>
              <span className="shrink-0"><ExampleBadge /></span>
            </div>
            <div className="overflow-hidden bg-branco">{imagem}</div>
          </div>
          <span aria-hidden="true" className="landing-moldura-base" />
        </div>
      )}
      {/* A legenda visível fica no palco, numa linha só para os dois aparelhos (funcionalidades.tsx); aqui ela nomeia a figura. */}
      <figcaption className="sr-only">{tela.titulo}</figcaption>
    </figure>
  );
}
