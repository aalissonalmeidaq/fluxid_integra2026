import React, { useEffect, useRef, useState } from 'react';
import { Icon, Simbolo, type IconName } from '@/design-system';
import { ENDERECO_OFICIAL, TEXTOS, type MaterialDoProjeto } from '../landing-content';
import { Mascote } from '../mascote';
import { IconeExterno } from './icone-externo';
import { useOnline } from '../use-online';
import { enderecoIncorporado, idDoVideo } from '../video-incorporado';

interface PontoDeEvidencia {
  icone: IconName;
  titulo: string;
  descricao: string;
}

interface DetalheDoMaterial {
  selo: string;
  evidencias: readonly PontoDeEvidencia[];
}

const DETALHES_POR_VIDEO: Record<string, DetalheDoMaterial> = {
  'video-prototipo-fisico': {
    selo: 'Validação física em bancada',
    evidencias: [
      {
        icone: 'sensor',
        titulo: 'Anel mecânico de 12 posições',
        descricao: 'Instalado abaixo do volante, sem alterar a rosca nem o corpo do cilindro.',
      },
      {
        icone: 'bloqueio',
        titulo: 'Bloqueio instantâneo por solenoide',
        descricao: 'Pino de aço avança com engate direto, impedindo o giro não autorizado.',
      },
      {
        icone: 'verificado',
        titulo: 'Retenção e segurança confirmadas',
        descricao: 'Acionamento auditável sem interferir no controle nem no alívio de emergência.',
      },
    ],
  },
  'video-prototipo-sistema': {
    selo: 'Demonstração real da plataforma',
    evidencias: [
      {
        icone: 'cilindro',
        titulo: 'Identificação e despacho ágil',
        descricao: 'Leitura digital por QR Code ou NFC, sem depender de anotações manuais.',
      },
      {
        icone: 'rota',
        titulo: 'Rastreio e geocerca da viagem',
        descricao: 'Acompanhamento do trajeto com checagem automática da área permitida.',
      },
      {
        icone: 'verificado',
        titulo: 'Entrega com registro auditável',
        descricao: 'Confirmação no destino com carimbo de data, hora e responsável pela liberação.',
      },
    ],
  },
};

// Capa de cada vídeo, montada com as imagens do próprio projeto (nada de miniatura de terceiros): o título da história no pitch, o mascote
// apontando no protótipo do sistema (as telas reais já estão logo acima, na mesma seção) e o dispositivo na válvula, com o título que
// ocupa o lado vazio do palco, no protótipo físico.
// Decorativa: o botão diz o que toca. Cada capa mostra algo que a seção ao redor ainda não mostrou (crítica de 14/10/2026).
function Capa({ id }: { id: string }): React.JSX.Element | null {
  if (id === 'video-pitch') {
    return (
      <>
        <span className="landing-capa-tag pointer-events-none absolute left-6 top-16 inline-flex items-center gap-2 rounded-full border border-branco/20 bg-navy/80 px-4 py-1 text-legenda font-bold text-cinza-gelo tablet:left-8 tablet:top-16">
          <span className="inline-block size-2 rounded-full bg-azul-ciano" aria-hidden="true" />
          CASO REAL C-262 • 2 MIN 55 S
        </span>
        <span className="landing-capa-pergunta landing-capa-estreita pointer-events-none absolute text-h2 font-extrabold leading-tight text-branco tablet:text-display tablet:leading-tight">
          {TEXTOS.historia.titulo}
        </span>
        <Mascote uso="video" className="landing-capa-mascote landing-capa-mascote-pitch" />
      </>
    );
  }
  if (id === 'video-prototipo-sistema') {
    return (
      <>
        <span className="landing-capa-tag pointer-events-none absolute left-6 top-16 inline-flex items-center gap-2 rounded-full border border-branco/20 bg-navy/80 px-4 py-1 text-legenda font-bold text-cinza-gelo tablet:left-8 tablet:top-16">
          <span className="inline-block size-2 rounded-full bg-azul-ciano" aria-hidden="true" />
          SISTEMA EM USO • DEMONSTRAÇÃO REAL
        </span>
        <span className="landing-capa-pergunta landing-capa-estreita pointer-events-none absolute text-h3 font-extrabold leading-tight text-branco tablet:text-h1 tablet:leading-tight">
          {TEXTOS.video.capaSistema}
        </span>
        <Mascote uso="explica" className="landing-capa-mascote" />
      </>
    );
  }
  if (id === 'video-prototipo-fisico') {
    return (
      <>
        <span className="landing-capa-tag pointer-events-none absolute left-6 top-16 inline-flex items-center gap-2 rounded-full border border-branco/20 bg-navy/80 px-4 py-1 text-legenda font-bold text-cinza-gelo tablet:left-8 tablet:top-16">
          <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
          PROTÓTIPO EM BANCADA • VALIDAÇÃO PRÁTICA
        </span>
        <span className="landing-capa-pergunta landing-capa-estreita pointer-events-none absolute text-h3 font-extrabold leading-tight text-branco tablet:text-h1 tablet:leading-tight">
          {TEXTOS.video.capaFisico}
        </span>
        <img
          src="/landing/dispositivo-no-cilindro-373.webp"
          srcSet="/landing/dispositivo-no-cilindro-240.webp 240w, /landing/dispositivo-no-cilindro-373.webp 373w"
          sizes="(min-width: 768px) 16rem, 10rem"
          alt=""
          width={373}
          height={585}
          loading="lazy"
          decoding="async"
          className="landing-capa-dispositivo"
        />
      </>
    );
  }
  return null;
}

