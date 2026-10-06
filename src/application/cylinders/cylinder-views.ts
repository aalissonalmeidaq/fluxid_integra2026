import type {
  CapacityUnit, Classification, CylinderEventType, CylinderStatus, HydrostaticResult, HydrostaticStatus, IdentifierKind,
  IdentifierStatus, InactivationReason, StockStatus,
} from '@/domain/cylinders/cylinder-types';

// Visões que a interface recebe do servidor, já em camelCase. O contrato bruto está em
// specs/006-cilindros-e-estoque/contracts/operacoes-servidor.md.

export interface CylinderTypeView {
  id: string; gas: string; capacityValue: number; capacityUnit: CapacityUnit; classification: Classification; active: boolean;
}

export interface CylinderListItem {
  id: string; serialNumber: string; type: CylinderTypeView; status: CylinderStatus; stockStatus: StockStatus;
  hydroStatus: HydrostaticStatus; activeIdentifierCount: number; version: number;
}

export interface CylinderDetailData {
  id: string; serialNumber: string; type: CylinderTypeView; manufacturer: string | null; manufactureYear: number | null;
  workingPressureBar: number | null; notes: string | null; status: CylinderStatus; inactivationReason: InactivationReason | null;
  stockStatus: StockStatus; hydroLastResult: HydrostaticResult | null; hydroNextDueOn: string | null; version: number; createdAt: string;
}

export interface IdentifierView {
  id: string; kind: IdentifierKind; value: string; status: IdentifierStatus; createdAt: string;
  deactivatedAt: string | null; deactivationJustification: string | null; transferred: boolean;
}

export interface TestView {
  id: string; performedOn: string; result: HydrostaticResult; reportNumber: string | null; executor: string; nextDueOn: string | null;
  notes: string | null; rectifiesTestId: string | null; rectificationJustification: string | null; createdAt: string;
  // Verdadeiro quando outro registro o retificou (continua visível, mas não é o efetivo).
  superseded: boolean;
}

export interface CylinderDetail {
  cylinder: CylinderDetailData; identifiers: IdentifierView[]; tests: TestView[]; hydroStatus: HydrostaticStatus;
}

export interface CylinderListPage { items: CylinderListItem[]; total: number; next: string | null }

export interface LookupResult {
  cylinder: { id: string; serialNumber: string; status: CylinderStatus; stockStatus: StockStatus; hydroStatus: HydrostaticStatus };
  identifier: { id: string; kind: IdentifierKind; value: string };
}

export interface HistoryEvent {
  id: string; sequence: number; eventType: CylinderEventType; actorName: string | null; occurredAt: string;
  justification: string | null; data: Record<string, unknown>; referencesEventId: string | null;
}

export interface HistoryPage { events: HistoryEvent[]; next: string | null }

export interface StockInResult {
  cylinder: { id: string; serialNumber: string; stockStatus: StockStatus };
  replayed: boolean; eventSequence: number; hydroStatus: HydrostaticStatus; warning: 'hydro_expired' | 'hydro_rejected' | null;
}

export interface CylinderListQuery {
  search?: string; status?: 'active' | 'inactive' | 'all'; stockStatus?: StockStatus; hydroStatus?: HydrostaticStatus;
  cylinderTypeId?: string; sort?: 'serial' | 'serial_desc'; cursor?: string; limit?: number;
}

export interface HistoryQuery { eventType?: CylinderEventType; from?: string; to?: string; order?: 'asc' | 'desc'; cursor?: string; limit?: number }
