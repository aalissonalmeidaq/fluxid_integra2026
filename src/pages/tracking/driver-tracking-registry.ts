import type { DriverTrackingCoordinator } from '@/application/tracking/tracking-sync-service';

// Uma só coordenação da coleta do motorista por destino, pessoa, empresa e viagem no aplicativo inteiro (Spec 015, T133). O painel da
// tela da viagem e o mantenedor do menu usam a mesma: sair e voltar à tela não cria outra, que disputaria o buffer nativo e a fila do
// aparelho com a anterior, deixada sem envio.
const coordinators = new Map<string, DriverTrackingCoordinator>();

export function sharedDriverCoordinator(key: string, create: () => DriverTrackingCoordinator): DriverTrackingCoordinator {
  let coordinator = coordinators.get(key);
  if (!coordinator) {
    coordinator = create();
    coordinators.set(key, coordinator);
  }
  return coordinator;
}

// Só para os testes: começa de um registro vazio.
export function forgetDriverCoordinators(): void {
  coordinators.clear();
}
