import React from 'react';

// Legenda do mapa do rastreamento (Spec 015): repete em texto o que a forma dos marcadores diz (map-view.css), para quem vê o mapa não
// precisar adivinhar qual ponto é o celular e qual é o lacre. Quem usa leitor de tela tem a cronologia, que nomeia cada ponto.
export function MapLegend(): React.JSX.Element {
  return (
    <ul aria-label="Legenda do mapa" className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-legenda text-texto-secundario">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-4 shrink-0 rounded-full bg-azul-profundo" />
        Celular do motorista: ponto azul e trajeto contínuo
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-grafite bg-ciano-acessivel" />
        Lacre: ponto ciano com borda escura e trajeto pontilhado
      </li>
      <li>Sem traço entre pontos: não houve posição naquele intervalo</li>
    </ul>
  );
}
