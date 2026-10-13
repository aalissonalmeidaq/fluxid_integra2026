// Identificador do aparelho para a fila offline (Spec 010): um UUID gerado uma vez e guardado no navegador. Não identifica a pessoa nem carrega dado
// sensível; só diz de qual aparelho veio cada pedido da fila. Sem armazenamento disponível, vale um identificador da sessão da página.
const KEY = 'fluxid-device-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fallback: string | null = null;

export function getDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): string {
  try {
    const stored = storage?.getItem(KEY) ?? null;
    if (stored !== null && UUID.test(stored)) return stored;
    const created = crypto.randomUUID();
    storage?.setItem(KEY, created);
    return storage ? created : (fallback ??= created);
  } catch {
    return (fallback ??= crypto.randomUUID());
  }
}

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
