// Rascunho das paradas do formulário de viagem (RF-002, RF-003). Fica fora do componente para o editor exportar só componentes.

export interface CylinderDraft {
  id: string;
  serialNumber: string;
  gas: string;
}

export interface StopDraft {
  // Chave estável da linha na tela (não é o id gravado).
  key: string;
  // Identificador da parada já gravada (edição); ausente nas paradas novas.
  id?: string;
  siteId: string;
  cylinders: CylinderDraft[];
}

let counter = 0;
export const newStopKey = (): string => {
  counter += 1;
  return `stop-${counter}`;
};
