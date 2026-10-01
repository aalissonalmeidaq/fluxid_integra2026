// Classes compartilhadas por campo de texto, seletor e área de texto: alvo de 44 px, borda de componente com 3:1 de
// contraste e borda de erro quando inválido (RF-008, RF-010).
const BASE =
  'mt-1 block min-h-alvo w-full rounded-controle border bg-branco px-4 text-corpo text-grafite disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-60';

export function classesDoControle(erro: boolean): string {
  return `${BASE} ${erro ? 'border-erro' : 'border-borda-controle'}`;
}