export interface VideoDestaqueProps {
  material: MaterialDoProjeto;
  // Sem legenda, o título e a descrição do vídeo não se repetem embaixo do palco: a seção ao redor já os diz (o pitch).
  legenda?: boolean;
  // Sobre seção escura, a descrição e o link para o YouTube passam aos tons claros (pares medidos em design.md).
  escuro?: boolean;
  // No computador, o palco ocupa três quintos da largura e o título, a descrição e o link ficam ao lado, como no pitch (polimento de
  // 14/10/2026: o palco sozinho na metade esquerda deixava a outra metade vazia na trava e no que já funciona).
  lado?: boolean;
}

// Vídeo que toca na própria página (Spec 011, adaptação ao pitch). Antes do clique, o palco é um cartão de marca desenhado pelo projeto
// (símbolo, ícone e botão de reprodução): nenhum player, script ou imagem de terceiros é carregado. Ao tocar em "Assistir", o player
// incorporado (youtube-nocookie.com) entra no lugar do cartão, começa a tocar e recebe o foco. Sem conexão, o botão avisa e não abre nada.
// O link para o YouTube continua disponível para quem preferir assistir lá.
export function VideoDestaque({ material, legenda = true, escuro = false, lado = false }: VideoDestaqueProps): React.JSX.Element {
  const online = useOnline();
  const [tocando, setTocando] = useState(false);
  const player = useRef<HTMLIFrameElement>(null);
  const assistir = useRef<HTMLButtonElement>(null);
  const voltouDoPlayer = useRef(false);
  const [carregou, setCarregou] = useState(false);
  const [demorou, setDemorou] = useState(false);
  const id = idDoVideo(material.url);
  const tituloId = `video-titulo-${material.id}`;
  const detalhes = DETALHES_POR_VIDEO[material.id];

  useEffect(() => {
    if (tocando) player.current?.focus();
    else if (voltouDoPlayer.current) assistir.current?.focus();
  }, [tocando]);

  // O player do YouTube pode demorar (rede lenta) ou ser bloqueado: sem o "load" em 10 s, uma mensagem leva a quem assistir direto lá.
  useEffect(() => {
    if (!tocando || carregou) return undefined;
    const prazo = window.setTimeout(() => setDemorou(true), 10_000);
    return () => window.clearTimeout(prazo);
  }, [tocando, carregou]);

  const fechar = (): void => {
    voltouDoPlayer.current = true;
    setTocando(false);
    setCarregou(false);
    setDemorou(false);
  };

  return (
    <article
      id={`assistir-${material.id}`}
      {...(legenda ? { 'aria-labelledby': tituloId } : { 'aria-label': material.titulo })}
      data-material={material.id}
      data-revelar
      className={lado ? 'grid grid-cols-1 items-center gap-6 desktop:grid-cols-5 desktop:gap-x-12' : 'flex flex-col gap-4'}
    >
      <div className={['flex min-w-0 flex-col gap-4', lado ? 'desktop:col-span-3' : ''].filter(Boolean).join(' ')}>
        <div
          data-palco
          className={[
            'landing-palco relative aspect-video w-full overflow-hidden rounded-card border border-branco/20 bg-navy shadow-dialogo',
            material.id === 'video-prototipo-sistema' ? 'flex flex-col' : '',
          ].filter(Boolean).join(' ')}
        >
          {material.id === 'video-prototipo-sistema' ? (
            /* Mockup de Janela de Computador no topo do palco do vídeo */
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-branco/10 bg-navy/95 px-4 text-cinza-gelo" aria-hidden="true">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-erro" />
                <span className="size-2 rounded-full bg-alerta-faixa" />
                <span className="size-2 rounded-full bg-verde-vivo" />
              </div>
              <div className="flex items-center gap-2 rounded-full border border-branco/10 bg-azul-profundo/40 px-4 py-1 text-legenda text-cinza-gelo">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="truncate text-cinza-gelo">{ENDERECO_OFICIAL}/demonstracao</span>
              </div>
              <div className="w-8 shrink-0 tablet:w-12" />
            </div>
          ) : null}

          <div className={material.id === 'video-prototipo-sistema' ? 'relative flex-1 size-full overflow-hidden' : 'size-full'}>
            {tocando && id ? (
              <iframe
                ref={player}
                src={enderecoIncorporado(id)}
                title={`${material.titulo} (player do YouTube)`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => setCarregou(true)}
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 size-full border-0"
              />
            ) : (
              <button
                ref={assistir}
                type="button"
                onClick={() => setTocando(true)}
                disabled={!online || !id}
                aria-label={`${online ? TEXTOS.video.assistir : TEXTOS.materiais.precisaConexao}: ${material.titulo}`}
                className="group absolute inset-0 flex size-full cursor-pointer flex-col items-start justify-end gap-4 bg-linear-to-br from-navy via-navy to-azul-profundo p-6 text-start text-branco disabled:cursor-not-allowed"
              >
                <span aria-hidden="true" data-decorativo className="pointer-events-none absolute inset-0"><Capa id={material.id} /></span>
                <span aria-hidden="true" data-decorativo className="landing-palco-marca pointer-events-none absolute left-6 top-6"><Simbolo size={32} decorative /></span>
                <span className="landing-reproduzir relative inline-flex items-center gap-4 rounded-full border border-branco/20 bg-navy/90 py-2 pl-2 pr-6 shadow-dialogo backdrop-blur-xs transition-colors group-hover:border-branco/40 group-hover:bg-azul-profundo">
                  {online ? (
                    <span aria-hidden="true" data-play className="inline-flex size-16 shrink-0 items-center justify-center rounded-full bg-verde-vivo text-navy shadow-dialogo transition-transform group-hover:scale-105 motion-reduce:transition-none">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" focusable="false"><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  ) : (
                    // Sem conexão o botão está desativado e parece desativado (DESIGN.md): borda tracejada, 60% e o ícone de sem sinal no lugar do play.
                    <span aria-hidden="true" data-sem-sinal className="inline-flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-branco opacity-60">
                      <Icon name="sem-sinal" size={32} variant="negativa" />
                    </span>
                  )}
                  <span className="text-corpo font-bold">
                    {online ? TEXTOS.video.assistir : TEXTOS.materiais.precisaConexao}
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
        {tocando && demorou && !carregou ? (
          <p role="status" className="m-0 rounded-controle bg-alerta-fundo p-4 text-corpo font-semibold text-alerta-texto">
            {TEXTOS.video.demorou}
          </p>
        ) : null}
        {tocando ? (
          <button
            type="button"
            onClick={fechar}
            aria-label={`${TEXTOS.video.voltarACapa}: ${material.titulo}`}
            className="inline-flex min-h-alvo w-fit cursor-pointer items-center gap-2 rounded-controle border border-borda-controle bg-branco px-4 text-corpo font-semibold text-azul-profundo hover:bg-info-fundo"
          >
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            {TEXTOS.video.voltarACapa}
          </button>
        ) : null}
      </div>
      <div
        className={
          lado
            ? [
                'flex min-w-0 flex-col justify-between gap-6 rounded-card p-4 shadow-card backdrop-blur-sm tablet:p-6 desktop:col-span-2',
                escuro ? 'border border-branco/15 bg-azul-profundo/40 text-branco' : 'border border-borda-suave bg-branco text-grafite',
              ].join(' ')
            : 'flex flex-col gap-4'
        }
      >
        {lado && detalhes ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-branco/10 pb-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-branco/20 bg-branco/10 px-4 py-1 text-legenda font-semibold text-cinza-gelo">
              <span className="inline-block size-2 rounded-full bg-verde-vivo" aria-hidden="true" />
              {detalhes.selo}
            </span>
            <span className="inline-flex items-center gap-1 text-legenda font-semibold text-cinza-gelo">
              <Icon name="verificado" size={16} variant={escuro ? 'negativa' : 'monocromatica'} />
              Evidência gravada
            </span>
          </div>
        ) : null}

        {legenda ? (
          <div className="flex flex-col gap-2">
            <h3 id={tituloId} className="m-0 text-h3 font-extrabold leading-tight">
              {material.titulo}
            </h3>
            <p className={['m-0 text-corpo leading-relaxed', escuro ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>
              {material.descricao}
            </p>
          </div>
        ) : null}

        {lado && detalhes ? (
          <div className="flex flex-col gap-2">
            <span className={['text-legenda font-bold uppercase tracking-wider', escuro ? 'text-cinza-gelo' : 'text-texto-secundario'].join(' ')}>
              O que este vídeo comprova:
            </span>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {detalhes.evidencias.map((item) => (
                <li
                  key={item.titulo}
                  className={[
                    'flex items-start gap-4 rounded-controle border p-4 shadow-card',
                    escuro ? 'border-branco/10 bg-navy/70 text-cinza-gelo' : 'border-borda-suave bg-cinza-gelo text-grafite',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border',
                      escuro ? 'border-branco/20 bg-branco/10' : 'border-borda-controle/20 bg-branco',
                    ].join(' ')}
                  >
                    <Icon name={item.icone} size={16} variant={escuro ? 'negativa' : 'monocromatica'} />
                  </span>
                  <span className="flex flex-col gap-1">
                    <strong className={['text-corpo font-bold', escuro ? 'text-branco' : 'text-grafite'].join(' ')}>
                      {item.titulo}
                    </strong>
                    <span className="text-legenda leading-relaxed">
                      {item.descricao}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={lado ? 'flex flex-wrap items-center gap-4 pt-2' : ''}>
          <a
            href={material.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${TEXTOS.video.abrirNoYoutube}: ${material.titulo}, abre em nova aba`}
            className={
              lado
                ? [
                    'inline-flex min-h-alvo w-fit items-center gap-2 rounded-controle border px-4 py-2 text-corpo font-semibold no-underline shadow-card transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
                    escuro
                      ? 'border-branco/20 bg-branco/10 text-branco hover:border-branco/40 hover:bg-branco/20 focus-visible:ring-branco'
                      : 'border-borda-controle bg-branco text-azul-profundo hover:bg-cinza-gelo focus-visible:ring-azul-royal',
                  ].join(' ')
                : [
                    'inline-flex min-h-alvo w-fit items-center gap-2 rounded-controle text-corpo font-semibold underline underline-offset-4',
                    escuro ? 'text-branco' : 'text-azul-profundo',
                  ].join(' ')
            }
          >
            {TEXTOS.video.abrirNoYoutube}
            <IconeExterno />
          </a>
        </div>
      </div>
    </article>
  );
}
