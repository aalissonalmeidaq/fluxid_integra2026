// Erro tipado dos leitores do navegador (câmera, NFC e GPS). Quem usa decide o texto da tela por `kind`; a mensagem nunca traz
// valor lido, coordenada nem número de série (RF-017).
export type ReaderErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unreadable';

export class ReaderError extends Error {
  readonly kind: ReaderErrorKind;

  constructor(kind: ReaderErrorKind) {
    super(kind);
    this.name = 'ReaderError';
    this.kind = kind;
  }
}

// Erros de permissão do navegador: `NotAllowedError` e `SecurityError`.
export const isPermissionError = (cause: unknown): boolean => cause instanceof Error && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
