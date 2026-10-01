import type { DesenhoDoGrupo } from './tipos';

const PINO = 'M12 21 C12 21 5 14.5 5 10 C5 6.1 8.1 3 12 3 C15.9 3 19 6.1 19 10 C19 14.5 12 21 12 21 Z';
const GEOCERCA = 'M5 8 L12 4 L19 8 L19 16 L12 20 L5 16 Z';
const MAPA = 'M4 6 L9 4 L15 6 L20 4 V18 L15 20 L9 18 L4 20 Z';

// Grupo rastreabilidade: localização, rota, histórico, geocerca, mapa e última leitura (RF-027).
export const rastreabilidade: DesenhoDoGrupo<'rastreabilidade'> = {
  localizacao: [{ t: 'path', d: PINO, apoio: true }, { t: 'path', d: PINO }, { t: 'circle', cx: 12, cy: 10, r: 2.5 }],
  rota: [
    { t: 'circle', cx: 6, cy: 18, r: 2 },
    { t: 'circle', cx: 18, cy: 6, r: 2 },
    { t: 'path', d: 'M8 18 H14 C16.5 18 16.5 12 14 12 H10 C7.5 12 7.5 6 10 6 H16' },
  ],
  historico: [
    { t: 'path', d: 'M4 12 C4 7.6 7.6 4 12 4 C16.4 4 20 7.6 20 12 C20 16.4 16.4 20 12 20 C9 20 6.5 18.5 5 16' },
    { t: 'polyline', pontos: '4 20 4 16 8 16' },
    { t: 'polyline', pontos: '12 8 12 12 15 14' },
  ],
  geocerca: [{ t: 'path', d: GEOCERCA, apoio: true }, { t: 'path', d: GEOCERCA }, { t: 'circle', cx: 12, cy: 12, r: 2 }],
  mapa: [
    { t: 'path', d: MAPA, apoio: true },
    { t: 'path', d: MAPA },
    { t: 'line', x1: 9, y1: 4, x2: 9, y2: 18 },
    { t: 'line', x1: 15, y1: 6, x2: 15, y2: 20 },
  ],
  'ultima-leitura': [
    { t: 'path', d: 'M4 8 V4 H8' },
    { t: 'path', d: 'M16 4 H20 V8' },
    { t: 'path', d: 'M20 16 V20 H16' },
    { t: 'path', d: 'M8 20 H4 V16' },
    { t: 'line', x1: 8, y1: 12, x2: 16, y2: 12 },
  ],
};
