// Porta do provedor de geocodificação (RF-065). A tela só conhece a resposta padronizada do FluxID; trocar de provedor é
// implementar esta porta e registrá-la em `registry.ts`, sem mudar o contrato nem a tela.

// Somente estes campos podem sair para o provedor externo (o país é fixo e acrescentado pelo adaptador). Nome, documento,
// contatos, motorista, cliente, organização e identificação do cilindro nunca fazem parte da consulta.
export interface GeocodeQuery {
  street: string;
  number: string;
  city: string;
  state: string;
  // Sempre presente: 8 dígitos.
  postal_code: string;
}

// `address`: ponto no número; `street`: só a rua; `locality`: bairro, cidade ou região (pouco preciso).
export type GeocodePrecision = 'address' | 'street' | 'locality';

export interface GeocodeLocation {
  latitude: number;
  longitude: number;
  display_name: string;
  precision: GeocodePrecision;
}

export type GeocodeResult = GeocodeLocation | 'NOT_FOUND';

export interface GeocodingProvider {
  // Nome estável do provedor: identifica o balde global de limite e o registro de operação (nunca o endereço).
  readonly name: string;
  // Lança `GeocodingProviderError` (ou `GeocodingBlockedError`) quando o provedor falha ou responde algo suspeito.
  geocode(query: GeocodeQuery, signal: AbortSignal): Promise<GeocodeResult>;
}

// Falhas do provedor com código fixo: nunca carregam endereço, URL nem a mensagem original da rede, para poderem ser registradas.
export type ProviderErrorCode = 'provider_status' | 'provider_body' | 'provider_network' | 'provider_timeout' | 'address_invalid';

export class GeocodingProviderError extends Error {
  constructor(readonly code: ProviderErrorCode) {
    super(code);
    this.name = 'GeocodingProviderError';
  }
}

// A consulta foi impedida antes de sair do servidor (por exemplo, chamada real durante testes automatizados).
export type BlockedCode = 'TEST_ENVIRONMENT_BLOCKED';

export class GeocodingBlockedError extends Error {
  constructor(readonly code: BlockedCode) {
    super(code);
    this.name = 'GeocodingBlockedError';
  }
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
