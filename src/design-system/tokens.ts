// Fonte única dos tokens do design system FluxID (Spec 003, RF-001). Os valores vêm das pranchas de identidade em
// specs/003-design-system-telas/referencias/. tokens.css é gerado daqui por
// `npm run tokens:gerar`; não edite à mão. Este é o único arquivo de src/ onde cores literais são permitidas.

export const cores = {
  'azul-profundo': '#1249B8',
  'azul-royal': '#1766D9',
  'azul-ciano': '#23AFE5',
  'ciano-acessivel': '#08709C',
  'verde-vivo': '#37D20A',
  'verde-escuro': '#159B19',
  'verde-acessivel': '#0F7A14',
  navy: '#163B72',
  grafite: '#26384A',
  branco: '#FFFFFF',
  'cinza-gelo': '#F3F7FA',
  'texto-secundario': '#5B6F84',
  'borda-controle': '#6B7F94',
  'borda-suave': '#D7E2EE',
  erro: '#B42318',
  'erro-fundo': '#FDECEA',
  'alerta-texto': '#7A4B00',
  'alerta-fundo': '#FFF4D6',
  'alerta-faixa': '#F5B301',
  'sucesso-fundo': '#E7F6EA',
  'info-fundo': '#E8F1FC',
} as const;

export type NomeDeCor = keyof typeof cores;

// Cores da prancha sem contraste para texto sobre fundo claro: só decoração, logotipo ou elementos grandes (RF-005).
export const CORES_SO_DECORATIVAS: readonly NomeDeCor[] = ['azul-ciano', 'verde-vivo'];

export const FUNDOS_CLAROS: readonly NomeDeCor[] = ['branco', 'cinza-gelo', 'erro-fundo', 'alerta-fundo', 'sucesso-fundo', 'info-fundo'];

export type Finalidade = 'texto-normal' | 'texto-grande' | 'componente' | 'decorativo';

export interface UsoDeCor {
  texto: string;
  fundo: string;
  finalidade: Finalidade;
}

function usos(textos: readonly NomeDeCor[], fundos: readonly NomeDeCor[], finalidade: Finalidade): UsoDeCor[] {
  return textos.flatMap((texto) => fundos.map((fundo) => ({ texto, fundo, finalidade })));
}

const CLAROS_BASE: readonly NomeDeCor[] = ['branco', 'cinza-gelo'];

// Combinações permitidas (RF-004). Qualquer par fora desta lista não pode ser usado nas telas.
export const usosDeCor: readonly UsoDeCor[] = [
  ...usos(['grafite', 'navy', 'azul-profundo', 'azul-royal', 'ciano-acessivel', 'verde-acessivel', 'erro', 'texto-secundario'], CLAROS_BASE, 'texto-normal'),
  ...usos(['erro'], ['erro-fundo'], 'texto-normal'),
  ...usos(['alerta-texto'], ['alerta-fundo'], 'texto-normal'),
  ...usos(['verde-acessivel'], ['sucesso-fundo'], 'texto-normal'),
  ...usos(['azul-profundo'], ['info-fundo'], 'texto-normal'),
  ...usos(['grafite'], ['alerta-faixa'], 'texto-normal'),
  ...usos(['branco'], ['azul-profundo', 'azul-royal', 'navy', 'verde-acessivel', 'erro', 'ciano-acessivel'], 'texto-normal'),
  ...usos(['verde-vivo'], ['navy'], 'texto-normal'),
  ...usos(['azul-ciano'], ['navy'], 'texto-grande'),
  ...usos(['verde-vivo', 'azul-ciano'], ['azul-profundo'], 'texto-grande'),
  ...usos(['verde-escuro', 'borda-controle', 'azul-royal', 'erro', 'grafite'], CLAROS_BASE, 'componente'),
  ...usos(['verde-vivo'], ['cinza-gelo'], 'decorativo'),
  ...usos(['borda-suave'], ['branco'], 'decorativo'),
];

export interface Gradiente {
  de: string;
  para: string;
  textoSobre: readonly string[];
}

// Gradientes oficiais, sempre decorativos (RF-006). Só a profundidade admite texto (branco).
export const gradientes: Record<'azul-digital' | 'conexao-segura' | 'profundidade', Gradiente> = {
  'azul-digital': { de: 'azul-profundo', para: 'azul-ciano', textoSobre: [] },
  'conexao-segura': { de: 'verde-vivo', para: 'azul-royal', textoSobre: [] },
  profundidade: { de: 'navy', para: 'azul-profundo', textoSobre: ['branco'] },
};

export const tipografia = {
  familia: ['Montserrat Variable', 'Montserrat', 'Arial', 'sans-serif'],
  tamanhos: { display: 64, h1: 48, h2: 36, h3: 24, corpo: 16, legenda: 12 },
  tamanhosEstreitos: { display: 36, h1: 36, h2: 24, h3: 24, corpo: 16, legenda: 12 },
  pesos: { light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
  entrelinhas: { display: 1, h1: 1, h2: 1, h3: 1.25, corpo: 1.5, legenda: 1.5 },
} as const;

// Nomes em múltiplos de 4 px, iguais à escala padrão do Tailwind (p-4 = 16 px).
// O 0 é ausência de medida (min-w-0, inset-0), não um valor da escala.
export const espacamento = { 0: 0, 1: 4, 2: 8, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 } as const;

// Alvo de toque mínimo do PRD (RF-008, CA-003); fora da escala de espaçamento por ser medida de acessibilidade.
export const ALVO_MINIMO = 44;

export const raios = { controle: 8, card: 12 } as const;

export const sombras = {
  card: '0 1px 2px rgba(22, 59, 114, 0.08), 0 1px 3px rgba(22, 59, 114, 0.06)',
  dialogo: '0 8px 24px rgba(22, 59, 114, 0.16)',
} as const;

export const grade = {
  desktop: { colunas: 12, margem: 32, calha: 16 },
  tablet: { colunas: 8, margem: 24, calha: 16 },
  mobile: { colunas: 4, margem: 16, calha: 16 },
} as const;

export const containers = { compacto: 720, padrao: 960, largo: 1200 } as const;

// Pontos de quebra definidos pelo plano: mobile até 767 px, tablet de 768 a 1023 px e desktop a partir de 1024 px.
export const pontosDeQuebra = { tablet: 768, desktop: 1024 } as const;
