import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CDPSession, Frame, Locator, Page } from '@playwright/test';

// Estúdio do vídeo de demonstração (gerado sob demanda por video-demonstracao.gerar.spec.ts). Põe sobre o aplicativo, sem mexer nele:
// - a legenda (perfil, passo e explicação curta), que muda com animação e sobrevive às navegações (sessionStorage);
// - um cursor visível que desliza até o alvo e marca o clique, já que a gravação não mostra o ponteiro do sistema;
// - as cartelas de capítulo e o selo permanente "Dados de exemplo";
// - a moldura de celular, uma página do próprio domínio com o aplicativo num iframe de 390 px, para o trecho de campo.
// A gravação usa o screencast do Chromium (quadros JPEG com a hora de chegada) e a montagem fica em scripts/video/montar-video-demonstracao.mjs.

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const FONTE = join(RAIZ, 'node_modules', '@fontsource-variable', 'montserrat', 'files', 'montserrat-latin-wght-normal.woff2');

export interface Legenda {
  perfil: string;
  // Cor do perfil no selo da legenda.
  cor: string;
  titulo: string;
  texto: string;
}

export interface Capitulo {
  numero: string;
  perfil?: string;
  cor?: string;
  titulo: string;
  subtitulo: string;
  mascote?: string;
}

