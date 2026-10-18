import React, { useRef, useState } from 'react';
import { Icon } from '@/design-system';
import { TEXTOS } from '../landing-content';
import { MATERIAIS, VIDEO_DA_SECAO } from '../landing-content';
import { useTrocaAutomatica } from '../use-troca-automatica';
import { Secao } from './secao';
import { VideoDestaque } from './video-destaque';

export type EstadoDaTrava = (typeof TEXTOS.trava.estados)[number]['id'];

// A demonstração anda sozinha entre os três momentos neste ritmo (pedido de 15/10/2026), para as animações continuarem em cena.
export const INTERVALO_DA_TROCA = 10_000;

const CENTRO = 130;
const RAIO_DAS_ABERTURAS = 92;
const ABERTURAS = Array.from({ length: 12 }, (_, indice) => indice * 30);

// Ilustração da trava vista de cima: o anel com doze aberturas abaixo do volante, o volante com seus raios e, à direita, a carcaça com o
// solenoide. O pino (mecanismo, sempre branco) avança até a abertura quando trava e recua quando libera; liberado, o volante dá uma volta.
// O estado fica no LED da carcaça: verde travado, ciano liberado, vermelho em violação. Fora da geocerca, a área autorizada (o círculo
// tracejado) passa a vermelho-claro, mais grossa, legível sobre o navy, e o pino volta a travar. Decorativa: o estado está escrito ao lado.
export function DesenhoDaTrava({ estado }: { estado: EstadoDaTrava }): React.JSX.Element {
  const travado = estado !== 'destino';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-decorativo
      viewBox="0 0 320 260"
      className="landing-trava block h-auto w-full"
      data-estado={estado}
      fill="none"
    >
      <circle
        cx={CENTRO}
        cy={CENTRO}
        r="124"
        className="landing-geocerca"
        stroke={estado === 'geocerca' ? 'var(--color-erro-fundo)' : 'var(--color-azul-ciano)'}
        strokeWidth={estado === 'geocerca' ? 4 : 2}
        strokeDasharray="6 8"
      />
      {/* Anel com doze aberturas */}
      <circle cx={CENTRO} cy={CENTRO} r="104" fill="var(--color-azul-profundo)" />
      <circle cx={CENTRO} cy={CENTRO} r="104" stroke="var(--color-azul-ciano)" strokeWidth="2" />
      {ABERTURAS.map((angulo) => (
        <rect
          key={angulo}
          x={CENTRO + RAIO_DAS_ABERTURAS - 7}
          y={CENTRO - 6}
          width="14"
          height="12"
          rx="2"
          fill="var(--color-navy)"
          transform={`rotate(${angulo} ${CENTRO} ${CENTRO})`}
        />
      ))}
      {/* Volante da válvula */}
      <g className="landing-volante" data-girando={!travado || undefined}>
        <circle cx={CENTRO} cy={CENTRO} r="70" stroke="var(--color-branco)" strokeWidth="12" />
        {[0, 72, 144, 216, 288].map((angulo) => (
          <rect
            key={angulo}
            x={CENTRO - 4}
            y={CENTRO - 66}
            width="8"
            height="56"
            rx="4"
            fill="var(--color-branco)"
            transform={`rotate(${angulo} ${CENTRO} ${CENTRO})`}
          />
        ))}
        <circle cx={CENTRO} cy={CENTRO} r="18" fill="var(--color-azul-royal)" />
        <circle cx={CENTRO} cy={CENTRO} r="7" fill="var(--color-branco)" />
      </g>
      {/* Carcaça e solenoide */}
      <rect x="244" y="104" width="64" height="52" rx="10" fill="var(--color-branco)" />
      <rect x="256" y="116" width="40" height="28" rx="4" fill="var(--color-azul-profundo)" />
      <circle cx="296" cy="112" r="5" fill={estado === 'geocerca' ? 'var(--color-erro)' : travado ? 'var(--color-verde-vivo)' : 'var(--color-azul-ciano)'} />
      {/* Pino: avança até a abertura do anel (travado) ou recua para a carcaça (liberado) */}
      {/* O invólucro faz a entrada (o pino avança e encaixa uma vez, quando a trava entra na tela); o pino em si responde aos momentos. */}
      <g className="landing-pino-entrada">
        <rect
          x="214"
          y="124"
          width="46"
          height="12"
          rx="6"
          className="landing-pino"
          fill="var(--color-branco)"
          stroke="var(--color-navy)"
          strokeWidth="2"
          data-recuado={!travado || undefined}
        />
      </g>
    </svg>
  );
}

