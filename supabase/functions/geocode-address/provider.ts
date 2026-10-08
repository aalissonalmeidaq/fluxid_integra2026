// Porta do provedor de geocodificação (RF-065). A tela só conhece a resposta padronizada do FluxID; trocar de provedor é
// implementar esta porta, sem mudar o contrato nem a tela.

export interface GeocodeQuery {
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  // Vazio quando a pessoa não informou; quando presente, tem 8 dígitos.
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
  // Lança quando o provedor falha ou responde algo suspeito (o manipulador trata qualquer exceção como "serviço indisponível").
  geocode(query: GeocodeQuery, signal: AbortSignal): Promise<GeocodeResult>;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