// Código do estúdio, injetado em toda página antes do aplicativo. Só monta na janela de cima: dentro do iframe do celular não aparece nada.
function estudio(): void {
  if (window.top !== window) return;
  const CHAVE = 'fluxid-video-estudio';
  type Estado = { legenda: Legenda | null; modo: 'rodape' | 'lateral'; cursor: [number, number]; ritmo?: number };
  const ler = (): Estado => {
    try {
      return JSON.parse(sessionStorage.getItem(CHAVE) ?? '') as Estado;
    } catch {
      return { legenda: null, modo: 'rodape', cursor: [720, 600] };
    }
  };
  const gravar = (estado: Estado): void => sessionStorage.setItem(CHAVE, JSON.stringify(estado));
  let sombra: ShadowRoot | null = null;
  const $ = (seletor: string): HTMLElement => sombra!.querySelector(seletor) as HTMLElement;

  const desenharLegenda = (legenda: Legenda | null, animar: boolean): void => {
    const caixa = $('.legenda');
    if (!legenda) {
      caixa.hidden = true;
      return;
    }
    caixa.hidden = false;
    $('.legenda .perfil').textContent = legenda.perfil;
    $('.legenda .perfil').style.setProperty('--cor', legenda.cor);
    $('.legenda .titulo').textContent = legenda.titulo;
    $('.legenda .texto').textContent = legenda.texto;
    if (animar) {
      caixa.classList.remove('entra');
      void caixa.offsetWidth;
      caixa.classList.add('entra');
    }
  };

  const montar = (): void => {
    if (document.getElementById('fluxid-video-estudio')) return;
    const raiz = document.createElement('div');
    raiz.id = 'fluxid-video-estudio';
    sombra = raiz.attachShadow({ mode: 'open' });
    sombra.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; font-family: 'Montserrat Variable', 'Montserrat', Arial, sans-serif; }
        .legenda { position: fixed; left: 32px; bottom: 32px; z-index: 2147483646; width: min(660px, calc(100vw - 64px)); padding: 22px 28px 24px;
          border-radius: 16px; background: rgba(13, 37, 77, 0.94); color: #fff; box-shadow: 0 18px 50px rgba(8, 22, 48, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(6px); pointer-events: none; }
        .legenda[hidden] { display: none; }
        .legenda.entra { animation: entra 520ms cubic-bezier(0.16, 1, 0.3, 1); }
        .lateral .legenda { left: 120px; bottom: auto; top: 50%; transform: translateY(-50%); width: 720px; padding: 36px 40px 40px; background: rgba(255,255,255,0.06); }
        .lateral .legenda.entra { animation: entra-lateral 520ms cubic-bezier(0.16, 1, 0.3, 1); }
        .lateral .titulo { font-size: 44px; }
        .lateral .texto { font-size: 26px; }
        .perfil { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px 5px 10px; border-radius: 999px; font-size: 13px; font-weight: 700;
          letter-spacing: 0.04em; text-transform: uppercase; background: rgba(255,255,255,0.1); color: #fff; }
        .lateral .legenda .perfil { font-size: 16px; }
        .perfil::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--cor, #23AFE5); box-shadow: 0 0 0 3px rgba(255,255,255,0.12); }
        .titulo { margin: 14px 0 8px; font-size: 30px; font-weight: 800; line-height: 1.2; }
        .texto { margin: 0; font-size: 20px; line-height: 1.45; color: #DCE8F5; }
        .selo { position: fixed; right: 28px; bottom: 28px; z-index: 2147483645; padding: 8px 16px; border-radius: 999px; font-size: 16px; font-weight: 700;
          background: #FFF4D6; color: #7A4B00; box-shadow: 0 6px 18px rgba(8, 22, 48, 0.25); pointer-events: none; }
        .cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; width: 36px; height: 36px; pointer-events: none;
          transition: transform var(--deslize, 700ms) cubic-bezier(0.45, 0, 0.2, 1); filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35)); }
        .cursor.toque svg { display: none; }
        .cursor.toque::before { content: ''; position: absolute; left: -14px; top: -14px; width: 28px; height: 28px; border-radius: 50%;
          background: rgba(255,255,255,0.55); border: 3px solid #fff; }
        .onda { position: fixed; z-index: 2147483646; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; pointer-events: none;
          border: 3px solid #23AFE5; background: rgba(35, 175, 229, 0.22); animation: onda 600ms ease-out forwards; }
        .capitulo { position: fixed; inset: 0; z-index: 2147483647; display: grid; grid-template-columns: 1.25fr 1fr; align-items: center; gap: 48px;
          padding: 0 128px; color: #fff; background: radial-gradient(circle at 78% 40%, rgba(35,175,229,0.28), transparent 45%), linear-gradient(135deg, #0D254D, #163B72 55%, #1249B8);
          opacity: 0; transition: opacity 450ms ease; pointer-events: none; }
        .capitulo.visivel { opacity: 1; }
        .capitulo.visivel ~ .cursor { opacity: 0; }
        .capitulo .perfil[hidden] { display: none; }
        .capitulo[hidden] { display: none; }
        .capitulo .numero { font-size: 26px; font-weight: 800; letter-spacing: 0.2em; color: #23AFE5; }
        .capitulo h1 { margin: 22px 0 20px; font-size: 84px; line-height: 1.05; font-weight: 800; letter-spacing: -0.01em; }
        .capitulo p { margin: 0; max-width: 34ch; font-size: 31px; line-height: 1.45; color: #DCE8F5; }
        .capitulo .perfil { margin-top: 32px; font-size: 19px; padding: 8px 18px 8px 14px; }
        .capitulo img { justify-self: center; max-height: 70vh; max-width: 100%; filter: drop-shadow(0 30px 50px rgba(0,0,0,0.35)); }
        .capitulo .marca { position: absolute; left: 128px; top: 72px; display: flex; align-items: center; gap: 14px; font-size: 34px; font-weight: 800; }
        .capitulo .marca img { width: 52px; height: 52px; max-height: none; filter: none; }
        @keyframes entra { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
        @keyframes entra-lateral { from { opacity: 0; transform: translate(-18px, -50%); } to { opacity: 1; transform: translateY(-50%); } }
        @keyframes onda { from { opacity: 1; transform: scale(0.4); } to { opacity: 0; transform: scale(1.4); } }
      </style>
      <div class="palco">
        <div class="legenda" hidden><span class="perfil"></span><p class="titulo"></p><p class="texto"></p></div>
        <div class="selo">Dados de exemplo</div>
        <div class="capitulo" hidden>
          <div class="marca"><img src="/favicon.svg" alt="">FluxID</div>
          <div><div class="numero"></div><h1></h1><p></p><span class="perfil"></span></div>
          <img class="mascote" src="/landing/mascote-768.webp" alt="" hidden>
        </div>
        <div class="cursor"><svg viewBox="0 0 24 24" width="36" height="36"><path d="M4 2l15 10.5-6.6 1.2 3.9 7.3-2.9 1.5-3.9-7.4L4 20z" fill="#fff" stroke="#0D254D" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
      </div>`;
    document.documentElement.appendChild(raiz);
    const estado = ler();
    $('.palco').classList.toggle('lateral', estado.modo === 'lateral');
    $('.palco').style.setProperty('--deslize', `${Math.round(700 * (estado.ritmo ?? 1))}ms`);
    desenharLegenda(estado.legenda, false);
    $('.cursor').style.transition = 'none';
    $('.cursor').style.transform = `translate(${estado.cursor[0]}px, ${estado.cursor[1]}px)`;
    void $('.cursor').offsetWidth;
    $('.cursor').style.transition = '';
  };

  const api = {
    legenda(legenda: Legenda | null): void {
      montar();
      gravar({ ...ler(), legenda });
      desenharLegenda(legenda, true);
    },
    modo(modo: 'rodape' | 'lateral', toque: boolean): void {
      montar();
      gravar({ ...ler(), modo });
      $('.palco').classList.toggle('lateral', modo === 'lateral');
      $('.cursor').classList.toggle('toque', toque);
    },
    ritmo(fator: number): void {
      montar();
      gravar({ ...ler(), ritmo: fator });
      $('.palco').style.setProperty('--deslize', `${Math.round(700 * fator)}ms`);
    },
    cursor(x: number, y: number, instantaneo = false): void {
      montar();
      gravar({ ...ler(), cursor: [x, y] });
      const cursor = $('.cursor');
      if (instantaneo) cursor.style.transition = 'none';
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      if (instantaneo) {
        void cursor.offsetWidth;
        cursor.style.transition = '';
      }
    },
    clique(): void {
      montar();
      const [x, y] = ler().cursor;
      const onda = document.createElement('div');
      onda.className = 'onda';
      onda.style.left = `${x}px`;
      onda.style.top = `${y}px`;
      $('.palco').appendChild(onda);
      setTimeout(() => onda.remove(), 700);
    },
    capitulo(capitulo: Capitulo | null): void {
      montar();
      const tela = $('.capitulo');
      if (!capitulo) {
        tela.classList.remove('visivel');
        setTimeout(() => { tela.hidden = true; }, 460);
        return;
      }
      sombra!.querySelector('.capitulo .numero')!.textContent = capitulo.numero;
      sombra!.querySelector('.capitulo h1')!.textContent = capitulo.titulo;
      sombra!.querySelector('.capitulo p')!.textContent = capitulo.subtitulo;
      const perfil = sombra!.querySelector('.capitulo .perfil') as HTMLElement;
      perfil.textContent = capitulo.perfil ?? '';
      perfil.hidden = !capitulo.perfil;
      perfil.style.setProperty('--cor', capitulo.cor ?? '#23AFE5');
      const mascote = sombra!.querySelector('.capitulo .mascote') as HTMLImageElement;
      mascote.hidden = !capitulo.mascote;
      if (capitulo.mascote) mascote.src = capitulo.mascote;
      tela.hidden = false;
      void tela.offsetWidth;
      tela.classList.add('visivel');
    },
  };
  (window as unknown as { __estudio: typeof api }).__estudio = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
}

// Página da moldura de celular: o aplicativo de verdade num iframe de 390 x 760, à direita, e o espaço da esquerda para a legenda lateral.
const MOLDURA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>FluxID no celular</title>
<style>
  @font-face { font-family: 'Montserrat Variable'; src: url('/__video/montserrat.woff2') format('woff2-variations'); font-weight: 300 800; }
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body { background: radial-gradient(circle at 72% 45%, rgba(35,175,229,0.25), transparent 42%), linear-gradient(135deg, #0D254D, #163B72 55%, #1249B8); }
  /* 1,3 vez o tamanho real: o celular ocupa a altura do vídeo em 1080p. */
  .aparelho { position: absolute; right: 260px; top: 50%; transform: translateY(-50%) scale(1.3); padding: 12px; border-radius: 52px; background: #0A1A33;
    box-shadow: 0 40px 90px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.08); }
  iframe { display: block; width: 390px; height: 760px; border: 0; border-radius: 40px; background: #F3F7FA; }
</style></head><body><div class="aparelho"><iframe id="celular" title="FluxID no celular" allow="geolocation; camera" src="/visao-geral"></iframe></div></body></html>`;

// Liga o estúdio numa página: o código da legenda e do cursor antes de cada documento, e as rotas /__video/ (fonte e moldura).
export async function instalarEstudio(page: Page): Promise<void> {
  await page.addInitScript(estudio);
  await page.route('**/__video/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/__video/montserrat.woff2') return route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(FONTE) });
    if (pathname === '/__video/celular') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOLDURA });
    return route.fulfill({ status: 404 });
  });
}

// Ritmo do vídeo: 1 no completo; menor que 1 encurta todas as pausas e o deslize do cursor (a versão curta, de até 90 s).
let RITMO = 1;
export async function definirRitmo(page: Page, fator: number): Promise<void> {
  RITMO = fator;
  await chamar(page, 'ritmo', fator);
}

export const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms * RITMO));

