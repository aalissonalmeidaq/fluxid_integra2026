import type { GeocodeAddressInput, GeocodedLocation } from '@/application/registry/geocoding-service';

// Sugestão de coordenadas vinda do endereço (RF-065, RF-066): só vale para o endereço em que foi buscada e só vira "geocodificada"
// quando a pessoa confirma. `addressKey` identifica o endereço da busca; se o endereço mudar, a sugestão deixa de valer.
export interface GeocodeSuggestion {
  location: GeocodedLocation;
  addressKey: string;
  confirmed: boolean;
}

export const addressKeyOf = (address: GeocodeAddressInput): string =>
  [address.street, address.number, address.district, address.city, address.state, address.postalCode.replace(/\D/g, '')].map((part) => part.trim().toLowerCase()).join('|');
