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
}
