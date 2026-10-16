// Cálculo do prejuízo apresentado no pitch (Spec 011, adaptação ao pitch). A página não digita os totais: ela os calcula a partir dos
// valores de referência levantados com a empresa (custo de cada capacidade de cilindro e quantidade perdida no ano), para os números da
// tela nunca divergirem da fonte. Os valores em reais são truncados (sem arredondar para cima), como no roteiro do pitch.

export interface CustoPorCapacidade {
  capacidade: string;
  valor: number;
}

export interface Prejuizo {
  patrimonioMedio: number;
  porAno: number;
  porMes: number;
  perdasPorMes: number;
  diasEntrePerdas: number;
}

const DIAS_NO_ANO = 365;
const MESES_NO_ANO = 12;

export function patrimonioMedio(custos: readonly CustoPorCapacidade[]): number {
  if (custos.length === 0) return 0;
  return custos.reduce((soma, item) => soma + item.valor, 0) / custos.length;
}

export function calcularPrejuizo(custos: readonly CustoPorCapacidade[], perdidosNoAno: number): Prejuizo {
  const medio = patrimonioMedio(custos);
  const porAno = medio * perdidosNoAno;
  return {
    patrimonioMedio: medio,
    porAno,
    porMes: porAno / MESES_NO_ANO,
    perdasPorMes: perdidosNoAno / MESES_NO_ANO,
    diasEntrePerdas: perdidosNoAno > 0 ? DIAS_NO_ANO / perdidosNoAno : 0,
  };
}

// Patrimônio preservado se a solução evitar `perdasEvitadas` perdas (o exemplo do pitch: 1 cilindro, 10 cilindros).
export function patrimonioPreservado(perdasEvitadas: number, medio: number): number {
  return Math.max(0, perdasEvitadas) * medio;
}

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatarInteiro(valor: number): string {
  return INTEIRO.format(Math.trunc(valor));
}

export function formatarReais(valor: number): string {
  return `R$\u00a0${formatarInteiro(valor)}`;
}
