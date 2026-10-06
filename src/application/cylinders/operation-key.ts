// Chave de operação gerada no cliente (UUID). Enquanto o resultado de um envio for desconhecido (rede caiu, resposta perdida),
// a mesma chave é reaproveitada na repetição, e o servidor reconhece a operação sem duplicar. Só uma resposta definitiva
// (sucesso ou recusa clara) libera a próxima chave (RF-014, RF-029).
export class OperationKey {
  private value: string | null = null;

  current(): string {
    if (this.value === null) this.value = crypto.randomUUID();
    return this.value;
  }

  settle(): void {
    this.value = null;
  }
}
