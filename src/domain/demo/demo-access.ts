import manifesto from './acessos-demonstracao.json';

// Spec 014: acessos de demonstração. A fonte única é `acessos-demonstracao.json` (RF-002): a tela de login a importa, o script da
// nuvem a lê e um teste de contrato a confere contra o seed local. As senhas são públicas por decisão do responsável (RN-001).

export const DEMO_ROLE_CODES = ['tenant_admin', 'stock_operator', 'technical_operator', 'tenant_auditor', 'driver'] as const;
export type DemoRoleCode = (typeof DEMO_ROLE_CODES)[number];

// Nome do papel no modal, igual ao dos papéis padrão do tenant.
export const DEMO_ROLE_NAMES: Record<DemoRoleCode, string> = {
  tenant_admin: 'Administrador da empresa',
  stock_operator: 'Operador de estoque',
  technical_operator: 'Operador técnico',
  tenant_auditor: 'Auditor da empresa',
  driver: 'Motorista',
};

export interface DemoAccount {
  user_id: string;
  membership_id: string;
  display_name: string;
  role_code: DemoRoleCode;
  description: string;
  email: string;
  password: string;
}

export interface DemoManifest {
  tenant: { id: string; display_name: string; legal_name: string };
  cylinder: {
    serial_number: string;
    identifier: { kind: string; value: string };
    notes: string;
    type: { gas: string; capacity_value: number; capacity_unit: string; classification: string };
  };
  seal: { device_code: string };
  accounts: DemoAccount[];
  sample: DemoSample;
}

// RF-018: dados de exemplo da empresa da demonstração. As referências ligam os registros entre si; `publicado` é o tipo do C262.
export const DEMO_SEAL_ALERTS = ['low_battery', 'weak_signal', 'seal_open', 'device_off'] as const;
export const DEMO_TRIP_STATES = ['planned', 'in_progress', 'completed'] as const;

