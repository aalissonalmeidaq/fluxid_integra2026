import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createReportExportHandler, type ReportGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

const BUCKET = 'report-exports';

// A chave de serviço fica só aqui, no servidor. O ator e a sessão vêm do token validado pelo Auth; o banco confere vínculo, exportação,
// leitura do tipo e solicitante a cada passo. O bucket é privado: só esta borda grava o arquivo completo e emite a URL assinada curta,
// depois de o banco reautorizar o download (contracts/consultas-relatorios-exportacoes.md).
function createGateway(): ReportGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = () => admin.storage.from(BUCKET);
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error || data === null || typeof data !== 'object') throw new Error('rpc_failed');
      return data as Record<string, unknown>;
    },
    // Negações e falhas sem alvo, organização, caminho, conteúdo nem URL.
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'report_export', result: event.result,
        reason_code: event.reason, origin: 'function:report-export', metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
    async upload(path, content) {
      const { error } = await bucket().upload(path, new Blob([content], { type: 'text/csv;charset=utf-8' }), { contentType: 'text/csv', upsert: false });
      if (error) throw new Error('storage_upload_failed');
    },
    async move(from, to) {
      const { error } = await bucket().move(from, to);
      if (error) throw new Error('storage_move_failed');
    },
    async remove(path) {
      await bucket().remove([path]);
    },
    async signedUrl(path, seconds) {
      const { data, error } = await bucket().createSignedUrl(path, seconds, { download: true });
      if (error || !data?.signedUrl) throw new Error('storage_sign_failed');
      return data.signedUrl;
    },
  };
}

export default { fetch: (request: Request) => createReportExportHandler(createGateway())(request) };
