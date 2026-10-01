// Versão pública do contrato/schema aprovado (RF-047). Deve avançar junto com as migrations,
// as políticas RLS e o catálogo de permissões homologados em todos os destinos.
export const CONTRACT_VERSION = '002.1';

const HEADERS = { 'cache-control': 'no-store' };

export default {
  fetch(request: Request): Response {
    if (request.method !== 'GET') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: HEADERS });
    }
    return Response.json({ contractVersion: CONTRACT_VERSION }, { headers: HEADERS });
  },
};
