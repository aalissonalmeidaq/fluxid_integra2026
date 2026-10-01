const EMPTY_ALLOWLIST = Object.freeze([]) as readonly string[];

export class OfflineOperationPolicy {
  allowedOperations(): readonly string[] {
    return EMPTY_ALLOWLIST;
  }

  isAllowed(operation: string): boolean {
    return EMPTY_ALLOWLIST.includes(operation);
  }

  assertAllowed(operation: string): void {
    if (!this.isAllowed(operation)) {
      throw new Error(`Operação offline não homologada: ${operation}.`);
    }
  }
}
