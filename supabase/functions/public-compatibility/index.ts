// Versão pública do contrato/schema aprovado (RF-047). Deve avançar junto com as migrations,
// as políticas RLS e o catálogo de permissões homologados em todos os destinos.
export const CONTRACT_VERSION = '002.1';

// Chamada do navegador em outra origem (ex.: Vercel): sem CORS o probe de conectividade é bloqueado.
const HEADERS = {
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
};

export default {
  fetch(request: Request): Response {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
    if (request.method !== 'GET') {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: HEADERS });
    }
    return Response.json({ contractVersion: CONTRACT_VERSION }, { headers: HEADERS });
  },
};
