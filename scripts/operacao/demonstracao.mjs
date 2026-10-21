// `npm run operacao:demonstracao`: cria ou restaura os acessos de demonstração (Spec 014) num projeto Supabase.
// Roda SOMENTE no terminal de quem opera ou na rotina diária do GitHub, nunca no navegador: usa a chave privilegiada do servidor.
//
// Variáveis lidas do ambiente (nunca de arquivo versionado, nunca impressas):
//   SUPABASE_URL                 URL do projeto (https://<ref>.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY    chave secreta do projeto (sb_secret_... ou service_role)
// Use --permitir-fora-da-nuvem só de propósito (testes contra o Supabase local).
//
// Passos (contracts/restauracao-da-demonstracao.md): valida o JSON; confere que nenhum e-mail de demonstração pertence a outro
// usuário; `demo_restore(markers)`; cria ou atualiza os 5 usuários no Auth (id fixo, senha publicada, e-mail confirmado);
// `demo_restore(state)`; imprime o resumo. As senhas são públicas (RN-001), mas o script não as imprime.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const MANIFESTO = new URL('../../src/domain/demo/acessos-demonstracao.json', import.meta.url);
const PAPEIS = ['tenant_admin', 'stock_operator', 'technical_operator', 'tenant_auditor', 'driver'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const lerManifesto = () => JSON.parse(readFileSync(MANIFESTO, 'utf8'));

/** Mesma regra de `src/domain/demo/demo-access.ts`. Devolve os problemas (vazio quando válido), sem repetir senhas. */
export function validarManifesto(manifesto) {
  const erros = [];
  if (!manifesto || typeof manifesto !== 'object') return ['manifesto ausente'];
  if (!UUID.test(manifesto.tenant?.id ?? '')) erros.push('tenant sem id válido');
  if (!/^DSP-[0-9A-Z]{8}$/.test(manifesto.seal?.device_code ?? '')) erros.push('código do lacre inválido');
  if (!manifesto.cylinder?.serial_number) erros.push('cilindro sem número de série');
  const contas = Array.isArray(manifesto.accounts) ? manifesto.accounts : [];
  if (contas.length !== PAPEIS.length) erros.push(`são esperados ${PAPEIS.length} perfis`);
  if (new Set(contas.map((conta) => conta.role_code)).size !== contas.length) erros.push('papel repetido');
  contas.forEach((conta, indice) => {
    const nome = `perfil ${indice + 1}`;
    if (!PAPEIS.includes(conta.role_code)) erros.push(`${nome}: papel fora dos papéis de tenant da demonstração`);
    if (!UUID.test(conta.user_id ?? '') || !UUID.test(conta.membership_id ?? '')) erros.push(`${nome}: id inválido`);
    if (!/^[a-z_]+@demo\.fluxid\.invalid$/.test(conta.email ?? '')) erros.push(`${nome}: e-mail fora do domínio reservado`);
    const senha = conta.password ?? '';
    if (senha.length < 12 || !/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
      erros.push(`${nome}: senha fora da política`);
    }
  });
  return erros;
}

export function validarUrl(url, argv) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url ?? '') && !argv.includes('--permitir-fora-da-nuvem')) {
    throw new Error('SUPABASE_URL não parece um projeto Supabase em nuvem. Use --permitir-fora-da-nuvem somente de propósito.');
  }
}

const falhar = (contexto, error) => new Error(`${contexto}: ${error?.message ?? error?.code ?? 'erro desconhecido'}`);

async function usuariosPorEmail(admin) {
  const mapa = new Map();
  for (let pagina = 1; pagina <= 50; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw falhar('Falha ao listar usuários do Auth', error);
    for (const usuario of data.users) if (usuario.email) mapa.set(usuario.email.toLowerCase(), usuario.id);
    if (data.users.length < 200) break;
  }
  return mapa;
}

