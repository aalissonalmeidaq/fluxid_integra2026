# Modelo de dados: Aprovação e destinação de lacres pelo Master

Acrescenta à Spec 012 uma tabela de plataforma, uma tabela privada de limites, colunas em `seal_devices` e um segredo no Vault. Nada é excluído; o histórico de cada destinação fica no tenant em que foi gerado (RN-005).

## Tabela nova: `public.seal_enrollments` (plataforma, sem tenant)

Um pedido por código de lacre. RLS ligada e sem política: só RPCs `security definer` com `platform.manage` leem e escrevem.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | chave |
| `device_code` | text | `^DSP-[0-9A-Z]{8}$`; único |
| `key_hash` | bytea | SHA-256 da chave aceita (a do primeiro pedido); só muda por `replace_enrollment_key` (RF-008) |
| `status` | text | `pending`, `approved`, `refused`, `expired`, `returned` |
| `conflict_at` | timestamptz | última chamada com o mesmo código e outra chave; nulo sem conflito |
| `conflict_key_hash` | bytea | SHA-256 da chave da última chamada em conflito; nulo sem conflito |
| `conflict_calls` | integer | quantas chamadas em conflito |
| `forget_networks` | text | `all` (devolução, ou retirada com "Esquecer todas as redes"), `extras` (retirada) ou nulo; vai na resposta `202` até o lacre enviar `networks_forgotten` (RN-006) |
| `forget_networks_requested_at` | timestamptz | quando o esquecimento foi pedido; nulo sem pedido |
| `last_organization_id` | uuid | tenant da última destinação; continua preenchido depois da retirada e da devolução e só volta a nulo quando o lacre confirma `networks_forgotten` com `all` (RN-006) |
| `first_seen_at` / `last_seen_at` | timestamptz | primeira e última chamada |
| `calls` | integer | chamadas enquanto pendente |
| `signal_dbm` | smallint | último sinal informado (-127 a 0) |
| `wifi_ssid` | text | rede em uso informada (até 32 bytes) |
| `firmware_version` | text | até 32 |
| `source_hash` | bytea | resumo do endereço de origem (nunca o endereço) |
| `organization_id` | uuid | tenant da destinação atual; nulo fora de `approved` |
| `device_id` | uuid | linha ativa em `seal_devices`; nulo fora de `approved` |
| `decided_by` / `decided_at` | uuid / timestamptz | quem decidiu por último |
| `decision_note` | text | justificativa de recusa, retirada ou devolução (5 a 500) |
| `created_at` / `updated_at` | timestamptz | |

Restrições: `approved` exige `organization_id` e `device_id`; `refused` e `returned` exigem `decision_note`; `conflict_at` e `conflict_key_hash` são nulos juntos; `forget_networks` e `forget_networks_requested_at` são nulos juntos; sem exclusão (gatilho, como as tabelas da Spec 012).

### Situações

```text
(primeira chamada) → pending
pending  → approved  (Master aprova com tenant, justificativa)     → cria seal_devices no tenant
pending  → refused   (Master recusa, justificativa)
pending  → expired   (7 dias sem chamada, vigia)
approved → pending   (Master retira de operação, justificativa) → inativa seal_devices (withdrawn); forget_networks = extras ou all (escolha do Master)
approved → returned  (tenant devolve, justificativa)            → inativa seal_devices (returned); forget_networks = all
returned → approved  (Master destina de novo, justificativa)    → cria nova linha seal_devices
refused  → approved  (Master reconsidera, justificativa)        → cria seal_devices no tenant
expired  → pending   (o lacre volta a chamar)
```

Destinar a outro tenant: com `last_organization_id` preenchido, `approve_enrollment` para um tenant **diferente** é recusado com `NETWORKS_NOT_CLEARED`. Para o mesmo tenant não há essa trava (RN-006).

Recusado continua recusado: o lacre recebe `403` e repete a chamada de hora em hora, o que só atualiza `last_seen_at`, sem reabrir o pedido.

Conflito não é uma situação: é uma marca (`conflict_at` e `conflict_key_hash`) sobre o pedido existente. Enquanto ela existir, o pedido não pode ser aprovado. O Master resolve por `replace_enrollment_key`, com justificativa:

- **aceitar a chave nova:** `key_hash` passa a ser a `conflict_key_hash`, a marca é limpa e a situação vira `pending`; não vale em `approved` (retirar antes);
- **manter a atual** (`keep_current: true`): só limpa a marca.

