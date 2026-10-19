// Ponto do mapa. `confirmed: false` desenha o marcador na cor de "ainda sem confirmação"; ausente, conta como confirmado.
export interface MapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  confirmed?: boolean;
  // Linhas de texto do balão (por exemplo, cliente e cidade).
  details?: readonly string[];
  href?: string;
  // Endereço aproximado das coordenadas no balão: `known` devolve o já consultado (ou null) e `resolve` consulta, depois do clique
  // da pessoa em "Mostrar endereço". Mantenha o objeto estável entre renderizações para o balão não fechar.
  address?: { known: () => string | null; resolve: () => Promise<string | null> };
}

// `emphasis` diferencia, além da cor, pela espessura e pelo traço: 'destaque' (a geocerca esperada) e 'discreta' (as próximas).
// `label` aparece como dica ao passar o ponteiro; o texto ao lado do mapa continua sendo a alternativa acessível.
interface ShapeStyle { emphasis?: 'destaque' | 'discreta'; label?: string }

export type MapShape =
  | ({ kind: 'circle'; center: { latitude: number; longitude: number }; radiusM: number } & ShapeStyle)
  | ({ kind: 'polygon'; vertices: readonly { latitude: number; longitude: number }[] } & ShapeStyle);