type Api = { legenda(l: Legenda | null): void; modo(m: string, t: boolean): void; ritmo(f: number): void; cursor(x: number, y: number, i?: boolean): void; clique(): void; capitulo(c: Capitulo | null): void };
const chamar = async <K extends keyof Api>(page: Page, metodo: K, ...args: Parameters<Api[K]>): Promise<void> => {
  await page.evaluate(([nome, valores]) => {
    const api = (window as unknown as { __estudio: Record<string, (...v: unknown[]) => void> }).__estudio;
    api[nome as string]!(...(valores as unknown[]));
  }, [metodo, args] as const);
};

export async function legenda(page: Page, conteudo: Legenda | null, leitura = 0): Promise<void> {
  await chamar(page, 'legenda', conteudo);
  if (leitura) await esperar(leitura);
}

export async function modo(page: Page, qual: 'rodape' | 'lateral', toque = false): Promise<void> {
  await chamar(page, 'modo', qual, toque);
}

// Abre a cartela e espera ela terminar de entrar (para começar a gravar já com ela cheia na tela).
export async function abrirCapitulo(page: Page, conteudo: Capitulo): Promise<void> {
  console.log(`[vídeo] ${conteudo.numero}: ${conteudo.titulo}`);
  await chamar(page, 'capitulo', conteudo);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function fecharCapitulo(page: Page): Promise<void> {
  await chamar(page, 'capitulo', null);
  await esperar(500);
}

// A cartela entra, fica `duracao` ms e sai; com `manter`, fica na tela (a última, que fecha o vídeo).
export async function capitulo(page: Page, conteudo: Capitulo, duracao: number, manter = false): Promise<void> {
  console.log(`[vídeo] ${conteudo.numero}: ${conteudo.titulo}`);
  await chamar(page, 'capitulo', conteudo);
  await esperar(duracao);
  if (manter) return;
  await chamar(page, 'capitulo', null);
  await esperar(500);
}

// Leva o cursor até o centro do alvo (com rolagem suave se ele estiver fora da tela) e devolve o ponto, na janela de cima.
export async function apontar(page: Page, alvo: Locator, pausaDepois = 250): Promise<{ x: number; y: number }> {
  await alvo.evaluate((elemento) => elemento.scrollIntoView({ block: 'center', behavior: 'smooth' })).catch(() => undefined);
  await esperar(450);
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error('Alvo sem caixa para o cursor');
  const ponto = { x: Math.round(caixa.x + caixa.width / 2), y: Math.round(caixa.y + Math.min(caixa.height / 2, 22)) };
  await chamar(page, 'cursor', ponto.x, ponto.y);
  await esperar(750 + pausaDepois);
  return ponto;
}

export async function clicar(page: Page, alvo: Locator, pausaDepois = 500): Promise<void> {
  await apontar(page, alvo, 120);
  await chamar(page, 'clique');
  await alvo.click();
  await esperar(pausaDepois);
}

export async function digitar(page: Page, alvo: Locator, texto: string, atraso = 45): Promise<void> {
  await clicar(page, alvo, 150);
  await alvo.pressSequentially(texto, { delay: atraso });
  await esperar(250);
}

export async function escolher(page: Page, alvo: Locator, opcao: { label: string } | { index: number }, pausaDepois = 450): Promise<void> {
  await apontar(page, alvo, 100);
  await chamar(page, 'clique');
  await alvo.selectOption(opcao);
  await esperar(pausaDepois);
}

// Rola a página (ou o iframe) até o alvo, devagar, sem mover o cursor.
export async function rolarAte(alvo: Locator, bloco: 'start' | 'center' = 'start', pausa = 900): Promise<void> {
  await alvo.evaluate((elemento, onde) => elemento.scrollIntoView({ block: onde, behavior: 'smooth' }), bloco);
  await esperar(pausa);
}

export const celular = (page: Page): Frame => page.frame({ url: /localhost:4173\/(?!__video)/ })!;

// Rolo de quadros: o screencast do Chromium manda um quadro a cada mudança na tela, com a hora de chegada. Cada página gravada entra no
// mesmo rolo, em sequência; o tempo em que nenhuma página está gravando (preparos) não entra no vídeo.
export class Rolo {
  private readonly quadros: Array<{ arquivo: string; inicio: number }> = [];
  private readonly cortes: number[] = [];
  private sessao: CDPSession | null = null;
  private contador = 0;

  constructor(private readonly pasta: string) {
    mkdirSync(pasta, { recursive: true });
  }

  async gravar(page: Page): Promise<void> {
    await this.parar();
    const sessao = await page.context().newCDPSession(page);
    sessao.on('Page.screencastFrame', (quadro: { data: string; sessionId: number }) => {
      const arquivo = `${String(this.contador++).padStart(6, '0')}.jpg`;
      writeFileSync(join(this.pasta, arquivo), Buffer.from(quadro.data, 'base64'));
      this.quadros.push({ arquivo, inicio: Date.now() });
      void sessao.send('Page.screencastFrameAck', { sessionId: quadro.sessionId }).catch(() => undefined);
    });
    await sessao.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    this.sessao = sessao;
  }

  async parar(): Promise<void> {
    if (!this.sessao) return;
    await this.sessao.send('Page.stopScreencast').catch(() => undefined);
    await this.sessao.detach().catch(() => undefined);
    this.sessao = null;
    this.cortes.push(Date.now());
  }

  // Lista para o concat do FFmpeg: cada quadro dura até o próximo, ou até o corte da gravação em que ele estava.
  salvar(): string {
    const linhas: string[] = ['ffconcat version 1.0'];
    this.quadros.forEach((quadro, indice) => {
      const proximo = this.quadros[indice + 1];
      const corte = this.cortes.find((momento) => momento >= quadro.inicio) ?? Date.now();
      const fim = proximo && proximo.inicio <= corte ? proximo.inicio : corte;
      // Duração real, mesmo abaixo de 1/30 s: a montagem refaz a linha do tempo a 30 quadros por segundo.
      const duracao = Math.max(0.001, (fim - quadro.inicio) / 1000);
      linhas.push(`file '${quadro.arquivo}'`, `duration ${duracao.toFixed(4)}`);
    });
    const ultimo = this.quadros.at(-1);
    if (ultimo) linhas.push(`file '${ultimo.arquivo}'`);
    const caminho = join(this.pasta, 'quadros.txt');
    writeFileSync(caminho, `${linhas.join('\n')}\n`);
    return caminho;
  }
}
