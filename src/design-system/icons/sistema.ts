import type { DesenhoDoGrupo } from './tipos';

const DOCUMENTO = 'M6 3 H14 L18 7 V21 H6 Z';
const FUNIL = 'M4 5 H20 L14 12.5 V19 L10 21 V12.5 Z';
const SINO = 'M6 16 V11 C6 7.7 8.7 5 12 5 C15.3 5 18 7.7 18 11 V16 L20 18 H4 Z';

// Grupo sistema: dashboard, usuário, configurações, relatórios, filtros e notificações (RF-027).
export const sistema: DesenhoDoGrupo<'sistema'> = {
  dashboard: [
    { t: 'rect', x: 4, y: 4, w: 7, h: 7, rx: 1, apoio: true },
    { t: 'rect', x: 13, y: 10, w: 7, h: 10, rx: 1, apoio: true },
    { t: 'rect', x: 4, y: 4, w: 7, h: 7, rx: 1 },
    { t: 'rect', x: 13, y: 4, w: 7, h: 4, rx: 1 },
    { t: 'rect', x: 13, y: 10, w: 7, h: 10, rx: 1 },
    { t: 'rect', x: 4, y: 13, w: 7, h: 7, rx: 1 },
  ],
  usuario: [
    { t: 'circle', cx: 12, cy: 8, r: 4, apoio: true },
    { t: 'circle', cx: 12, cy: 8, r: 4 },
    { t: 'path', d: 'M4 20 C4 16.5 7.6 14 12 14 C16.4 14 20 16.5 20 20' },
  ],
  configuracoes: [
    { t: 'line', x1: 4, y1: 8, x2: 20, y2: 8 },
    { t: 'line', x1: 4, y1: 16, x2: 20, y2: 16 },
    { t: 'circle', cx: 9, cy: 8, r: 2.5, apoio: true },
    { t: 'circle', cx: 15, cy: 16, r: 2.5, apoio: true },
    { t: 'circle', cx: 9, cy: 8, r: 2.5 },
    { t: 'circle', cx: 15, cy: 16, r: 2.5 },
  ],
  relatorios: [
    { t: 'path', d: DOCUMENTO, apoio: true },
    { t: 'path', d: DOCUMENTO },
    { t: 'polyline', pontos: '14 3 14 7 18 7' },
    { t: 'line', x1: 9, y1: 17, x2: 9, y2: 14 },
    { t: 'line', x1: 12, y1: 17, x2: 12, y2: 11 },
    { t: 'line', x1: 15, y1: 17, x2: 15, y2: 13 },
  ],
  filtros: [{ t: 'path', d: FUNIL, apoio: true }, { t: 'path', d: FUNIL }],
  notificacoes: [
    { t: 'path', d: SINO, apoio: true },
    { t: 'path', d: SINO },
    { t: 'line', x1: 12, y1: 3, x2: 12, y2: 5 },
    { t: 'line', x1: 10, y1: 21, x2: 14, y2: 21 },
  ],
};
