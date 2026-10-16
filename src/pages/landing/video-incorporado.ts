// Vídeos tocados dentro da própria landing (Spec 011, adaptação ao pitch). A página guarda o endereço público do vídeo no YouTube (fonte
// única, em landing-content.ts) e só monta o player incorporado quando a pessoa pede para assistir. O player usa o domínio de privacidade
// reforçada do YouTube (youtube-nocookie.com): nada de terceiros é carregado antes do clique.

const ID_VALIDO = /^[A-Za-z0-9_-]{11}$/;

export function idDoVideo(endereco: string): string | null {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  let id: string | null = null;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (url.hostname === 'www.youtube.com' && url.pathname === '/watch') id = url.searchParams.get('v');
  return id && ID_VALIDO.test(id) ? id : null;
}

export function enderecoIncorporado(id: string): string {
  if (!ID_VALIDO.test(id)) throw new Error('Identificador de vídeo inválido.');
  const parametros = new URLSearchParams({ autoplay: '1', rel: '0', playsinline: '1' });
  return `https://www.youtube-nocookie.com/embed/${id}?${parametros.toString()}`;
}