// A trava física inteligente (Spec 011, adaptação ao pitch, 6:15 a 8:15): o protótipo, mostrado em seus três momentos (transporte, destino
// e saída da geocerca), o que vai dentro e as garantias de segurança. Fica marcado como protótipo em validação no piloto. Os botões trocam o
// momento mostrado (aria-pressed) e o texto do momento é anunciado com educação (aria-live). Os momentos se revezam sozinhos a cada 10 s,
// sem barra de tempo; escolher um momento reinicia a contagem a partir dele, o botão discreto no texto do momento pausa e retoma, e com
// "reduzir movimento" a troca começa desligada. O texto só é anunciado na escolha manual, não a cada volta automática.
export function Trava(): React.JSX.Element {
  const { trava } = TEXTOS;
  const [estado, setEstado] = useState<EstadoDaTrava>('transporte');
  const [automatica, setAutomatica] = useState(
    () => !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const painel = useRef<HTMLDivElement>(null);
  // Quem trocou por último: a pessoa (o texto é anunciado) ou a troca automática (silenciosa).
  const [escolhaManual, setEscolhaManual] = useState(false);
  // Cada escolha conta como um momento novo, mesmo repetindo o que já está na tela: a contagem recomeça.
  const [escolhas, setEscolhas] = useState(0);
  useTrocaAutomatica(painel, automatica, INTERVALO_DA_TROCA, `${estado}-${escolhas}`, () => {
    setEscolhaManual(false);
    setEstado((atual) => trava.estados[(trava.estados.findIndex((item) => item.id === atual) + 1) % trava.estados.length]!.id);
  });
  const escolher = (id: EstadoDaTrava): void => {
    setEscolhaManual(true);
    setEscolhas((total) => total + 1);
    setEstado(id);
  };
  const videoDaTrava = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.trava);
  return (
    <Secao
      id="trava"
      titulo={trava.titulo}
      introducao={trava.introducao}
      // Dois slides: o protótipo em seus três momentos e, no seguinte, o vídeo do protótipo físico.
      depois={videoDaTrava ? [<VideoDestaque key="video" material={videoDaTrava} escuro lado />] : []}
    >
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-alerta-fundo px-4 py-2 text-legenda font-bold text-alerta-texto">
        <Icon name="sensor" size={16} variant="monocromatica" />
        {trava.selo}
      </span>
      <div className="grid items-start gap-8 tablet:grid-cols-2 tablet:gap-12">
        {/* O protótipo numa peça só: o desenho, a escolha do momento e o que acontece nele ficam no mesmo painel de telemetria */}
        <div
          className="flex flex-col gap-6 rounded-card border border-branco/15 bg-azul-profundo/40 p-4 shadow-card backdrop-blur-sm tablet:p-6"
          data-revelar
          data-painel-trava
          ref={painel}
        >
          <div className="landing-area-trava mx-auto w-full">
            <DesenhoDaTrava estado={estado} />
          </div>
          {/* Controle segmentado: os três momentos num trilho tátil, com LED de status correspondente ao dispositivo */}
          <div
            role="group"
            aria-label={trava.rotuloEstados}
            className="grid grid-cols-3 items-stretch gap-1 rounded-controle border border-branco/20 bg-navy p-1 shadow-card"
          >
            {trava.estados.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === estado}
                onClick={() => escolher(item.id)}
                className={[
                  'min-h-alvo cursor-pointer rounded-controle px-2 py-2 text-legenda font-bold transition-all duration-200 motion-reduce:transition-none tablet:text-corpo flex items-center justify-center gap-2',
                  item.id !== estado
                    ? 'bg-navy text-cinza-gelo hover:bg-azul-profundo hover:text-branco'
                    : item.id === 'geocerca'
                      ? 'bg-erro text-branco shadow-card'
                      : 'bg-branco text-navy shadow-card',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className={[
                    'inline-block size-2 rounded-full shrink-0',
                    item.id === 'geocerca'
                      ? item.id === estado
                        ? 'bg-branco'
                        : 'bg-erro'
                      : item.id === 'destino'
                        ? item.id === estado
                          ? 'bg-azul-profundo'
                          : 'bg-azul-ciano'
                        : item.id === estado
                          ? 'bg-azul-profundo'
                          : 'bg-verde-vivo',
                  ].join(' ')}
                />
                {item.rotulo}
              </button>
            ))}
          </div>
          <div className="relative">
            <div
              data-momentos
              aria-live={escolhaManual ? 'polite' : 'off'}
              className="grid rounded-controle border border-branco/10 bg-azul-profundo/50 p-4 pe-12 shadow-card"
            >
              {/* Os três textos ocupam a mesma célula: a caixa tem sempre a altura do maior e não pula ao trocar de momento. O que sai esmaece
                enquanto o novo aparece (só com movimento); o escondido fica fora da leitura de tela (aria-hidden). */}
              {trava.estados.map((item) => (
                <p
                  key={item.id}
                  data-ativo={item.id === estado || undefined}
                  aria-hidden={item.id === estado ? undefined : true}
                  className={[
                    'landing-momento col-start-1 row-start-1 m-0 flex flex-col gap-2',
                    item.id === estado ? '' : 'pointer-events-none select-none opacity-0',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <Icon name={item.id === 'geocerca' ? 'alerta' : item.id === 'destino' ? 'verificado' : 'bloqueio'} size={24} variant="negativa" />
                    <span className="text-h3 font-extrabold text-branco">{item.titulo}</span>
                  </span>
                  <span className="text-corpo leading-relaxed text-cinza-gelo">{item.texto}</span>
                </p>
              ))}
            </div>
            {/* Pausa e retoma a troca automática (WCAG 2.2.2), discreto no canto do texto e fora da região anunciada. */}
            <button
              type="button"
              onClick={() => setAutomatica((ligada) => !ligada)}
              aria-label={automatica ? trava.pausarTroca : trava.retomarTroca}
              title={automatica ? trava.pausarTroca : trava.retomarTroca}
              className="absolute right-0 top-0 inline-flex size-alvo cursor-pointer items-center justify-center rounded-controle text-cinza-gelo transition-colors hover:text-branco motion-reduce:transition-none"
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                {automatica ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" /> : <path d="M8 5v14l11-7z" />}
              </svg>
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-8" data-revelar>
          {/* Começa aberto: os componentes são a prova do que a trava é; o resumo diz quantos são e ainda recolhe. */}
          <details open className="landing-detalhes rounded-card border border-branco/15 bg-navy/80 shadow-card">
            <summary className="flex min-h-alvo cursor-pointer items-center gap-4 px-4 py-2 text-corpo font-bold leading-tight tablet:text-h3">
              <span className="flex items-center gap-2">
                <Icon name="sensor" size={24} variant="negativa" />
                <span>{trava.componentesTitulo}</span>
              </span>
              <span className="landing-detalhes-contagem ms-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-branco/20 bg-branco/10 px-2 py-1 text-legenda font-semibold text-cinza-gelo">
                <span aria-hidden="true" className="inline-block size-2 rounded-full bg-verde-vivo" />
                {trava.componentesContagem}
              </span>
            </summary>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-4 pt-0 desktop:grid-cols-3">
              {trava.componentes.map((componente) => (
                <li
                  key={componente}
                  className="flex min-h-alvo items-center gap-2 rounded-controle border border-branco/10 bg-azul-profundo/40 px-4 py-2 text-corpo font-semibold text-branco"
                >
                  <span aria-hidden="true" className="landing-led" />
                  <span>{componente}</span>
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-col gap-4 rounded-card border border-branco/15 bg-navy/80 p-4 shadow-card backdrop-blur-sm tablet:p-6">
            <div className="flex items-center justify-between border-b border-branco/10 pb-4">
              <h3 className="m-0 flex items-center gap-2 text-h3 font-bold leading-tight text-branco">
                <Icon name="escudo" size={24} variant="negativa" />
                {trava.segurancaTitulo}
              </h3>
              <span className="hidden items-center gap-1 rounded-full border border-branco/20 bg-branco/10 px-2 py-1 text-legenda font-semibold text-cinza-gelo tablet:inline-flex">
                <span aria-hidden="true" className="inline-block size-2 rounded-full bg-verde-vivo" />
                Protocolo seguro
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {trava.seguranca.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-4 rounded-controle border border-branco/10 bg-azul-profundo/30 p-4 text-corpo leading-relaxed text-cinza-gelo"
                >
                  <span aria-hidden="true" className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border border-branco/20 bg-branco/10">
                    <Icon name="verificado" size={16} variant="negativa" />
                  </span>
                  <span className="flex-1 text-corpo leading-relaxed text-cinza-gelo">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Secao>
  );
}
