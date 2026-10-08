import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Nenhum teste chama o Nominatim real (integração temporária de geocodificação do protótipo): o fetch recusa o host antes
// de qualquer conexão. As demais chamadas seguem para o fetch original, que cada teste já substitui por um dublê.
const realFetch = globalThis.fetch;
if (typeof realFetch === 'function') {
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/(^|\/\/|\.)nominatim\.openstreetmap\.org/i.test(url)) {
      return Promise.reject(new Error('Chamada real ao Nominatim bloqueada nos testes automatizados.'));
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

afterEach(() => {
  cleanup();
});
