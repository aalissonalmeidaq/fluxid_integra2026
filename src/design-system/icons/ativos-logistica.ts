import type { DesenhoDoGrupo } from './tipos';

const CILINDRO = 'M8 8 C8 6.3 9.8 5 12 5 C14.2 5 16 6.3 16 8 V19 C16 20 15 21 14 21 H10 C9 21 8 20 8 19 Z';
const CAIXA = 'M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z';
const TELHADO = 'M3 10 L12 4 L21 10 V20 H3 Z';

// Grupo ativos e logística: cilindro, sensor, caminhão, armazém, entrega e inventário (RF-027).
export const ativosLogistica: DesenhoDoGrupo<'ativos-logistica'> = {
  cilindro: [
    { t: 'path', d: CILINDRO, apoio: true },
    { t: 'path', d: CILINDRO },
    { t: 'line', x1: 12, y1: 5, x2: 12, y2: 3 },
    { t: 'line', x1: 8, y1: 11, x2: 16, y2: 11 },
  ],
  sensor: [
    { t: 'rect', x: 7, y: 7, w: 10, h: 10, rx: 2, apoio: true },
    { t: 'rect', x: 7, y: 7, w: 10, h: 10, rx: 2 },
    { t: 'circle', cx: 12, cy: 12, r: 1.5 },
    { t: 'line', x1: 10, y1: 7, x2: 10, y2: 4 },
    { t: 'line', x1: 14, y1: 7, x2: 14, y2: 4 },
    { t: 'line', x1: 10, y1: 17, x2: 10, y2: 20 },
    { t: 'line', x1: 14, y1: 17, x2: 14, y2: 20 },
    { t: 'line', x1: 7, y1: 10, x2: 4, y2: 10 },
    { t: 'line', x1: 7, y1: 14, x2: 4, y2: 14 },
    { t: 'line', x1: 17, y1: 10, x2: 20, y2: 10 },
    { t: 'line', x1: 17, y1: 14, x2: 20, y2: 14 },
  ],
  caminhao: [
    { t: 'rect', x: 3, y: 7, w: 11, h: 9, rx: 1, apoio: true },
    { t: 'rect', x: 3, y: 7, w: 11, h: 9, rx: 1 },
    { t: 'path', d: 'M14 10 H18 L21 13 V16 H14 Z' },
    { t: 'circle', cx: 7, cy: 18, r: 2 },
    { t: 'circle', cx: 17, cy: 18, r: 2 },
  ],
  armazem: [
    { t: 'path', d: TELHADO, apoio: true },
    { t: 'path', d: TELHADO },
    { t: 'rect', x: 9, y: 13, w: 6, h: 7 },
  ],
  entrega: [
    { t: 'path', d: CAIXA, apoio: true },
    { t: 'path', d: CAIXA },
    { t: 'polyline', pontos: '4 8 12 12 20 8' },
    { t: 'line', x1: 12, y1: 12, x2: 12, y2: 20 },
  ],
  inventario: [
    { t: 'rect', x: 5, y: 4, w: 14, h: 17, rx: 2, apoio: true },
    { t: 'rect', x: 5, y: 4, w: 14, h: 17, rx: 2 },
    { t: 'rect', x: 9, y: 3, w: 6, h: 3, rx: 1 },
    { t: 'line', x1: 9, y1: 10, x2: 15, y2: 10 },
    { t: 'line', x1: 9, y1: 14, x2: 15, y2: 14 },
    { t: 'line', x1: 9, y1: 18, x2: 13, y2: 18 },
  ],
};
