import type { CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { CAPACITY_UNIT_LABELS, CLASSIFICATION_LABELS } from '@/domain/cylinders/cylinder-types';

// Descrição de um tipo de cilindro para listas e seletores: "Oxigênio · 10 L · Medicinal".
export const typeLabel = (type: CylinderTypeView): string =>
  `${type.gas} · ${type.capacityValue} ${CAPACITY_UNIT_LABELS[type.capacityUnit]} · ${CLASSIFICATION_LABELS[type.classification]}`;
