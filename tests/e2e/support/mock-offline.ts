import { expect, type BrowserContext, type Page } from '@playwright/test';

// Simulador de rede e de armazenamento para os E2E da fila offline (Spec 010). A rede cai e volta por `context.setOffline`; o relógio usa o
// `page.clock` do Playwright; o aviso de espaço troca `navigator.storage` por números fictícios. Nada aqui toca em dado real.

export async function cortarRede(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  // O navegador avisa a página pelo evento `offline`; o teste espera o estado refletir antes de agir.
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}

export async function religarRede(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
}

// Troca `navigator.storage` por uma cota pequena e já usada, para exibir os avisos de espaço e de armazenamento não persistente.
export async function simularArmazenamento(page: Page, opcoes: { persistente: boolean; usoMb: number; cotaMb: number }): Promise<void> {
  await page.addInitScript(({ persistente, usoMb, cotaMb }) => {
    const MB = 1024 * 1024;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => persistente,
        persist: async () => persistente,
        estimate: async () => ({ usage: usoMb * MB, quota: cotaMb * MB }),
      },
    });
  }, opcoes);
}

export interface ItemDaFila { operation: string; status: string; trip_id: string | null; idempotency_key: string; payload: Record<string, unknown> }

// Lê a fila (`local_outbox`) direto do IndexedDB do aparelho.
export async function lerFila(page: Page): Promise<ItemDaFila[]> {
  return page.evaluate(async () => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => {
      const pedido = indexedDB.open('fluxid-local');
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
    });
    try {
      return await new Promise<ItemDaFila[]>((resolve, reject) => {
        const pedido = aberto.transaction('local_outbox').objectStore('local_outbox').getAll();
        pedido.onsuccess = () => resolve(pedido.result as ItemDaFila[]);
        pedido.onerror = () => reject(pedido.error);
      });
    } finally {
      aberto.close();
    }
  });
}
