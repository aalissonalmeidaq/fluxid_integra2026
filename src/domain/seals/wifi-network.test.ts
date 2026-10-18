import { describe, expect, it } from 'vitest';
import { canAddWifi, validateWifiNetwork } from './wifi-network';

// Spec 012 (RF-034a, RF-034b): nome da rede de 1 a 32 bytes, senha de 8 a 63 caracteres ou rede aberta, lista de até 5 redes.
describe('validateWifiNetwork', () => {
  it('aceita nome e senha válidos e devolve sem espaços nas pontas do nome', () => {
    expect(validateWifiNetwork({ ssid: ' Rede-Deposito ', password: 'senha-ficticia-123', open: false })).toEqual({ ok: true, value: { ssid: 'Rede-Deposito', password: 'senha-ficticia-123', open: false } });
  });

  it('rede aberta dispensa a senha e não a envia', () => {
    expect(validateWifiNetwork({ ssid: 'Visitantes', password: 'Senha-ignorada', open: true })).toEqual({ ok: true, value: { ssid: 'Visitantes', password: null, open: true } });
  });

  it('nome vazio ou com mais de 32 bytes é recusado (acentos contam 2 bytes)', () => {
    expect(validateWifiNetwork({ ssid: '  ', password: 'senha-ficticia-123', open: false })).toMatchObject({ ok: false, errors: { ssid: expect.any(String) } });
    expect(validateWifiNetwork({ ssid: 'é'.repeat(17), password: 'senha-ficticia-123', open: false })).toMatchObject({ ok: false, errors: { ssid: expect.any(String) } });
    expect(validateWifiNetwork({ ssid: 'é'.repeat(16), password: 'senha-ficticia-123', open: false }).ok).toBe(true);
  });

  it('senha fora de 8 a 63 caracteres é recusada', () => {
    expect(validateWifiNetwork({ ssid: 'R', password: '1234567', open: false })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    expect(validateWifiNetwork({ ssid: 'R', password: 'x'.repeat(64), open: false })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
  });
});

describe('canAddWifi', () => {
  it('com 5 redes só aceita trocar a senha de uma rede já guardada', () => {
    const saved = ['R1', 'R2', 'R3', 'R4', 'R5'];
    expect(canAddWifi(saved, 'R6')).toBe(false);
    expect(canAddWifi(saved, 'R5')).toBe(true);
    expect(canAddWifi(['R1'], 'R2')).toBe(true);
  });
});
