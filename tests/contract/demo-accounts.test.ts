// @vitest-environment node
import { describe, expect, it } from 'vitest';
import manifesto from '../../src/domain/demo/acessos-demonstracao.json';
import { DEMO_ACCESS, DEMO_ROLE_CODES, demoAccessEnabled, validateDemoManifest, validateDemoSample } from '../../src/domain/demo/demo-access';

// Spec 014 (RF-001 a RF-003; data-model.md): a fonte única dos acessos de demonstração, lida pela tela de login, pelo script da nuvem
// e conferida contra o seed local.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('acessos de demonstração: a fonte única', () => {
  it('tem exatamente 5 perfis, um para cada papel de tenant, nenhum global', () => {
    expect(manifesto.accounts).toHaveLength(5);
    expect(manifesto.accounts.map((conta) => conta.role_code).sort())
      .toEqual(['driver', 'stock_operator', 'technical_operator', 'tenant_admin', 'tenant_auditor']);
    expect([...DEMO_ROLE_CODES].sort()).toEqual(['driver', 'stock_operator', 'technical_operator', 'tenant_admin', 'tenant_auditor']);
    for (const conta of manifesto.accounts) expect(conta.role_code).not.toMatch(/master|admin_fluxid|global/);
  });

  it('cada perfil tem nome, descrição, e-mail do domínio reservado e senha no formato publicado', () => {
    for (const conta of manifesto.accounts) {
      expect(conta.display_name.trim().length).toBeGreaterThanOrEqual(2);
      expect(conta.display_name.trim().length).toBeLessThanOrEqual(100);
      expect(conta.description.length).toBeGreaterThan(0);
      expect(conta.description.length).toBeLessThanOrEqual(120);
      expect(conta.email).toBe(`${conta.role_code}@demo.fluxid.invalid`);
      expect(conta.password).toMatch(/^FluxID-Demo-\d{2}!$/);
      expect(conta.password).toHaveLength(15);
      expect(conta.password).toMatch(/[a-z]/);
      expect(conta.password).toMatch(/[A-Z]/);
      expect(conta.password).toMatch(/\d/);
      expect(conta.password).toMatch(/[^A-Za-z0-9]/);
    }
    expect(new Set(manifesto.accounts.map((conta) => conta.email)).size).toBe(5);
  });

  it('os ids de usuário e de vínculo são uuids fixos e distintos', () => {
    const ids = manifesto.accounts.flatMap((conta) => [conta.user_id, conta.membership_id]);
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(10);
  });

  it('aponta a empresa da nuvem, o C262 e o lacre de bancada', () => {
    expect(manifesto.tenant.id).toBe('5478e9e3-155b-482f-b843-3513e0938dd6');
    expect(manifesto.tenant.display_name).toBe('Oxigênio Cariri');
    expect(manifesto.cylinder.serial_number).toBe('C262');
    expect(manifesto.seal.device_code).toBe('DSP-P77E49TC');
  });

  it('a validação aceita o manifesto publicado e recusa papel global, e-mail fora do domínio e senha fraca', () => {
    expect(validateDemoManifest(manifesto)).toEqual([]);
    expect(DEMO_ACCESS.accounts).toHaveLength(5);
    const ruim = structuredClone(manifesto);
    ruim.accounts[0]!.role_code = 'master_fluxid';
    ruim.accounts[1]!.email = 'alguem@empresa.com.br';
    ruim.accounts[2]!.password = 'curta';
    const erros = validateDemoManifest(ruim).join(' ');
    expect(erros).toMatch(/papel/);
    expect(erros).toMatch(/e-mail/);
    expect(erros).toMatch(/senha/);
    expect(validateDemoManifest({ ...manifesto, accounts: manifesto.accounts.slice(0, 4) }).join(' ')).toMatch(/5 perfis/);
  });

  it('VITE_DEMO_ACCESS só desliga com "false"; ausente ou outro valor, liga', () => {
    expect(demoAccessEnabled({})).toBe(true);
    expect(demoAccessEnabled({ VITE_DEMO_ACCESS: 'true' })).toBe(true);
    expect(demoAccessEnabled({ VITE_DEMO_ACCESS: '' })).toBe(true);
    expect(demoAccessEnabled({ VITE_DEMO_ACCESS: 'false' })).toBe(false);
  });

  // RF-018 (pedido de 20/10/2026): os dados de exemplo da demonstração, também na fonte única.
  it('os dados de exemplo são coerentes: referências existentes, cilindro em uma só viagem ou lacre, nomes marcados como exemplo', () => {
    expect(validateDemoSample(manifesto)).toEqual([]);
    const amostra = manifesto.sample;
    expect(amostra.cylinders).toHaveLength(12);
    expect(amostra.customers).toHaveLength(3);
    expect(amostra.vehicles).toHaveLength(2);
    expect(amostra.drivers).toHaveLength(2);
    expect(amostra.trips.map((viagem) => viagem.state).sort()).toEqual(['completed', 'in_progress', 'planned']);
    expect(amostra.seals.map((lacre) => lacre.alert).sort()).toEqual(['device_off', 'low_battery', 'seal_open', 'weak_signal']);
    for (const cliente of amostra.customers) expect(cliente.legal_name).toMatch(/Exemplo/);
    for (const motorista of amostra.drivers) expect(motorista.full_name).toMatch(/Exemplo/);
    expect(amostra.drivers.filter((motorista) => 'account_role' in motorista && motorista.account_role === 'driver')).toHaveLength(1);
    expect(amostra.cylinders.map((cilindro) => cilindro.serial_number)).not.toContain(manifesto.cylinder.serial_number);
  });

  it('a validação dos exemplos recusa referência inexistente e cilindro repetido entre viagem e lacre', () => {
    const ruim = structuredClone(manifesto);
    ruim.sample.trips[0]!.vehicle = 'XXX0X00';
    ruim.sample.seals[0]!.cylinder = ruim.sample.trips[1]!.stops[0]!.cylinders[0]!;
    ruim.sample.cylinders.push({ ...ruim.sample.cylinders[0]! });
    const erros = validateDemoSample(ruim).join(' ');
    expect(erros).toMatch(/veículo/);
    expect(erros).toMatch(/mais de um uso/);
    expect(erros).toMatch(/repetido/);
  });
});
