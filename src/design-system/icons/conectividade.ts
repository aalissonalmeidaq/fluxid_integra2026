import type { DesenhoDoGrupo } from './tipos';

const NUVEM =
  'M7 19 H17 C19.8 19 21 17 21 15 C21 13 19.5 11.5 17.5 11.3 C17 8 14.8 6 12 6 C9.2 6 7.2 8 6.7 10.8 C4.5 11.2 3 12.8 3 15 C3 17.2 4.5 19 7 19 Z';

// Grupo conectividade: antena, GPS, rede, nuvem, sincronizar e sem sinal (RF-027).
export const conectividade: DesenhoDoGrupo<'conectividade'> = {
  antena: [
    { t: 'line', x1: 12, y1: 11, x2: 12, y2: 20 },
    { t: 'line', x1: 9, y1: 20, x2: 15, y2: 20 },
    { t: 'circle', cx: 12, cy: 9, r: 1 },
    { t: 'path', d: 'M8.5 5.5 C7.5 6.5 7 7.7 7 9 C7 10.3 7.5 11.5 8.5 12.5' },
    { t: 'path', d: 'M15.5 5.5 C16.5 6.5 17 7.7 17 9 C17 10.3 16.5 11.5 15.5 12.5' },
    { t: 'path', d: 'M5.7 3.7 C4.3 5.2 3.5 7 3.5 9 C3.5 11 4.3 12.8 5.7 14.3' },
    { t: 'path', d: 'M18.3 3.7 C19.7 5.2 20.5 7 20.5 9 C20.5 11 19.7 12.8 18.3 14.3' },
  ],
  gps: [
    { t: 'circle', cx: 12, cy: 12, r: 6, apoio: true },
    { t: 'circle', cx: 12, cy: 12, r: 6 },
    { t: 'circle', cx: 12, cy: 12, r: 1 },
    { t: 'line', x1: 12, y1: 3, x2: 12, y2: 6 },
    { t: 'line', x1: 12, y1: 18, x2: 12, y2: 21 },
    { t: 'line', x1: 3, y1: 12, x2: 6, y2: 12 },
    { t: 'line', x1: 18, y1: 12, x2: 21, y2: 12 },
  ],
  rede: [
    { t: 'circle', cx: 12, cy: 6, r: 2.5, apoio: true },
    { t: 'circle', cx: 6, cy: 18, r: 2.5, apoio: true },
    { t: 'circle', cx: 18, cy: 18, r: 2.5, apoio: true },
    { t: 'circle', cx: 12, cy: 6, r: 2.5 },
    { t: 'circle', cx: 6, cy: 18, r: 2.5 },
    { t: 'circle', cx: 18, cy: 18, r: 2.5 },
    { t: 'line', x1: 10.8, y1: 8.2, x2: 7.2, y2: 15.8 },
    { t: 'line', x1: 13.2, y1: 8.2, x2: 16.8, y2: 15.8 },
    { t: 'line', x1: 8.5, y1: 18, x2: 15.5, y2: 18 },
  ],
  nuvem: [{ t: 'path', d: NUVEM, apoio: true }, { t: 'path', d: NUVEM }],
  sincronizar: [
    { t: 'path', d: 'M5 12 C5 8.1 8.1 5 12 5 C14.4 5 16.5 6.2 17.8 8' },
    { t: 'polyline', pontos: '18.5 4 18.5 8 14.5 8' },
    { t: 'path', d: 'M19 12 C19 15.9 15.9 19 12 19 C9.6 19 7.5 17.8 6.2 16' },
    { t: 'polyline', pontos: '5.5 20 5.5 16 9.5 16' },
  ],
  'sem-sinal': [
    { t: 'path', d: 'M5 10 C9 6.5 15 6.5 19 10' },
    { t: 'path', d: 'M8 13.5 C10.3 11.6 13.7 11.6 16 13.5' },
    { t: 'circle', cx: 12, cy: 17, r: 0.5 },
    { t: 'line', x1: 4, y1: 4, x2: 20, y2: 20 },
  ],
};
