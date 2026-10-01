import type { ActorPermissions } from '@/domain/navigation/visible-screens';

const PREFIX = 'fluxid.menu.';

export interface CachedPermissions { codes: ActorPermissions; savedAt: string }

export interface PermissionsCache {
  read(userId: string, organizationId: string | null): CachedPermissions | null;
  write(userId: string, organizationId: string | null, codes: ActorPermissions): void;
  // Logout e expiração: remove tudo o que o menu guardou.
  clear(): void;
  // Troca de pessoa: remove o que pertence a qualquer outra pessoa.
  clearOthers(userId: string): void;
}

// Hash curto (FNV-1a de 32 bits) só para não escrever identificadores em claro na chave; não é proteção criptográfica,
// pois o valor guardado são apenas códigos de permissão, sem credencial nem dado pessoal (RF-020).
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const keyFor = (userId: string, organizationId: string | null) => `${PREFIX}${shortHash(userId)}.${shortHash(organizationId ?? 'sem-tenant')}`;
const isCodes = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

// Últimas permissões conhecidas, só na aba e na sessão (`sessionStorage`), separadas por pessoa e tenant. É lido apenas offline,
// nunca para exibir item antes da confirmação do servidor (RF-007, RF-020). Qualquer falha de armazenamento é ignorada.
export function createPermissionsCache(storage: () => Storage = () => sessionStorage): PermissionsCache {
  const keys = (): string[] => {
    const area = storage();
    const found: string[] = [];
    for (let index = 0; index < area.length; index += 1) {
      const key = area.key(index);
      if (key?.startsWith(PREFIX)) found.push(key);
    }
    return found;
  };
  const guarded = (action: () => void) => { try { action(); } catch { /* armazenamento indisponível: o menu segue sem cache */ } };

  return {
    read(userId, organizationId) {
      try {
        const raw = storage().getItem(keyFor(userId, organizationId));
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const { codes, savedAt } = parsed as { codes?: { tenant?: unknown; global?: unknown }; savedAt?: unknown };
        if (!codes || !isCodes(codes.tenant) || !isCodes(codes.global) || typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt))) return null;
        return { codes: { tenant: codes.tenant, global: codes.global }, savedAt };
      } catch {
        return null;
      }
    },
    write(userId, organizationId, codes) {
      guarded(() => storage().setItem(keyFor(userId, organizationId), JSON.stringify({ codes, savedAt: new Date().toISOString() })));
    },
    clear() {
      guarded(() => keys().forEach((key) => storage().removeItem(key)));
    },
    clearOthers(userId) {
      guarded(() => {
        const own = `${PREFIX}${shortHash(userId)}.`;
        keys().filter((key) => !key.startsWith(own)).forEach((key) => storage().removeItem(key));
      });
    },
  };
}
