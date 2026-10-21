# Linha de base: Spec 014

Medida em 20/10/2026, na branch `feat/014-perfis-demonstracao`, a partir da `main` com a Spec 013 integrada (6c003fb).

## Pacote

| Item | Valor |
|---|---|
| Pacote de entrada (`dist/assets/index-B5NDEVG0.js`) | 601.888 bytes (170.443 bytes com gzip) |

## Testes

| Suíte | Contagem |
|---|---|
| pgTAP (`supabase/tests/*.sql`) | 130 arquivos, 3.242 asserções planejadas |
| Vitest (`npx vitest list`, sem as suítes `.live`) | 4.012 testes |

## Nuvem (projeto `wrkregetswvycjksldeo`)

Consulta só de leitura pela CLI (`supabase db query --linked`):

| Item | Estado |
|---|---|
| Tenant "Oxigênio Cariri" (`5478e9e3-155b-482f-b843-3513e0938dd6`) | `kind = 'tenant'`, `status = 'inactive'` |
| Vínculos nesse tenant | 0 |
| Cilindros nesse tenant | 0 |
| Papéis padrão nesse tenant | `tenant_admin`, `technical_operator`, `stock_operator`, `tenant_auditor`, `driver`, `logistics_manager` |
| Usuários `@demo.fluxid.invalid` | 0 |
| Lacre `DSP-P77E49TC` | pedido `pending` desde 20/10/2026, 00:48 (registro da bancada da Spec 013). A segunda consulta, de `seal_enrollments`, não foi feita nesta sessão: conferir na publicação (T037) |
