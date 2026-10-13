import { OFFLINE_OPERATIONS } from '@/domain/field/offline-queue-rules';

// A Spec 002 entregou esta política com a lista vazia, por decisão: nenhuma operação era `offline-safe`. A Spec 010 a preenche com exatamente as
// quatro operações de campo da viagem (conferir, desfazer a conferência, chegar e entregar); o resto continua exigindo conexão. Os anexos (foto e
// assinatura) não são itens da fila e seguem pelo envio próprio de anexos, depois da entrega confirmada.
const ALLOWLIST = Object.freeze([...OFFLINE_OPERATIONS]) as readonly string[];

export class OfflineOperationPolicy {
  allowedOperations(): readonly string[] {
    return ALLOWLIST;
  }

  isAllowed(operation: string): boolean {
    return ALLOWLIST.includes(operation);
  }

  assertAllowed(operation: string): void {
    if (!this.isAllowed(operation)) {
      throw new Error(`Operação offline não homologada: ${operation}.`);
    }
  }
}