export interface DemoSample {
  cylinder_types: Array<{ ref: string; gas: string; capacity_value: number; capacity_unit: string; classification: string }>;
  cylinders: Array<{ serial_number: string; type: string; hydro: string; in_stock: boolean }>;
  customers: Array<{
    ref: string; person_type: string; document: string; legal_name: string; trade_name: string; segment: string;
    contacts: Array<{ name: string; role: string; phone: string; is_primary: boolean }>;
    site: Record<string, string | number>;
    geofence: { name: string; radius_m: number };
  }>;
  vehicles: Array<Record<string, string | number> & { plate: string }>;
  drivers: Array<{ ref: string; full_name: string; cpf: string; cnh_number: string; cnh_category: string; cnh_valid_in_days: number; phone: string; account_role?: string }>;
  trips: Array<{ ref: string; state: string; planned_in_days?: number; vehicle: string; driver: string; stops: Array<{ customer: string; cylinders: string[] }> }>;
  seals: Array<{ ref: string; label: string; cylinder: string; alert: string; latitude: number; longitude: number }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isRole = (value: unknown): value is DemoRoleCode => typeof value === 'string' && (DEMO_ROLE_CODES as readonly string[]).includes(value);

// Mesma política de senha da plataforma: 12 ou mais caracteres, com minúsculas, maiúsculas, números e símbolos.
const strongPassword = (value: string) =>
  value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

/** Devolve a lista de problemas do manifesto (vazia quando válido). As mensagens nunca repetem a senha. */
export function validateDemoManifest(value: unknown): string[] {
  const erros: string[] = [];
  const raw = value as Partial<DemoManifest> | null;
  if (!raw || typeof raw !== 'object') return ['manifesto ausente'];
  if (!raw.tenant || !UUID.test(raw.tenant.id ?? '')) erros.push('empresa sem id válido');
  if (!raw.tenant?.display_name || raw.tenant.display_name.trim().length < 2) erros.push('empresa sem nome');
  if (!raw.cylinder?.serial_number) erros.push('cilindro sem número de série');
  if (!raw.seal?.device_code || !/^DSP-[0-9A-Z]{8}$/.test(raw.seal.device_code)) erros.push('código do lacre inválido');

  const contas = Array.isArray(raw.accounts) ? raw.accounts : [];
  if (contas.length !== DEMO_ROLE_CODES.length) erros.push(`são esperados ${DEMO_ROLE_CODES.length} perfis`);
  const papeis = new Set<string>();
  const ids = new Set<string>();
  const emails = new Set<string>();
  contas.forEach((conta, indice) => {
    const nome = `perfil ${indice + 1}`;
    if (!isRole(conta.role_code)) erros.push(`${nome}: papel fora dos papéis de empresa da demonstração`);
    else if (papeis.has(conta.role_code)) erros.push(`${nome}: papel repetido`);
    else papeis.add(conta.role_code);
    for (const id of [conta.user_id, conta.membership_id]) {
      if (!UUID.test(id ?? '')) erros.push(`${nome}: id inválido`);
      else if (ids.has(id)) erros.push(`${nome}: id repetido`);
      else ids.add(id);
    }
    const display = (conta.display_name ?? '').trim();
    if (display.length < 2 || display.length > 100) erros.push(`${nome}: nome deve ter de 2 a 100 caracteres`);
    if (!conta.description || conta.description.length > 120) erros.push(`${nome}: descrição deve ter até 120 caracteres`);
    const email = conta.email ?? '';
    if (email !== email.toLowerCase() || !/^[a-z_]+@demo\.fluxid\.invalid$/.test(email)) erros.push(`${nome}: e-mail fora do domínio reservado`);
    else if (emails.has(email)) erros.push(`${nome}: e-mail repetido`);
    else emails.add(email);
    if (typeof conta.password !== 'string' || !strongPassword(conta.password)) erros.push(`${nome}: senha fora da política`);
  });
  return erros;
}

/** Coerência dos dados de exemplo (RF-018). Devolve os problemas, vazio quando válido. */
export function validateDemoSample(value: unknown): string[] {
  const raw = value as Partial<DemoManifest> | null;
  const amostra = raw?.sample;
  if (!amostra || typeof amostra !== 'object') return ['dados de exemplo ausentes'];
  const erros: string[] = [];
  const repetidos = (lista: string[], nome: string) => {
    const vistos = new Set<string>();
    for (const item of lista) {
      if (vistos.has(item)) erros.push(`${nome} repetido: ${item}`);
      vistos.add(item);
    }
    return vistos;
  };
  const tipos = repetidos(amostra.cylinder_types.map((tipo) => tipo.ref), 'tipo');
  tipos.add('publicado');
  const cilindros = repetidos(amostra.cylinders.map((cilindro) => cilindro.serial_number), 'cilindro');
  if (raw?.cylinder?.serial_number && cilindros.has(raw.cylinder.serial_number)) erros.push('o C262 não entra nos exemplos');
  for (const cilindro of amostra.cylinders) {
    if (!tipos.has(cilindro.type)) erros.push(`cilindro ${cilindro.serial_number}: tipo inexistente`);
    if (!['approved', 'expired'].includes(cilindro.hydro)) erros.push(`cilindro ${cilindro.serial_number}: teste hidrostático inválido`);
  }
  const clientes = repetidos(amostra.customers.map((cliente) => cliente.ref), 'cliente');
  const veiculos = repetidos(amostra.vehicles.map((veiculo) => veiculo.plate), 'veículo');
  const motoristas = repetidos(amostra.drivers.map((motorista) => motorista.ref), 'motorista');
  for (const motorista of amostra.drivers) {
    if (motorista.account_role !== undefined && !(raw?.accounts ?? []).some((conta) => conta.role_code === motorista.account_role)) {
      erros.push(`motorista ${motorista.ref}: perfil de demonstração inexistente`);
    }
  }
  const usos = new Map<string, number>();
  const usar = (serial: string) => usos.set(serial, (usos.get(serial) ?? 0) + 1);
  repetidos(amostra.trips.map((viagem) => viagem.ref), 'viagem');
  for (const viagem of amostra.trips) {
    if (!(DEMO_TRIP_STATES as readonly string[]).includes(viagem.state)) erros.push(`viagem ${viagem.ref}: situação inválida`);
    if (!veiculos.has(viagem.vehicle)) erros.push(`viagem ${viagem.ref}: veículo inexistente`);
    if (!motoristas.has(viagem.driver)) erros.push(`viagem ${viagem.ref}: motorista inexistente`);
    for (const parada of viagem.stops) {
      if (!clientes.has(parada.customer)) erros.push(`viagem ${viagem.ref}: cliente inexistente`);
      for (const serial of parada.cylinders) {
        const cilindro = amostra.cylinders.find((item) => item.serial_number === serial);
        if (!cilindro) erros.push(`viagem ${viagem.ref}: cilindro ${serial} inexistente`);
        else if (cilindro.hydro !== 'approved') erros.push(`viagem ${viagem.ref}: cilindro ${serial} sem teste em dia`);
        usar(serial);
      }
    }
  }
  repetidos(amostra.seals.map((lacre) => lacre.ref), 'lacre');
  for (const lacre of amostra.seals) {
    if (!cilindros.has(lacre.cylinder)) erros.push(`lacre ${lacre.ref}: cilindro inexistente`);
    if (!(DEMO_SEAL_ALERTS as readonly string[]).includes(lacre.alert)) erros.push(`lacre ${lacre.ref}: alerta inválido`);
    usar(lacre.cylinder);
  }
  for (const [serial, vezes] of usos) if (vezes > 1) erros.push(`cilindro ${serial} com mais de um uso (viagem ou lacre)`);
  return erros;
}

const problemas = [...validateDemoManifest(manifesto), ...validateDemoSample(manifesto)];
if (problemas.length > 0) throw new Error(`Acessos de demonstração inválidos: ${problemas.join('; ')}`);

export const DEMO_ACCESS = manifesto as unknown as DemoManifest;

/**
 * O botão "Acessos de teste" aparece salvo com `VITE_DEMO_ACCESS=false` (RF-009). A tela de login repete esta comparação como
 * expressão constante sobre `import.meta.env`, para o Vite eliminar o modal e as credenciais do pacote quando desligado.
 */
export function demoAccessEnabled(env: Record<string, unknown> = import.meta.env): boolean {
  return env.VITE_DEMO_ACCESS !== 'false';
}
