# Contrato: script e rotina de restauração da demonstração

## Comando

`npm run operacao:demonstracao` (`scripts/operacao/demonstracao.mjs`).

Variáveis lidas do ambiente (nunca de arquivo versionado, nunca impressas):

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | URL do projeto. Só `https://<ref>.supabase.co`, a não ser com `--permitir-fora-da-nuvem` (usado nos testes contra o local) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do projeto |

## Passos

1. Lê `src/domain/demo/acessos-demonstracao.json` e valida (5 perfis, papéis de tenant, e-mails do domínio reservado, senhas na política).
2. Chama `public.demo_restore(p_manifest, 'markers')` com o manifesto **completo, inclusive as senhas publicadas** (são públicas, RN-001). Essa fase grava só `private.demo_tenant` e `private.demo_accounts` (e-mail, papel e senha publicada).
3. Para cada perfil, cria o usuário no Auth com o id do JSON ou atualiza o existente (senha publicada, e-mail confirmado). Como `private.demo_accounts` já tem a senha publicada, o gatilho de senha aceita a atualização, inclusive quando a senha publicada mudou no JSON. Se o e-mail já pertencer a outro id, para sem alterar nada.
4. Chama `public.demo_restore(p_manifest, 'state')`, que restaura tenant, perfis, vínculos, papéis, o C262 e o lacre.
5. Imprime um resumo: o que foi criado, restaurado ou pulado, e os avisos.

## `public.demo_restore(p_manifest jsonb, p_phase text)`

- Executável só por `service_role`; `anon` e `authenticated` não têm acesso.
- `p_phase`: `markers` (marcas e senhas publicadas, antes de mexer no Auth) ou `state` (o estado publicado). Cada chamada é uma transação. Resposta de `state`:

A fase `markers` responde `{ "code": "DEMO_MARKED", "accounts": 5 }` e só marca o tenant quando ele já existe; na criação do zero, quem cria e marca o tenant é a fase `state`. Resposta de `state`:

```json
{ "code": "DEMO_RESTORED",
  "tenant": "reactivated" | "created" | "unchanged",
  "accounts": { "restored": 0..5, "unchanged": 0..5 },
  "cylinder": "created" | "restored" | "unchanged" | "skipped_in_trip",
  "seal": "bound" | "unchanged" | "not_assigned" | "absent",
  "sample": { "created": 0, "restored": 0, "unchanged": 34 },
  "warnings": ["..."] }
```

- Recusas, sem alterar nada: `DEMO_FOREIGN_MEMBERS` (o tenant tem vínculos que não são de demonstração; fica registrada como negação na auditoria da plataforma), `DEMO_ACCOUNTS_MISSING` (fase `state` sem as marcas ou sem os usuários no Auth) e `VALIDATION_FAILED` (manifesto ou fase inválidos).
- Avisos possíveis em `warnings`: `cylinder_in_trip`, `cylinder_at_customer`, `seal_not_assigned`, `seal_bound_elsewhere`, `cylinder_bound_elsewhere`, `seal_cylinder_unavailable` e os códigos de recusa das operações do domínio (`cylinder_stock_in_*`, `cylinder_update_*`, `seal_bind_*`).
- Grava `demo.restore` na auditoria da plataforma, com o resumo e sem senha.

### Dados de exemplo (RF-018)

A seção `sample` do JSON descreve tipos e 12 cilindros (com teste hidrostático; o C274 vencido), 3 clientes com unidade e geocerca circular, 2 veículos, 2 motoristas (o `motorista-1` ligado ao perfil Motorista da demonstração), 3 viagens (`concluida`, `em-andamento`, `planejada`) e 4 lacres simulados, cada um com o alerta publicado (`low_battery`, `weak_signal`, `seal_open`, `device_off`). Na fase `state`, `demo_restore` passa por eles com a mesma sessão de serviço e as operações do domínio; os ids criados ficam em `private.demo_records` (referência publicada → id) e o manifesto, em `private.demo_tenant.manifest`.

| Registro | Ausente | Mudado por um visitante |
|---|---|---|
| Tipo, cilindro | cria (cadastro, teste hidrostático e entrada no estoque) | reativa e devolve ao estoque; cilindro de viagem publicada fica onde a viagem o deixou |
| Cliente, unidade, geocerca | cria | reativa; cliente anonimizado vira aviso |
| Veículo | cria | volta a `available` |
| Motorista | cria e liga ao perfil | reativa e religa |
| Viagem | cria e leva à situação publicada | se não está mais na situação publicada, cria outra (a antiga fica no histórico); se os cilindros não permitirem, avisa |
| Lacre simulado | cadastra, vincula e manda as mensagens pelo `seal_ingest` | revincula; se o alerta publicado foi fechado, manda de novo as mensagens que o geram |

Cada registro é tratado numa subtransação: uma recusa vira aviso `sample_<operação>:<código>:<referência>` e não derruba o resto. Os lacres simulados não falam depois da restauração, então a verificação automática os marca "sem comunicação" com o tempo, como aconteceria com um lacre real.

## Rotina diária

`.github/workflows/restaurar-demonstracao.yml`:

- `schedule: '23 6 * * *'` (03:23 em Brasília) e `workflow_dispatch`;
- `vars.SUPABASE_CLOUD_URL` e `secrets.SUPABASE_SERVICE_ROLE_KEY`;
- sem o segredo: `::error::` explicando o que cadastrar, sem tentar nada;
- a saída mostra só o resumo, nunca a chave nem senha.
