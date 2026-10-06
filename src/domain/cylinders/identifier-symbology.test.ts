import { describe, expect, it } from 'vitest';
import { symbologyFor } from './identifier-symbology';

describe('simbologia do identificador (RF-044)', () => {
  it('QR Code e Data Matrix geram o símbolo do próprio tipo', () => {
    expect(symbologyFor('qr_code')).toEqual({ bcid: 'qrcode', label: 'QR Code' });
    expect(symbologyFor('data_matrix')).toEqual({ bcid: 'datamatrix', label: 'Data Matrix' });
  });

  it('NFC e número do casco não geram símbolo', () => {
    expect(symbologyFor('nfc_tag')).toBeNull();
    expect(symbologyFor('hull_number')).toBeNull();
  });
});
