# Contrato: verificações automáticas

**Atende**: RF-001 a RF-043, RNF-001 a RNF-006, CA-001 a CA-012, MS-001 a MS-012

Cada linha começa como teste que falha (TDD, princípio II). As suítes `.live` rodam contra o Supabase local com o simulador de lacre; o E2E usa backend simulado; as capturas visuais são regeneradas no Linux.

## Banco (pgTAP, `supabase/tests/012_*.test.sql`)

| Arquivo | O que prova | Requisitos |
|---|---|---|
| `012_rls.test.sql` | todas as tabelas novas com **dois tenants**: o Tenant B não lê nem altera nada do A, nem por RPC com identificadores trocados; `authenticated` sem acesso direto; política de `realtime.messages` aceita só o tópico da própria organização com `seal.read` | RF-037, CA-001, MS-007 |
| `012_permissions.test.sql` | cada operação nega quem não tem a permissão; papéis padrão do contrato; `seal.admin` crítica; destravamento excepcional sem `aal2` responde `MFA_REQUIRED` | RF-025, RF-038, RN-005 |
| `012_device_auth.test.sql` | chave certa aceita; sem chave, errada, de outro dispositivo, dispositivo inativo e inexistente dão o **mesmo** resultado; troca de chave invalida a antiga na hora; nenhum texto de chave guardado | RF-002, RF-031, CA-006 |
| `012_rate_limit.test.sql` | 7º pedido no minuto recusado com alerta único; 10 chaves erradas bloqueiam o endereço sem revelar o dispositivo; a mensagem recusada pode ser reenviada depois | RF-006 |
| `012_ingest_dedupe.test.sql` | mensagem repetida responde `duplicate` e devolve o comando; posição a até 20 m com mesma qualidade e estado só atualiza `last_seen_at`; acima de 20 m, mudança de qualidade ou de estado cria ponto; oscilação perto do limite compara com a última **guardada**; 1.440 leituras paradas geram 1 ponto | RF-003, RF-009, RN-009, CA-003, MS-001, MS-002 |
| `012_ingest_batch.test.sql` | lote de até 50 com resultado por item; 51 recusado; leituras atrasadas não mudam a última posição nem a saúde e não disparam violação; última posição pelo `read_at` | RF-004, RF-010, casos de borda |
| `012_binding.test.sql` | vínculo um para um; recusas `SEAL_ALREADY_BOUND` e `CYLINDER_ALREADY_BOUND`; desvínculo recusado em viagem em andamento; inativação do cilindro e do dispositivo encerra o vínculo; mensagem sem vínculo fica só no dispositivo | RF-005, RF-033, RF-034 |
| `012_trip_lock.test.sql` | início da viagem cria um `lock` por cilindro com lacre e nenhum para os sem lacre; repetição não duplica; a viagem começa sem confirmação; `executed` → `locked`; `error` → `unconfirmed` com alerta | RF-023, RF-027, RN-008, MS-003 |
| `012_command_lifecycle.test.sql` | todas as transições válidas e as inválidas; comando novo cancela o pendente; confirmação de cancelado não muda a trava; comando de outro dispositivo ou organização recusado; entregue sem confirmação expira em 10 min; trava não entregue **não expira** e abre alerta aos 30 min; rede não entregue expira aos 30 min | RF-026 a RF-029, CA-002 |
| `012_delivery_unlock.test.sql` | entrega dentro da geocerca com posição do lacre de até 2 min → `unlock` com prova `seal`; sem ela, celular com origem `gps` → prova `phone`; digitada ou no endereço não comprova; fora, sem geocerca ou não entregue → nada e motivo gravado; trava "não confirmada" ou travar pendente → `unlock` e cancelamento; correção para não entregue → `lock`; desbloqueio lógico da Spec 008 junto | RF-024, MS-004 |
| `012_geofence_watch.test.sql` | vigilância começa na entrega e termina na nova viagem, no estoque e no desvínculo; duas posições com GPS fora além de 50 m → violação, `lock` na **mesma** resposta e alerta alto; uma só ou sem GPS → nada; violação aberta não repete; retorno à área não destrava nem encerra; geocerca inativada suspende com alerta médio; versão da vigilância sobe quando a geocerca muda | RF-018 a RF-022a, RN-004, MS-005 |
| `012_auto_lock.test.sql` | `auto_lock` registra `locked_comm_loss`, alerta alto e processa as leituras guardadas pela regra de violação, sem comando novo | RF-022a, RN-011, MS-011 |
| `012_watchdog.test.sql` | `no_comm` depois de intervalo + 30 s: `possible_loss` alto em viagem ou vigilância e `no_comm` médio no estoque; desligamento avisado: `off` na hora; `no_gps` depois de 3 intervalos; volta registra `recovered_at` e mantém o alerta aberto; nunca muda a situação do cilindro; rodar duas vezes não duplica nada | RF-013 a RF-017, CA-007, MS-006 |
| `012_alerts.test.sql` | alertas do lacre na mudança e sem duplicar; reconhecer e encerrar com observação e auditoria; lista única | RF-016, RF-035, RF-036 |
| `012_wifi_commands.test.sql` | adicionar, remover e voltar à padrão; limite de 5; aviso de risco com viagem ou vigilância; senha no Vault e apagada ao confirmar, falhar, cancelar ou expirar; `error` com motivo abre alerta médio; um comando de rede por vez, na ordem | RF-034a a RF-034f, CA-008, CA-009 |
| `012_push_outbox.test.sql` | outbox só para alertas que exigem push e só para inscrições de quem tem `seal.read` naquela organização; uma por aparelho por alerta; retorno gera a de volta; perder a permissão revoga a inscrição | RF-036a, RF-036d, CA-010 |
| `012_audit.test.sql` | toda ação do RF-039 gera auditoria na mesma transação, sem chave, senha ou coordenada | RF-039, CA-004 |
| `012_no_delete.test.sql` | nenhuma tabela nova aceita `delete` nem `truncate` | RF-041 |
| `012_limits_contract.test.sql` | `private.seal_limits()` igual a `src/domain/seals/seal-limits.ts` | data-model, "Limites" |

