import type { MapPoint } from './map-types';

// Conteúdo do balão de um ponto do mapa, montado com `textContent` (nunca HTML). Separado do Leaflet para ser testável.
// Com `address`, o balão mostra o endereço aproximado das coordenadas: o já conhecido aparece ao abrir; senão, o botão
// "Mostrar endereço" traz o aviso de que as coordenadas vão ao OpenStreetMap/Nominatim, e o clique é a confirmação. A linha do
// endereço é uma mensagem de status: o leitor de tela ouve "Buscando o endereço…" e o resultado sem perder o foco.
export const ADDRESS_NOTICE = 'As coordenadas vão ao OpenStreetMap/Nominatim; o endereço é aproximado.';

export interface PopupContent {
  element: HTMLElement;
  // Chamado sempre que o balão abre: atualiza a linha do endereço com o que já se sabe.
  refresh: () => void;
}

export function popupContent(point: MapPoint): PopupContent {
  const root = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = point.label;
  root.append(name);
  for (const line of point.details ?? []) {
    root.append(document.createElement('br'));
    root.append(document.createTextNode(line));
  }
  if (point.href) {
    root.append(document.createElement('br'));
    const link = document.createElement('a');
    link.href = point.href;
    link.textContent = 'Abrir a unidade';
    root.append(link);
  }

  const address = point.address;
  if (!address) return { element: root, refresh: () => undefined };

  const block = document.createElement('div');
  block.className = 'fluxid-map-popup-address';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  block.append(status);
  root.append(block);

  let busy = false;
  const show = (text: string): void => {
    block.querySelector('button')?.remove();
    block.querySelector('.fluxid-map-popup-notice')?.remove();
    status.textContent = text;
  };
  const offerLookup = (): void => {
    status.textContent = '';
    if (block.querySelector('button')) return;
    const notice = document.createElement('p');
    notice.className = 'fluxid-map-popup-notice';
    notice.textContent = ADDRESS_NOTICE;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Mostrar endereço';
    button.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      show('Buscando o endereço…');
      void address.resolve()
        .then((found) => show(found ? `Endereço aproximado: ${found}` : 'Não foi possível localizar o endereço desta posição.'))
        .catch(() => show('Não foi possível localizar o endereço desta posição.'))
        .finally(() => { busy = false; });
    });
    block.append(notice, button);
  };

  const refresh = (): void => {
    if (busy) return;
    const known = address.known();
    if (known) show(`Endereço aproximado: ${known}`);
    else offerLookup();
  };
  refresh();
  return { element: root, refresh };
}
