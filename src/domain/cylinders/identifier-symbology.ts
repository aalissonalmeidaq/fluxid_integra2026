import type { IdentifierKind } from './cylinder-types';

export interface Symbology { bcid: 'qrcode' | 'datamatrix'; label: string }

// Só QR Code e Data Matrix geram símbolo (RF-044); NFC e número do casco não têm representação impressa.
const SYMBOLOGIES: Partial<Record<IdentifierKind, Symbology>> = {
  qr_code: { bcid: 'qrcode', label: 'QR Code' },
  data_matrix: { bcid: 'datamatrix', label: 'Data Matrix' },
};

export function symbologyFor(kind: IdentifierKind): Symbology | null {
  return SYMBOLOGIES[kind] ?? null;
}
