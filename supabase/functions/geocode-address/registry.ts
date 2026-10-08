import type { GeocodingProvider } from './provider.ts';
import { NominatimProvider } from './nominatim-provider.ts';

// Seleção do provedor por configuração (GEOCODING_PROVIDER). Trocar o Nominatim por outro serviço é registrar aqui uma nova
// implementação de `GeocodingProvider`; a tela, o contrato e o manipulador não mudam.
export type ProviderFactory = () => GeocodingProvider;

export const DEFAULT_PROVIDERS: Readonly<Record<string, ProviderFactory>> = {
  nominatim: () => new NominatimProvider(),
};

// Nome desconhecido devolve `null`: o manipulador responde "serviço indisponível" em vez de cair em outro provedor sem aviso.
export function createGeocodingProvider(name: string, providers: Readonly<Record<string, ProviderFactory>> = DEFAULT_PROVIDERS): GeocodingProvider | null {
  const factory = Object.hasOwn(providers, name) ? providers[name] : undefined;
  return factory ? factory() : null;
}
