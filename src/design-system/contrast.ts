const HEX = /^#[0-9a-fA-F]{6}$/;

function channel(hex: string, start: number): number {
  const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// Luminância relativa da WCAG 2.2 para uma cor hexadecimal de seis dígitos (#RRGGBB).
export function relativeLuminance(hex: string): number {
  if (!HEX.test(hex)) throw new Error(`Cor inválida: "${hex}". Use hexadecimal de seis dígitos (#RRGGBB).`);
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

// Razão de contraste da WCAG 2.2, de 1 (iguais) a 21 (preto sobre branco).
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
