import { contrastRatio } from '@/design-system/contrast';
import { cores } from '@/design-system/tokens';

export type TomDoFundo = 'claro' | 'escuro';

const hex = (canal: number): string => Math.round(Math.min(255, Math.max(0, canal))).toString(16).padStart(2, '0');

// Tom de uma cor de fundo calculada pelo navegador (getComputedStyle): "escuro" quando o branco contrasta mais que o navy sobre ela,
// "claro" no caso contrário. Fundo transparente (ou quase) não decide: quem chama sobe para o elemento de trás. Usado pelo sanduíche
// fixo da landing, que não tem caixa (AGENTS.md) e por isso troca entre branco e navy conforme a seção que passa por baixo.
export function tomDaCor(cor: string): TomDoFundo | null {
  const numeros = (cor.match(/[\d.]+/g) ?? []).map(Number);
  if (numeros.length < 3 || numeros.some(Number.isNaN)) return null;
  const [vermelho = 0, verde = 0, azul = 0, opacidade = 1] = numeros;
  if (opacidade < 0.5) return null;
  const fundo = `#${hex(vermelho)}${hex(verde)}${hex(azul)}`;
  return contrastRatio(cores.branco, fundo) >= contrastRatio(cores.navy, fundo) ? 'escuro' : 'claro';
}

// Tom do que está por baixo de um ponto da tela, ignorando o próprio elemento flutuante (e o que estiver dentro dele). Sobe pelos
// ancestrais até achar um fundo opaco; as seções escuras da landing pintam o fundo com degradê (background-image), então a marca
// .landing-escuro também decide. Sem elementsFromPoint (jsdom), devolve null.
export function tomSobOPonto(x: number, y: number, ignorar: Element): TomDoFundo | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  const alvo = document.elementsFromPoint(x, y).find((elemento) => !ignorar.contains(elemento));
  for (let elemento: Element | null = alvo ?? null; elemento; elemento = elemento.parentElement) {
    const tom = tomDaCor(getComputedStyle(elemento).backgroundColor);
    if (tom) return tom;
    if (elemento.classList.contains('landing-escuro')) return 'escuro';
  }
  return null;
}
