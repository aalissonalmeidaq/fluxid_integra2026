// Link assinado do Storage no destino que o aplicativo usa (Spec 015). A Edge Function assina com o endereço que ela enxerga: no Supabase
// local e na LAN é o interno do contêiner (o host kong, na porta 8000), inalcançável pelo navegador. O link vale pelo caminho e pelo token, então a
// base passa a ser a do destino ativo. Só caminhos de objeto assinado são aceitos: nada de redirecionar para outro lugar.
const SIGNED_PATH = '/storage/v1/object/sign/';

export function toEndpointStorageUrl(signedUrl: string, endpointUrl: string): string | null {
  try {
    const signed = new URL(signedUrl);
    if (!/^https?:$/.test(signed.protocol) || !signed.pathname.startsWith(SIGNED_PATH)) return null;
    return `${endpointUrl.replace(/\/+$/, '')}${signed.pathname}${signed.search}`;
  } catch {
    return null;
  }
}
