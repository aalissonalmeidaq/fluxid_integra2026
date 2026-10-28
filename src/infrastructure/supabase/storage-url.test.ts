import { describe, expect, it } from 'vitest';
import { toEndpointStorageUrl } from './storage-url';

// Spec 015 (validação humana de 27/10/2026): no Supabase local e na LAN, a Edge Function assina o arquivo com o endereço interno do
// contêiner (http://kong:8000), que o navegador não alcança; "Baixar CSV" abria uma página de erro. O link vale pelo caminho e pelo token:
// a base passa a ser a do destino que o aplicativo usa. Só caminhos de objeto assinado do Storage são aceitos.
describe('link assinado do Storage no destino ativo', () => {
  const SIGNED = 'http://kong:8000/storage/v1/object/sign/report-exports/org/arquivo.csv?token=abc&download=';

  it('troca a base interna pela do destino ativo, mantendo caminho e token', () => {
    expect(toEndpointStorageUrl(SIGNED, 'http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/storage/v1/object/sign/report-exports/org/arquivo.csv?token=abc&download=');
    expect(toEndpointStorageUrl(SIGNED, 'https://projeto.supabase.co/')).toBe('https://projeto.supabase.co/storage/v1/object/sign/report-exports/org/arquivo.csv?token=abc&download=');
  });

  it('recusa o que não é objeto assinado do Storage ou não é um endereço', () => {
    expect(toEndpointStorageUrl('https://outro.invalid/qualquer', 'http://127.0.0.1:54321')).toBeNull();
    expect(toEndpointStorageUrl('http://kong:8000/storage/v1/object/public/x.csv', 'http://127.0.0.1:54321')).toBeNull();
    expect(toEndpointStorageUrl('javascript:alert(1)', 'http://127.0.0.1:54321')).toBeNull();
    expect(toEndpointStorageUrl('não é url', 'http://127.0.0.1:54321')).toBeNull();
  });
});
