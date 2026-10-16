import React from 'react';

// Pontos da cadeia de custódia decorativa: as mesmas cinco posições do painel de marca da entrada (Spec 005), em outro enquadramento.
const PONTOS = [
  { cx: 40, cy: 330 },
  { cx: 125, cy: 255 },
  { cx: 215, cy: 215 },
  { cx: 300, cy: 140 },
  { cx: 370, cy: 70 },
];

// Cadeia de custódia ao fundo da abertura: só geometria, sem texto, estática e na cor dos tokens. Decorativa (fora da leitura).
export function CadeiaDecorativa(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-decorativo
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 -z-10 size-full opacity-25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <polyline points={PONTOS.map(({ cx, cy }) => `${cx},${cy}`).join(' ')} className="text-azul-ciano" strokeLinejoin="round" />
      <path d="M370 70 C 400 190, 300 330, 40 330" className="text-azul-royal" strokeDasharray="4 6" />
      {PONTOS.map(({ cx, cy }, indice) => (
        <circle key={indice} cx={cx} cy={cy} r={indice === 3 ? 9 : 5} fill="currentColor" stroke="none" className="text-azul-ciano" />
      ))}
    </svg>
  );
}