async function chamar(admin, manifesto, fase) {
  const { data, error } = await admin.rpc('demo_restore', { p_manifest: manifesto, p_phase: fase });
  if (error) throw falhar(`Falha em demo_restore (${fase})`, error);
  if (data?.code === 'DEMO_FOREIGN_MEMBERS') {
    throw new Error('O tenant da demonstração tem vínculos que não são de demonstração. Nada foi alterado: remova-os antes, para nunca expor uma pessoa real às senhas públicas.');
  }
  return data;
}

/**
 * Cria ou restaura a demonstração. `admin` é um cliente Supabase com a chave privilegiada (ou um dublê nos testes).
 * Devolve o resumo de `demo_restore(state)`.
 */
export async function restaurarDemonstracao(admin, manifesto) {
  const erros = validarManifesto(manifesto);
  if (erros.length) throw new Error(`Manifesto inválido: ${erros.join('; ')}`);

  // Um e-mail de demonstração com outro dono para tudo antes de qualquer alteração.
  const existentes = await usuariosPorEmail(admin);
  for (const conta of manifesto.accounts) {
    const dono = existentes.get(conta.email);
    if (dono && dono !== conta.user_id) throw new Error(`O e-mail ${conta.email} já pertence a outro usuário. Nada foi alterado.`);
  }

  const marcas = await chamar(admin, manifesto, 'markers');
  if (marcas?.code !== 'DEMO_MARKED') throw new Error(`demo_restore (markers) respondeu ${marcas?.code ?? 'sem código'}. Nada foi alterado no Auth.`);

  for (const conta of manifesto.accounts) {
    const atributos = { email: conta.email, password: conta.password, email_confirm: true };
    const atual = await admin.auth.admin.getUserById(conta.user_id);
    const resposta = atual.data?.user
      ? await admin.auth.admin.updateUserById(conta.user_id, atributos)
      : await admin.auth.admin.createUser({ id: conta.user_id, ...atributos });
    if (resposta.error) throw falhar(`Falha ao acertar o usuário ${conta.role_code} no Auth`, resposta.error);
  }

  const resumo = await chamar(admin, manifesto, 'state');
  if (resumo?.code !== 'DEMO_RESTORED') throw new Error(`demo_restore (state) respondeu ${resumo?.code ?? 'sem código'}.`);
  return resumo;
}

export function formatarResumo(resumo) {
  const linhas = [
    'Demonstração restaurada.',
    `  tenant: ${resumo.tenant}`,
    `  perfis: ${resumo.accounts?.restored ?? 0} restaurados, ${resumo.accounts?.unchanged ?? 0} sem mudança`,
    `  cilindro C262: ${resumo.cylinder}`,
    `  lacre de bancada: ${resumo.seal}`,
  ];
  for (const aviso of resumo.warnings ?? []) linhas.push(`  aviso: ${aviso}`);
  return linhas.join('\n');
}

/** Ponto de entrada testável. Devolve o código de saída do processo. */
export async function executar({ env, argv, criarCliente, log, erro }) {
  try {
    const url = env.SUPABASE_URL?.trim();
    const chave = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !chave) {
      erro('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (na rotina do GitHub, o segredo SUPABASE_SERVICE_ROLE_KEY e a variável SUPABASE_CLOUD_URL).');
      return 1;
    }
    validarUrl(url, argv);
    const admin = criarCliente(url, chave);
    log(formatarResumo(await restaurarDemonstracao(admin, lerManifesto())));
    return 0;
  } catch (falha) {
    erro(falha instanceof Error ? falha.message : 'Falha desconhecida.');
    return 1;
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` || import.meta.url === `file://${process.argv[1]}`) {
  executar({
    env: process.env,
    argv: process.argv.slice(2),
    criarCliente: (url, chave) => createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } }),
    log: (texto) => console.log(texto),
    erro: (texto) => console.error(texto),
  }).then((codigo) => { process.exitCode = codigo; });
}
