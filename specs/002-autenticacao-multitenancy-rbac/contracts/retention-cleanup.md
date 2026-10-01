# Contrato: limpeza de objetos da retenção

Função: `retention-storage-cleanup` (POST). Remove do Storage os avatares de perfis anonimizados pela rotina
`public.run_identity_retention()`, que os enfileira em `private.storage_cleanup_queue`.

## Acionamento

A rotina do banco (pg_cron, diária) só **enfileira**. Quem remove os arquivos é esta função, e ela só roda quando
alguém a chama. Em cloud, o acionamento é o workflow `.github/workflows/retention-cleanup.yml` (diário às 04:17 UTC,
depois da rotina do banco às 03:17, e sob demanda). Em LAN, um agendador próprio com o mesmo contrato. A chamada é:

```http
POST {SUPABASE_URL}/functions/v1/retention-storage-cleanup
apikey: <chave publicável>
x-retention-secret: <valor de RETENTION_JOB_SECRET>
content-type: application/json

{ "limit": 100 }
```

- Sem o agendador, os arquivos anonimizados permanecem no Storage. O workflow só funciona depois de configurados no
  repositório as variáveis `SUPABASE_CLOUD_URL` e `SUPABASE_CLOUD_PUBLISHABLE_KEY` e o segredo `RETENTION_JOB_SECRET`
  (tarefa T149); sem eles ele falha de forma visível em vez de passar em silêncio.
- `apikey` é a chave publicável (pública por natureza). O que autentica o job é o segredo.
- Validado no runtime local sem `Authorization` de usuário; o `verify_jwt` da função permanece no padrão.

## Autenticação

- Cabeçalho `x-retention-secret`, comparado em tempo constante com `RETENTION_JOB_SECRET` (segredo só de servidor).
- Segredo não configurado no servidor: 503. Cabeçalho ausente ou incorreto: 401. Não existe caminho sem segredo.
- O segredo nunca é versionado. Localmente vem de `supabase/.env` (ignorado pelo git) via `env(RETENTION_JOB_SECRET)`
  em `supabase/config.toml`; em LAN e cloud, dos segredos do Supabase e do agendador.

## Entrada e saída

- Corpo opcional `{ "limit": n }`: padrão 100, mínimo 1, máximo 500.
- Sucesso: `200 { "code": "CLEANUP_DONE", "removed": n, "failed": n }`. Somente contagens; nunca caminhos (AUD-009).
- Métodos diferentes de POST: 405. Falha ao ler a fila: 503.

## Garantias

- Um item só sai da fila depois de o objeto ser removido. Se a remoção falhar, o item fica para a próxima execução.
- Remover objeto que já não existe não é erro.
- O acesso à fila é feito só por `take_storage_cleanup_batch` e `complete_storage_cleanup`, restritas a `service_role`.

## Testes

- `tests/contract/retention-cleanup.test.ts`: segredo, limites, remoção e falha parcial (handler com gateways simulados).
- `supabase/tests/002_storage_cleanup.test.sql`: ordem, limite e conclusão da fila.
- `tests/contract/retention-workflow.test.ts`: o workflow (gatilhos, segredo só por `env`, permissões mínimas, falha visível).
- `tests/contract/retention-cleanup.live.test.ts`: gateway real sem e com segredo. **Não** cobre a remoção de um objeto
  real do Storage; essa parte fica no handler e no SQL.
