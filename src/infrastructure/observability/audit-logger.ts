const ALLOWED_FIELDS = new Set([
  'event', 'endpoint', 'failure', 'durationMs', 'transition', 'itemId',
]);

const SENSITIVE_VALUE = /https?:\/\/|bearer\s+|(?:eyJ[a-zA-Z0-9_-]+\.){2}|sb_secret_|service_role/i;

export type SanitizedAuditEntry = {
  event: string;
  endpoint?: 'cloud' | 'lan' | 'local';
  failure?: string;
  durationMs?: number;
  transition?: string;
  itemId?: string;
};

export class AuditLogger {
  constructor(private readonly sink: (entry: SanitizedAuditEntry) => void) {}

  write(entry: SanitizedAuditEntry | Record<string, unknown>): void {
    for (const [field, value] of Object.entries(entry)) {
      if (!ALLOWED_FIELDS.has(field)) throw new Error(`Campo não permitido no log de auditoria: ${field}.`);
      if (typeof value === 'string' && SENSITIVE_VALUE.test(value)) {
        throw new Error(`Valor sensível rejeitado no campo ${field}.`);
      }
    }
    this.sink(Object.freeze({ ...entry }) as SanitizedAuditEntry);
  }
}
