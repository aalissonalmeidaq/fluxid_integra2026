import { SEAL_LIMITS } from './seal-limits';

// Rede Wi-Fi do lacre (Spec 012, RF-034a, RF-034b): o nome tem de 1 a 32 bytes (limite do Wi-Fi) e a senha de 8 a 63 caracteres
// (WPA2), salvo rede aberta. O banco confere de novo; aqui a regra serve para avisar no formulário antes de enviar.
export interface WifiNetworkInput { ssid: string; password: string; open: boolean }
export interface WifiNetwork { ssid: string; password: string | null; open: boolean }
export type WifiNetworkResult = { ok: true; value: WifiNetwork } | { ok: false; errors: Partial<Record<'ssid' | 'password', string>> };

const bytes = (text: string): number => new TextEncoder().encode(text).length;

export function validateWifiNetwork(input: WifiNetworkInput): WifiNetworkResult {
  const ssid = input.ssid.trim();
  const errors: Partial<Record<'ssid' | 'password', string>> = {};
  if (ssid.length === 0 || bytes(ssid) > 32) errors.ssid = 'Informe o nome da rede com até 32 caracteres.';
  if (!input.open && (input.password.length < 8 || input.password.length > 63)) errors.password = 'A senha da rede tem de 8 a 63 caracteres.';
  if (errors.ssid || errors.password) return { ok: false, errors };
  return { ok: true, value: { ssid, password: input.open ? null : input.password, open: input.open } };
}

// A lista guarda até 5 redes; uma rede já guardada pode receber senha nova mesmo com a lista cheia.
export function canAddWifi(saved: readonly string[], ssid: string): boolean {
  return saved.includes(ssid) || saved.length < SEAL_LIMITS.wifiListMax;
}
