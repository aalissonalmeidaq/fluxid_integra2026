import type { NomeDeCor } from '../tokens';

// Pares de cores (texto e fundo) usados pelos componentes. Cada par atende 4,5:1 (texto normal) e é verificado pelos
// testes de cada componente e pela verificação de contraste dos tokens (CA-002).
export interface ParDeCores {
  texto: NomeDeCor;
  fundo: NomeDeCor;
}

export const CORES_DAS_VARIANTES: Record<'primario' | 'secundario' | 'perigoso', ParDeCores> = {
  primario: { texto: 'branco', fundo: 'azul-profundo' },
  secundario: { texto: 'azul-profundo', fundo: 'branco' },
  perigoso: { texto: 'branco', fundo: 'erro' },
};

export const CORES_DOS_ALERTAS: Record<'informacao' | 'sucesso' | 'alerta' | 'erro', ParDeCores> = {
  informacao: { texto: 'azul-profundo', fundo: 'info-fundo' },
  sucesso: { texto: 'verde-acessivel', fundo: 'sucesso-fundo' },
  alerta: { texto: 'alerta-texto', fundo: 'alerta-fundo' },
  erro: { texto: 'erro', fundo: 'erro-fundo' },
};

export const CORES_DOS_SELOS: Record<'ativo' | 'conectado' | 'pendente' | 'bloqueado' | 'erro', ParDeCores> = {
  ativo: { texto: 'verde-acessivel', fundo: 'sucesso-fundo' },
  conectado: { texto: 'azul-profundo', fundo: 'info-fundo' },
  pendente: { texto: 'alerta-texto', fundo: 'alerta-fundo' },
  bloqueado: { texto: 'grafite', fundo: 'cinza-gelo' },
  erro: { texto: 'erro', fundo: 'erro-fundo' },
};