## Bordas e contrato (Vitest)

| Arquivo | O que prova | Requisitos |
|---|---|---|
| `tests/contract/seal-protocol.test.ts` | todos os exemplos de `tests/fixtures/seal-protocol/` passam no esquema da borda; todo tipo de mensagem e de resposta tem exemplo | CA-011 |
| `tests/contract/seal-gateway-handler.test.ts` | método, cabeçalhos, corpo, `401` único, `429` com `Retry-After`, `400`, `503`; a borda nunca registra corpo nem resposta | RF-002, RF-006, CA-006 |
| `tests/contract/manage-seals-handler.test.ts`, `query-seals-handler.test.ts` | catálogo de operações, `request_id`, mapeamento HTTP, nenhuma operação de exclusão | RF-037, RF-041 |
| `tests/contract/seals-no-secrets-in-logs.test.ts` | nenhuma chave, senha de rede ou coordenada em log, auditoria, evento ou notificação | RF-039, RF-040, CA-008, CA-010 |
| `tests/contract/seals-permissions.test.ts` | permissões e papéis iguais ao contrato | RF-038 |
| `tests/contract/seal-push-handler.test.ts` | segredo obrigatório, lote, revogação em `404`/`410`, texto sem dado sensível | RF-036a a RF-036d |
| `src/domain/seals/*.test.ts` | vocabulário (texto e ícone), idade em texto, habilidades por permissão, motivos offline | RF-042, RF-043 |
| `src/application/seals/*.test.ts` | serviço, tempo real com consulta de reserva a cada 30 s, inscrição push, nada sensível guardado no aparelho | RNF-001, RF-036b |
| `src/pages/seals/**/*.test.tsx`, `src/pages/alerts/*.test.tsx` | lista, detalhe, cadastro com chave uma vez, vínculo, comandos, redes, alertas, blocos no cilindro e na viagem; carregando, vazio, erro, offline; anúncio sem roubar o foco | RF-011, RF-031 a RF-036, RF-042 |
| `tests/contract/escalas-no-codigo.test.ts` (existente) | só tokens nas telas novas | RNF-005 |

## Integração e ponta a ponta

| Arquivo | O que prova | Requisitos |
|---|---|---|
| `tests/integration/seals-*.live.test.ts` | com o simulador e dois tenants: posição até a tela em até 10 s (aviso Realtime + consulta), viagem com trava, entrega com destravamento, violação, desligamento, sem GPS, lote atrasado, troca de rede com falha | RNF-001, MS-001 a MS-006, MS-010 |
| `tests/e2e/lacres-*.spec.ts` | jornadas em 360, 768 e 1920 px, só com teclado, axe sem violação crítica ou grave, sem rolagem horizontal, offline | CA-005, MS-008, MS-009 |
| `tests/e2e/visual/lacres-*.spec.ts` | capturas visuais das telas novas (Linux) | padrão da Spec 005 |
| tamanho de `dist/assets/index-*.js` depois de `npm run build`, comparado com o `baseline.md` desta spec | pacote de entrada até +5 % | RNF-006 |

## Firmware (`firmware/`)

| Comando | O que prova | Requisitos |
|---|---|---|
| `pio test -e native` | fila de leituras e lotes de 50; escolha de rede e volta à padrão; teste da rede nova antes de guardar; vigilância (círculo, polígono, 50 m, duas posições) e trava por perda de comunicação; leitura e escrita do protocolo com os exemplos de `tests/fixtures/seal-protocol/` | CA-011, CA-012, MS-011 |
| `pio run -e esp32c3` | o firmware compila | CA-012 |
| varredura do CI | nenhum `secrets.h`, chave, senha ou endereço real versionado em `firmware/` | CA-012, RF-040 |

## Validação humana (lacre físico)

Roteiro da História 8 em [quickstart.md](../quickstart.md), executado com Natã da Silva Baracho; resultado no `validation.md` e no RIA (MS-012).
