import type { DesenhoDoGrupo } from './tipos';

const ESCUDO = 'M12 3 L20 6 V11 C20 16.5 16.5 19.5 12 21 C7.5 19.5 4 16.5 4 11 V6 Z';
const ALERTA = 'M12 3 L21 19 H3 Z';
const LACRE = 'M7 9 L12 3 L17 9 V20 C17 20.6 16.6 21 16 21 H8 C7.4 21 7 20.6 7 20 Z';

// Grupo segurança: escudo, lacre, bloqueio, alerta, rompimento e verificado (RF-027).
export const seguranca: DesenhoDoGrupo<'seguranca'> = {
  escudo: [{ t: 'path', d: ESCUDO, apoio: true }, { t: 'path', d: ESCUDO }],
  // Etiqueta de selo com furo e linhas de identificação: distinta do cadeado do ícone de bloqueio.
  lacre: [
    { t: 'path', d: LACRE, apoio: true },
    { t: 'path', d: LACRE },
    { t: 'circle', cx: 12, cy: 8, r: 1 },
    { t: 'line', x1: 10, y1: 14, x2: 14, y2: 14 },
    { t: 'line', x1: 10, y1: 17, x2: 14, y2: 17 },
  ],
  bloqueio: [
    { t: 'rect', x: 5, y: 10, w: 14, h: 10, rx: 2, apoio: true },
    { t: 'rect', x: 5, y: 10, w: 14, h: 10, rx: 2 },
    { t: 'path', d: 'M8 10 V7 C8 5 9.8 3 12 3 C14.2 3 16 5 16 7 V10' },
    { t: 'line', x1: 12, y1: 14, x2: 12, y2: 16 },
  ],
  alerta: [
    { t: 'path', d: ALERTA, apoio: true },
    { t: 'path', d: ALERTA },
    { t: 'line', x1: 12, y1: 9, x2: 12, y2: 13.5 },
    { t: 'circle', cx: 12, cy: 16, r: 0.5 },
  ],
  rompimento: [
    { t: 'path', d: 'M10 7 H7 C4.5 7 3 8.8 3 10 C3 11.2 4.5 13 7 13 H10' },
    { t: 'path', d: 'M14 11 H17 C19.5 11 21 12.8 21 14 C21 15.2 19.5 17 17 17 H14' },
    { t: 'line', x1: 12, y1: 4, x2: 12, y2: 6 },
    { t: 'line', x1: 12, y1: 18, x2: 12, y2: 20 },
  ],
  verificado: [
    { t: 'circle', cx: 12, cy: 12, r: 9, apoio: true },
    { t: 'circle', cx: 12, cy: 12, r: 9 },
    { t: 'polyline', pontos: '8 12.5 11 15.5 16 9' },
  ],
};
