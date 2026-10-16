import React from 'react';
import { MATERIAIS, TEXTOS, VIDEO_DA_SECAO } from '../landing-content';
import { Secao } from './secao';
import { VideoDestaque } from './video-destaque';

const PONTOS_DO_PITCH = [
  {
    momento: '01',
    tempo: '0:00',
    titulo: 'Os problemas enfrentados',
    descricao: 'A rotina de transporte, o controle manual vulnerável em papel e planilhas e o desaparecimento de cilindros na entrega.',
  },
  {
    momento: '02',
    tempo: '0:55',
    titulo: 'O tamanho do prejuízo',
    descricao: 'O impacto financeiro de ativos não recuperados no pátio e o custo invisível das perdas recorrentes no setor de gases.',
  },
  {
    momento: '03',
    tempo: '1:40',
    titulo: 'As soluções propostas',
    descricao: 'A trava física inteligente acoplada à válvula e a plataforma digital com validação segura de entrega, inclusive sem sinal.',
  },
] as const;

function DestaquesDoPitch(): React.JSX.Element {
  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-borda-suave bg-cinza-gelo px-4 py-1 text-legenda font-semibold text-texto-secundario shadow-card">
          <span className="inline-block size-2 rounded-full bg-verde-escuro" aria-hidden="true" />
          Duração: 2 min 55 s
        </span>
        <span className="inline-flex items-center rounded-full border border-borda-suave bg-cinza-gelo px-4 py-1 text-legenda font-semibold text-texto-secundario">
          Apresentação oficial
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-card border border-borda-suave bg-cinza-gelo p-4 shadow-card">
        <div className="flex items-center justify-between gap-2 border-b border-borda-suave pb-2">
          <p className="m-0 text-legenda font-bold uppercase tracking-wider text-texto-secundario">
            O que você vai ver no vídeo:
          </p>
          <span className="text-legenda font-bold text-azul-profundo">2:55 min</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {PONTOS_DO_PITCH.map((ponto) => (
            <li key={ponto.momento} className="flex items-start gap-4">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-azul-profundo text-legenda font-bold text-branco shadow-card">
                {ponto.momento}
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-borda-suave bg-branco px-2 py-1 text-legenda font-bold tabular-nums text-azul-profundo">
                    {ponto.tempo}
                  </span>
                  <strong className="text-corpo font-bold text-grafite">{ponto.titulo}</strong>
                </div>
                <span className="text-legenda leading-relaxed text-texto-secundario">{ponto.descricao}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <a
        href="#materiais"
        className="inline-flex min-h-alvo items-center gap-2 self-start rounded-controle text-corpo font-semibold text-azul-profundo underline underline-offset-4 transition-colors hover:text-navy motion-reduce:transition-none"
      >
        <svg aria-hidden="true" focusable="false" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {TEXTOS.pitch.verMateriais}
      </a>
    </div>
  );
}

// O pitch completo (Spec 011; segunda crítica de 14/10/2026): logo depois do prejuízo, quem já se interessou pode assistir à história inteira
// contada pela equipe, sem rolar a página toda. É a âncora da ação principal da abertura ("Assistir ao pitch"). O título, a descrição e os
// destaques ficam no cabeçalho da seção, ao lado do palco no computador; embaixo do palco fica o link direto para o YouTube.
export function Pitch(): React.JSX.Element {
  const material = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.pitch);
  return (
    <Secao
      id="pitch"
      titulo={TEXTOS.pitch.titulo}
      introducao={TEXTOS.pitch.introducao}
      lateral={<DestaquesDoPitch />}
      fundo="branco"
      lado
    >
      <div className="flex flex-col gap-4">
        {material ? <VideoDestaque material={material} legenda={false} /> : null}
      </div>
    </Secao>
  );
}
