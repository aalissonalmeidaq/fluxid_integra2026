import { describe, expect, it } from 'vitest';
import { adaptLocalEndpointToDevice, LOCAL_SUPABASE_PROXY_PATH } from './dev-network';

const env = {
  VITE_SUPABASE_LOCAL_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY: 'sb_publishable_sintetica',
  VITE_SUPABASE_CLOUD_URL: 'https://projeto.supabase.co',
};

describe('adaptLocalEndpointToDevice', () => {
  it('em desenvolvimento, aberto de outro aparelho da rede, passa o Supabase local pelo servidor da própria página', () => {
    const adapted = adaptLocalEndpointToDevice(env, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true });
    expect(adapted.VITE_SUPABASE_LOCAL_URL).toBe(`http://10.113.14.8:3000${LOCAL_SUPABASE_PROXY_PATH}`);
  });

  it('o caminho do repasse é fixo e começa com barra', () => {
    expect(LOCAL_SUPABASE_PROXY_PATH).toBe('/supabase-local');
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])('não muda nada quando a página é aberta em %s (a própria máquina)', (pageOrigin) => {
    expect(adaptLocalEndpointToDevice(env, { pageOrigin, isDevelopment: true })).toEqual(env);
  });

  it('não muda nada fora do desenvolvimento: o endereço local do build de produção nunca é reescrito', () => {
    expect(adaptLocalEndpointToDevice(env, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: false })).toEqual(env);
  });

  it('mantém o protocolo da página (HTTPS) e funciona com nome de máquina', () => {
    const adapted = adaptLocalEndpointToDevice(env, { pageOrigin: 'https://pc-do-lab.local:3443', isDevelopment: true });
    expect(adapted.VITE_SUPABASE_LOCAL_URL).toBe(`https://pc-do-lab.local:3443${LOCAL_SUPABASE_PROXY_PATH}`);
  });

  it('só reescreve o destino local quando ele é loopback e nunca toca na chave publicável nem nos demais destinos', () => {
    const lan = { ...env, VITE_SUPABASE_LOCAL_URL: 'http://192.168.0.20:54321' };
    expect(adaptLocalEndpointToDevice(lan, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true })).toEqual(lan);
    const adapted = adaptLocalEndpointToDevice(env, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true });
    expect(adapted.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY).toBe(env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY);
    expect(adapted.VITE_SUPABASE_CLOUD_URL).toBe(env.VITE_SUPABASE_CLOUD_URL);
  });

  it('não altera o objeto recebido e ignora URL ausente ou inválida', () => {
    const original = { ...env };
    adaptLocalEndpointToDevice(env, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true });
    expect(env).toEqual(original);
    const invalida = { VITE_SUPABASE_LOCAL_URL: 'isto nao e url' };
    expect(adaptLocalEndpointToDevice(invalida, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true })).toEqual(invalida);
    expect(adaptLocalEndpointToDevice({}, { pageOrigin: 'http://10.113.14.8:3000', isDevelopment: true })).toEqual({});
  });

  it('ignora uma origem da página inválida ou que não seja HTTP(S)', () => {
    for (const pageOrigin of ['', 'nao-e-url', 'file:///c:/index.html', 'javascript:alert(1)', 'null']) {
      expect(adaptLocalEndpointToDevice(env, { pageOrigin, isDevelopment: true })).toEqual(env);
    }
  });
});
