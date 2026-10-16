import type { MockBackend } from './mock-backend';
import { ORG_A } from './mock-registry';

// Massa do simulado com nomes apresentáveis, para o que vai a público (o vídeo de demonstração e as capturas da landing): troca os nomes de
// teste ("Tenant A", "Operador A", "Cliente Exemplo 01", "Ana Condutora") por nomes fictícios de uma distribuidora de exemplo, dá endereço e
// coordenadas às unidades e uma geocerca à primeira. Continua sendo massa de exemplo: quem a mostra marca "Exemplo" (AGENTS.md).
export const NOMES = {
  organizacao: 'Distribuidora Exemplo',
  integrante: { nome: 'Bruno Lima', email: 'bruno.lima@example.com' },
  clientes: ['Hospital Exemplo Santa Rita', 'Laboratório Exemplo Vida', 'Indústria Exemplo Metais'],
  motoristas: { 'Ana Condutora': 'Ana Ribeiro', 'Bruno Condutor': 'Rafael Souza', 'Carla Condutora': 'Carla Mendes' } as Record<string, string>,
};

// Posição da geocerca da primeira unidade (a mesma do GPS simulado de quem chega nela).
export const POSICAO_DA_PRIMEIRA_UNIDADE = { latitude: -23.55, longitude: -46.633 };

export function tornarApresentavel(backend: MockBackend): void {
  backend.tenantMemberships[0]!.organizations!.display_name = NOMES.organizacao;
  backend.members[0]!.display_name = NOMES.integrante.nome;
  backend.members[0]!.email = NOMES.integrante.email;
  backend.registry.customers.filter((cliente) => cliente.organization_id === ORG_A).forEach((cliente, indice) => {
    cliente.legal_name = NOMES.clientes[indice] ?? cliente.legal_name;
    cliente.trade_name = null;
  });
  for (const motorista of backend.registry.drivers) motorista.full_name = NOMES.motoristas[String(motorista.full_name)] ?? motorista.full_name;
  // Unidades com endereço e coordenadas, para o mapa da visão geral e a chegada com GPS.
  const enderecos = [
    { street: 'Praça da Sé', city: 'São Paulo', ...POSICAO_DA_PRIMEIRA_UNIDADE },
    { street: 'Avenida Paulista', city: 'São Paulo', latitude: -23.5614, longitude: -46.6559 },
    { street: 'Rua Barão de Jaguara', city: 'Campinas', latitude: -22.9056, longitude: -47.0608 },
  ];
  backend.registry.sites.filter((unidade) => unidade.organization_id === ORG_A).forEach((unidade, indice) => {
    const endereco = enderecos[indice];
    if (!endereco) return;
    Object.assign(unidade, endereco, { coordinates_source: 'manual', coordinates_confirmed_at: '2026-10-01T10:00:00.000Z' });
  });
  // Geocerca circular de 200 m na primeira unidade.
  backend.registry.geofences.push({
    id: 'g-exemplo-1', organization_id: ORG_A, site_id: backend.registry.sites[0]!.id, name: 'Entrada de cargas', shape: 'circle',
    center: { lat: POSICAO_DA_PRIMEIRA_UNIDADE.latitude, lng: POSICAO_DA_PRIMEIRA_UNIDADE.longitude }, radius_m: 200, vertices: [], status: 'active', version: 1,
  });
}

// Quem fez cada ação: o simulado grava todo ator como "Administrador A". Depois de cada etapa, o que foi gravado passa a ter o nome de quem
// agiu nela, para os históricos mostrarem pessoas diferentes.
export function assinar(backend: MockBackend, nome: string): void {
  const vistos = new WeakSet<object>();
  const visitar = (valor: unknown): void => {
    if (!valor || typeof valor !== 'object' || vistos.has(valor)) return;
    vistos.add(valor);
    for (const [chave, item] of Object.entries(valor)) {
      if (item === 'Administrador A') (valor as Record<string, unknown>)[chave] = nome;
      else visitar(item);
    }
  };
  visitar(backend.trips);
  visitar(backend.cylinders);
  visitar(backend.registry);
}
