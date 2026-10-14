// `npm run operacao:primeiro-master`: cria o primeiro Master FluxID em um projeto Supabase (nuvem) que ainda não tem nenhum.
// Roda SOMENTE no terminal de quem opera, nunca no navegador: usa a chave privilegiada do servidor.
//
// Variáveis lidas do ambiente do terminal (nunca de arquivo versionado, nunca impressas):
//   SUPABASE_URL                 URL do projeto (https://<ref>.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY    chave secreta do projeto (sb_secret_... ou service_role)
//   FLUXID_MASTER_EMAIL          e-mail do Master
//   FLUXID_MASTER_NOME           nome exibido (opcional; padrão "Master FluxID")
//   FLUXID_MASTER_SENHA          senha (opcional; se ausente, é pedida sem eco no terminal)
// Só cria quando não existe Master; é seguro repetir. Registra a ação na trilha de auditoria, sem a senha.
import { createClient } from '@supabase/supabase-js';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PAPEL_MASTER = '50000000-0000-0000-0000-000000000001';

export function validarEntrada({ email, nome, senha }) {
  const erros = [];
  if (!email || !EMAIL_VALIDO.test(email)) erros.push('e-mail inválido');
  if (!nome || nome.trim().length < 2 || nome.trim().length > 100) erros.push('nome deve ter de 2 a 100 caracteres');
  if (!senha || senha.length < 12) erros.push('senha deve ter ao menos 12 caracteres');
  else if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
    erros.push('senha deve misturar minúsculas, maiúsculas, números e símbolos');
  }
  return erros;
}

async function buscarUsuarioPorEmail(admin, email) {
  const alvo = email.toLowerCase();
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw falhar('Falha ao listar usuários do Auth', error);
    const achado = data.users.find((usuario) => usuario.email?.toLowerCase() === alvo);
    if (achado) return achado.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

const falhar = (contexto, error) => new Error(`${contexto}: ${error.message ?? error.code ?? 'erro desconhecido'}`);

/**
 * Cria o primeiro Master. `admin` é um cliente Supabase com a chave privilegiada (ou um dublê nos testes).
 * Retorna { criado: false } quando já existe Master e nada é alterado.
 */
export async function criarPrimeiroMaster(admin, { email, nome, senha }) {
  const erros = validarEntrada({ email, nome, senha });
  if (erros.length) throw new Error(`Entrada inválida: ${erros.join('; ')}`);

  const existente = await admin.from('membership_roles').select('membership_id').eq('role_id', ID_PAPEL_MASTER).limit(1);
  if (existente.error) throw falhar('Falha ao verificar Master existente', existente.error);
  if (existente.data.length > 0) return { criado: false, motivo: 'já existe um Master FluxID' };

  let organizacao = await admin.from('organizations').select('id').eq('kind', 'owner').maybeSingle();
  if (organizacao.error) throw falhar('Falha ao consultar a organização proprietária', organizacao.error);
  if (!organizacao.data) {
    organizacao = await admin.from('organizations')
      .insert({ kind: 'owner', legal_name: 'FluxID', display_name: 'FluxID', status: 'active' }).select('id').single();
    if (organizacao.error) throw falhar('Falha ao criar a organização proprietária', organizacao.error);
  }
  const organizationId = organizacao.data.id;

  // Reaproveita o usuário quando ele já foi criado no Auth (ex.: pelo painel); a senha dele não é alterada.
  let userId = await buscarUsuarioPorEmail(admin, email);
  const usuarioNovo = !userId;
  if (usuarioNovo) {
    const usuario = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (usuario.error) throw falhar('Falha ao criar o usuário no Auth', usuario.error);
    userId = usuario.data.user.id;
  }

  try {
    const perfil = await admin.from('profiles').upsert({ user_id: userId, display_name: nome.trim() });
    if (perfil.error) throw falhar('Falha ao criar o perfil', perfil.error);

    const vinculo = await admin.from('memberships')
      .upsert({ organization_id: organizationId, user_id: userId, status: 'active', activated_at: new Date().toISOString() }, { onConflict: 'organization_id,user_id' })
      .select('id').single();
    if (vinculo.error) throw falhar('Falha ao criar o vínculo', vinculo.error);

    const papel = await admin.from('membership_roles')
      .insert({ membership_id: vinculo.data.id, role_id: ID_PAPEL_MASTER, assigned_by: userId });
    if (papel.error) throw falhar('Falha ao atribuir o papel Master', papel.error);

    const auditoria = await admin.from('audit_logs').insert({
      organization_id: organizationId, actor_user_id: userId, action: 'master.bootstrap', target_type: 'user',
      target_id: userId, result: 'success', reason_code: 'primeiro_master', metadata: { origem: 'script_operacional' },
    });
    if (auditoria.error) throw falhar('Falha ao registrar a auditoria', auditoria.error);
  } catch (erro) {
    // Desfaz o usuário do Auth para a operação poder ser repetida; o que já foi gravado em tabelas cai junto ou é reaproveitado.
    await admin.from('membership_roles').delete().eq('assigned_by', userId);
    await admin.from('memberships').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('user_id', userId);
    if (usuarioNovo) await admin.auth.admin.deleteUser(userId);
    throw erro;
  }
  return { criado: true, userId, organizationId };
}

function lerSenhaOculta(pergunta) {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) return reject(new Error('Sem terminal interativo: informe FLUXID_MASTER_SENHA no ambiente.'));
    process.stdout.write(pergunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let texto = '';
    const aoDigitar = (tecla) => {
      if (tecla === '\u0003') { entrada.setRawMode(false); process.stdout.write('\n'); return reject(new Error('Cancelado.')); }
      if (tecla === '\r' || tecla === '\n') {
        entrada.setRawMode(false); entrada.pause(); entrada.off('data', aoDigitar); process.stdout.write('\n');
        return resolve(texto);
      }
      texto = tecla === '\u007f' ? texto.slice(0, -1) : texto + tecla;
    };
    entrada.on('data', aoDigitar);
  });
}

async function principal() {
  const url = process.env.SUPABASE_URL?.trim();
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !chave) throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do terminal.');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) && !process.argv.includes('--permitir-fora-da-nuvem')) {
    throw new Error('SUPABASE_URL não parece um projeto Supabase em nuvem. Use --permitir-fora-da-nuvem somente de propósito.');
  }
  const email = process.env.FLUXID_MASTER_EMAIL?.trim();
  const nome = process.env.FLUXID_MASTER_NOME?.trim() || 'Master FluxID';
  const senha = process.env.FLUXID_MASTER_SENHA ?? await lerSenhaOculta('Senha do Master (não aparece): ');
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const resultado = await criarPrimeiroMaster(admin, { email, nome, senha });
  console.log(resultado.criado ? `Master criado (${email}).` : `Nada alterado: ${resultado.motivo}.`);
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) {
  principal().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
}
