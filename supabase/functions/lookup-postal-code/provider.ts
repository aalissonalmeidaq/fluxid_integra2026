// Porta do provedor de CEP (contracts/consulta-de-cep.md). A tela só conhece a resposta padronizada do FluxID; trocar de
// provedor é implementar esta porta, sem mudar o contrato nem a tela.

export interface PostalAddress {
  postal_code: string;
  street: string;
  district: string;
  city: string;
  state: string;
  ibge_code: string | null;
}

export type PostalLookup = PostalAddress | 'NOT_FOUND';

export interface PostalCodeProvider {
  // `postalCode` já chega normalizado, com 8 dígitos. Lança quando o provedor falha ou responde algo suspeito
  // (o manipulador trata qualquer exceção como "serviço indisponível").
  lookup(postalCode: string, signal: AbortSignal): Promise<PostalLookup>;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
