// Estrutura da documentação de cada componente do design system (RF-011, CA-010). O catálogo lê estes registros e o
// teste catalogo-completo.test.ts exige todos os campos preenchidos para cada componente exportado.
export interface DocumentacaoDeComponente {
  nome: string;
  descricao: string;
  variantes: readonly string[];
  estados: readonly string[];
  orientacaoDeUso: string;
  acessibilidade: readonly string[];
}
