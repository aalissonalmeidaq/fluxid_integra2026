// Pré-visualização local da foto ou da assinatura (Spec 010, RF-018): uma URL de objeto que vive só neste aparelho e é revogada ao sair. Nada vai ao servidor
// por aqui. Só esta pasta cria URL de imagem (tests/contract/attachments-privacy.test.ts).
export interface Preview {
  url: string;
  revoke(): void;
}

export function createPreview(bytes: ArrayBuffer, contentType: string): Preview {
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
