import { contrastRatio } from './contrast';
import { CORES_SO_DECORATIVAS, FUNDOS_CLAROS, type Finalidade, type UsoDeCor } from './tokens';

export const MINIMO_POR_FINALIDADE: Record<Finalidade, number> = {
  'texto-normal': 4.5,
  'texto-grande': 3,
  componente: 3,
  decorativo: 0,
};

const formatar = (valor: number): string => valor.toFixed(2).replace('.', ',');

type Paleta = Record<string, string>;

// Devolve as violações (vazio quando tudo atende) das combinações declaradas em usosDeCor (CA-002, MS-002).
export function verificarUsos(paleta: Paleta, usos: readonly UsoDeCor[]): string[] {
  const violacoes: string[] = [];
  for (const { texto, fundo, finalidade } of usos) {
    const corTexto = paleta[texto];
    const corFundo = paleta[fundo];
    if (corTexto === undefined || corFundo === undefined) {
      violacoes.push(`Cor desconhecida na combinação ${texto} sobre ${fundo}.`);
      continue;
    }
    if (finalidade !== 'decorativo' && (CORES_SO_DECORATIVAS as readonly string[]).includes(texto) && (FUNDOS_CLAROS as readonly string[]).includes(fundo)) {
      const razaoDecorativa = contrastRatio(corTexto, corFundo);
      violacoes.push(
        `"${texto}" é cor decorativa e não pode ser usada como ${finalidade} sobre o fundo claro "${fundo}" (${formatar(razaoDecorativa)}:1; o mínimo seria ${String(MINIMO_POR_FINALIDADE[finalidade]).replace('.', ',')}:1).`,
      );
      continue;
    }
    const minimo = MINIMO_POR_FINALIDADE[finalidade];
    const razao = contrastRatio(corTexto, corFundo);
    if (razao < minimo) {
      violacoes.push(`${texto} sobre ${fundo} (${finalidade}): ${formatar(razao)}:1 é menor que o mínimo de ${String(minimo).replace('.', ',')}:1.`);
    }
  }
  return violacoes;
}

interface GradienteVerificavel {
  de: string;
  para: string;
  textoSobre: readonly string[];
}

// Texto sobre gradiente só vale se atender 4,5:1 contra o ponto mais crítico dele (RF-006).
export function verificarGradientes(paleta: Paleta, gradientes: Record<string, GradienteVerificavel>): string[] {
  const violacoes: string[] = [];
  for (const [nome, gradiente] of Object.entries(gradientes)) {
    for (const texto of gradiente.textoSobre) {
      const corTexto = paleta[texto];
      const pontas = [paleta[gradiente.de], paleta[gradiente.para]];
      if (corTexto === undefined || pontas.some((ponta) => ponta === undefined)) {
        violacoes.push(`Gradiente "${nome}": cor desconhecida.`);
        continue;
      }
      const pior = Math.min(...pontas.map((ponta) => contrastRatio(corTexto, ponta as string)));
      if (pior < MINIMO_POR_FINALIDADE['texto-normal']) {
        violacoes.push(`Gradiente "${nome}": o texto "${texto}" tem ${formatar(pior)}:1 no ponto mais crítico, abaixo de 4,5:1.`);
      }
    }
  }
  return violacoes;
}