### Ao inativar uma linha de `seal_devices` (devolução e retirada)

Na mesma transação, por um auxiliar comum (`private.seal_deactivate_line`):

- encerra o vínculo com o cilindro;
- cancela os comandos pendentes da linha e apaga do Vault a senha dos comandos de rede, como no fim de comando da Spec 012;
- encerra a vigilância (`seal_watches`) ativa;
- fecha os alertas abertos com o motivo `device_inactive`;
- mantém `lock_state` como o último confirmado, sem presumir nada (princípio IV);
- avisa o tenant antigo pelo tempo real (`private.seal_broadcast`, tipo `device`).

O vigia ignora linhas inativas.

### Esquecimento das redes (RN-006)

- **Pedido:** a devolução marca `forget_networks = 'all'`; a retirada marca `extras` ou `all`, conforme a escolha do Master. As duas preenchem `forget_networks_requested_at`. Fora de operação, o Master também pode pedir `all` por `request_forget_networks` (por exemplo, num lacre retirado com "Manter a rede principal" que vai para outro tenant).
- **Confirmação:** o lacre apaga as redes e envia o evento `networks_forgotten` (`detail`: `all` ou `extras`) na chamada seguinte. O banco então limpa `forget_networks` e `forget_networks_requested_at`.
- **Com `all`:** a confirmação também anula `last_organization_id`, o que libera a destinação a outro tenant.
- **Evento repetido:** um `networks_forgotten` sem pedido aberto não tem efeito.

## Mudanças em `public.seal_devices`

| Campo | Mudança |
|---|---|
| `enrollment_id` | novo; uuid do pedido que originou a linha (nulo nos lacres da Spec 012 até a migration de compatibilidade preencher) |
| `approved_at` / `approved_by` | novos; quando e por quem a destinação aconteceu |
| `inactive_reason` | novo; `returned`, `withdrawn` ou `manual` (desativação da Spec 012) |
| `device_code` | a unicidade passa a ser só entre linhas `status = 'active'` (índice único parcial) |

## Tabela nova: `private.seal_enroll_rate_windows`

Limites dos pedidos, que ainda não têm linha em `seal_devices` (a `private.seal_rate_windows` da Spec 012 é indexada por `device_id`, com chave estrangeira). RLS ligada e `revoke all` de `anon` e `authenticated`.

| Campo | Tipo | Regra |
|---|---|---|
| `bucket` | text | `enroll:` + resumo do endereço, ou `pending:` + id do pedido |
| `window_start` | timestamptz | início da janela |
| `count` | integer | chamadas na janela |

Chave: (`bucket`, `window_start`). Janelas antigas são limpas como na Spec 012.

## Segredo novo no Vault

- `seal_portal_password`: a senha padrão da rede de configuração, igual à do firmware da frota. Gravado na publicação (SQL documentado em `docs/publicacao-em-nuvem.md`), nunca por migration. Lido só por `reveal_portal_password`, com auditoria.

## Auditoria (ações novas)

Todas as ações abaixo, menos a negação, guardam a justificativa no campo próprio da auditoria, como na Spec 012, e nunca em `metadata`.

| Ação | Onde | Metadados (nunca chave nem senha) |
|---|---|---|
| `seal.enrollment_approve` | plataforma e tenant de destino | código, tenant |
| `seal.enrollment_refuse` | plataforma | código |
| `seal.enrollment_key_replace` | plataforma | código, `keep_current` |
| `seal.networks_forget_request` | plataforma | código, último tenant |
| `seal.device_withdraw` | plataforma e tenant | código, tenant |
| `seal.device_return` | tenant e plataforma | código |
| `seal.portal_password_reveal` | plataforma | — |
| `seal.enrollment_access` (negada) | plataforma | motivo |

## Limites

| Limite | Valor | Onde |
|---|---|---|
| Pedidos novos por endereço | 20 por hora | `private.seal_enroll_rate_windows` (`enroll:` + resumo) |
| Chamadas de um pedido pendente | 6 por minuto | `private.seal_enroll_rate_windows` (`pending:` + id do pedido), o mesmo valor da Spec 012 |
| Expiração de pendente | 7 dias sem chamada | `private.run_seal_watchdog()` |
| Recusado tenta de novo | a cada 1 h | firmware |
| Portal sem rede salva | 15 min aberto, 5 min fechado | firmware |
| Botão para reabrir o portal | 5 s | firmware |
