import { describe, expect, it } from 'vitest';
import manifesto from './acessos-demonstracao.json';
import { demoAccessEnabled, validateDemoManifest, validateDemoSample } from './demo-access';

// Spec 014: cada regra da validação dos acessos e dos dados de exemplo, uma a uma. As mensagens nunca repetem a senha.
const copia = () => structuredClone(manifesto) as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('validateDemoManifest', () => {
  it('recusa manifesto ausente', () => {
    expect(validateDemoManifest(null)).toEqual(['manifesto ausente']);
    expect(validateDemoManifest('texto')).toEqual(['manifesto ausente']);
  });

  it('confere o tenant, o lacre e o cilindro', () => {
    const ruim = copia();
    ruim.tenant = { id: 'x', display_name: ' ' };
    ruim.seal = { device_code: 'LACRE-1' };
    ruim.cylinder = {};
    const erros = validateDemoManifest(ruim);
    expect(erros).toEqual(expect.arrayContaining(['empresa sem id válido', 'empresa sem nome', 'código do lacre inválido', 'cilindro sem número de série']));
  });

  it('confere cada perfil: papel repetido, ids, nome, descrição, e-mail e senha', () => {
    const ruim = copia();
    const [a, b] = ruim.accounts;
    b.role_code = a.role_code;
    b.user_id = a.user_id;
    b.membership_id = 'não é uuid';
    b.display_name = 'X';
    b.description = 'x'.repeat(121);
    b.email = 'Maiuscula@demo.fluxid.invalid';
    b.password = 'senhafraca123';
    ruim.accounts[2].email = a.email;
    const erros = validateDemoManifest(ruim).join(' | ');
    expect(erros).toMatch(/perfil 2: papel repetido/);
    expect(erros).toMatch(/perfil 2: id repetido/);
    expect(erros).toMatch(/perfil 2: id inválido/);
    expect(erros).toMatch(/perfil 2: nome deve ter de 2 a 100 caracteres/);
    expect(erros).toMatch(/perfil 2: descrição deve ter até 120 caracteres/);
    expect(erros).toMatch(/perfil 2: e-mail fora do domínio reservado/);
    expect(erros).toMatch(/perfil 3: e-mail repetido/);
    expect(erros).toMatch(/perfil 2: senha fora da política/);
    expect(erros).not.toMatch(/senhafraca123/);
  });

  it('campos ausentes contam como inválidos, sem quebrar a validação', () => {
    const ruim = copia();
    delete ruim.tenant;
    delete ruim.seal;
    const conta = ruim.accounts[0];
    delete conta.user_id;
    delete conta.display_name;
    delete conta.description;
    delete conta.email;
    conta.password = 12345;
    const erros = validateDemoManifest(ruim).join(' | ');
    expect(erros).toMatch(/empresa sem id válido/);
    expect(erros).toMatch(/código do lacre inválido/);
    expect(erros).toMatch(/perfil 1: id inválido/);
    expect(erros).toMatch(/perfil 1: nome deve ter/);
    expect(erros).toMatch(/perfil 1: descrição/);
    expect(erros).toMatch(/perfil 1: e-mail fora do domínio/);
    expect(erros).toMatch(/perfil 1: senha fora da política/);
  });

  it('sem lista de perfis, pede os 5', () => {
    const ruim = copia();
    delete ruim.accounts;
    expect(validateDemoManifest(ruim)).toEqual(['são esperados 5 perfis']);
  });
});

describe('validateDemoSample', () => {
  it('aceita os dados de exemplo publicados e recusa a ausência deles', () => {
    expect(validateDemoSample(manifesto)).toEqual([]);
    const sem = copia();
    delete sem.sample;
    expect(validateDemoSample(sem)).toEqual(['dados de exemplo ausentes']);
    expect(validateDemoSample(null)).toEqual(['dados de exemplo ausentes']);
  });

  it('confere tipos, cilindros e motoristas', () => {
    const ruim = copia();
    ruim.sample.cylinder_types.push({ ...ruim.sample.cylinder_types[0] });
    ruim.sample.cylinders[0].type = 'inexistente';
    ruim.sample.cylinders[1].hydro = 'talvez';
    ruim.sample.cylinders.push({ serial_number: 'C262', type: 'publicado', hydro: 'approved', in_stock: true });
    ruim.sample.drivers[1].account_role = 'master_fluxid';
    const erros = validateDemoSample(ruim).join(' | ');
    expect(erros).toMatch(/tipo repetido/);
    expect(erros).toMatch(/cilindro C263: tipo inexistente/);
    expect(erros).toMatch(/cilindro C264: teste hidrostático inválido/);
    expect(erros).toMatch(/o C262 não entra nos exemplos/);
    expect(erros).toMatch(/motorista motorista-2: perfil de demonstração inexistente/);
  });

  it('confere as viagens e os lacres', () => {
    const ruim = copia();
    const [viagem] = ruim.sample.trips;
    viagem.state = 'voando';
    viagem.driver = 'ninguem';
    viagem.stops[0].customer = 'ninguem';
    viagem.stops[0].cylinders.push('C999', 'C274');
    ruim.sample.seals[0].cylinder = 'C998';
    ruim.sample.seals[1].alert = 'fogo';
    const erros = validateDemoSample(ruim).join(' | ');
    expect(erros).toMatch(/viagem concluida: situação inválida/);
    expect(erros).toMatch(/viagem concluida: motorista inexistente/);
    expect(erros).toMatch(/viagem concluida: cliente inexistente/);
    expect(erros).toMatch(/viagem concluida: cilindro C999 inexistente/);
    expect(erros).toMatch(/viagem concluida: cilindro C274 sem teste em dia/);
    expect(erros).toMatch(/lacre lacre-1: cilindro inexistente/);
    expect(erros).toMatch(/lacre lacre-2: alerta inválido/);
  });
});

describe('demoAccessEnabled', () => {
  it('sem argumento, lê o ambiente do build (ligado nos testes)', () => {
    expect(demoAccessEnabled()).toBe(true);
  });

  it('dados de exemplo sem a lista de perfis: o motorista com papel não acha perfil', () => {
    const ruim = copia();
    delete ruim.accounts;
    delete ruim.cylinder;
    expect(validateDemoSample(ruim).join(' | ')).toMatch(/perfil de demonstração inexistente/);
  });
});
