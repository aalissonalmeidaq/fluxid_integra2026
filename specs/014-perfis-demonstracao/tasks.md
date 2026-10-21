# Tarefas: Perfis de demonstração e acessos de teste na página de login

**Entrada**: documentos de `specs/014-perfis-demonstracao/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Testes**: obrigatórios (constituição, princípio II). Em cada fatia, os testes vêm antes do código e precisam falhar antes da implementação.

**Organização**: por história de usuário, para cada uma ser implementada e testada de forma independente.

## Formato: `[ID] [P?] [História] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[USn]**: a história da spec a que a tarefa pertence

---

## Fase 1: Preparação

- [X] T001 Abrir a issue "Spec 014: perfis de demonstração e acessos de teste" com a conta `equipefluxid` e registrar o número em `specs/014-perfis-demonstracao/plan.md` (Rastreabilidade).
- [X] T002 Registrar a linha de base em `specs/014-perfis-demonstracao/baseline.md`: tamanho do pacote de entrada (`dist/assets/index-*.js`), contagem de testes pgTAP e Vitest, e o estado da nuvem (tenant "Oxigênio Cariri" inativo, sem vínculos, sem cilindros; lacre `DSP-P77E49TC` em `pending`).

---

## Fase 2: Fundação (bloqueia todas as histórias)

- [X] T003 [P] Escrever `tests/contract/demo-accounts.test.ts` para `src/domain/demo/demo-access.ts`: o JSON tem exatamente 5 perfis, um para cada papel "`tenant_admin`, `stock_operator`, `technical_operator`, `tenant_auditor`, `driver`"; `display_name` "2 a 100 caracteres"; `description` "até 120 caracteres"; `email` "`<papel>@demo.fluxid.invalid`, único"; `password` "no formato `FluxID-Demo-NN!` (15 caracteres, minúsculas, maiúsculas, números e símbolo)"; `user_id` e `membership_id` uuids distintos; `tenant.id` = `5478e9e3-155b-482f-b843-3513e0938dd6`; `cylinder.serial_number` = `C262`; `seal.device_code` = `DSP-P77E49TC`; nenhum papel global [RF-001, RF-002, RF-003; data-model.md].
- [X] T004 Criar `src/domain/demo/acessos-demonstracao.json` e `src/domain/demo/demo-access.ts` (tipos, validação e `demoAccessEnabled()`, que lê `import.meta.env.VITE_DEMO_ACCESS` e só desliga com `false`), até T003 passar; declarar `VITE_DEMO_ACCESS` em `.env.example` com o comentário de que é pública [research.md, itens 1, 2, 9 e 10].
- [X] T005 [P] Escrever `supabase/tests/014_demo_markers.test.sql`: `private.demo_tenant` aceita só 1 linha e só organização `kind = 'tenant'`; `private.demo_accounts` com `email` único e em minúsculas, `role_code` só nos 5 papéis e `user_id` sem chave estrangeira para `auth.users` (a fase `markers` grava antes do usuário existir); `private.is_demo_tenant`, `private.is_demo_account` e `private.is_demo_email` respondem certo e falso para o Tenant A; `anon` e `authenticated` não leem as duas tabelas nem executam `public.demo_restore` [RN-004; data-model.md].
- [X] T006 Criar `supabase/migrations/20261020170000_demo_markers.sql` com `private.demo_tenant`, `private.demo_accounts` e as três funções `private.is_demo_*`, até T005 passar.

**Ponto de controle**: a fonte única e as marcas no banco existem. O seed local (T007 e T008) fica na Fase 4, logo depois do T019.

---

## Fase 3: História 1, o visitante vê os acessos de teste e entra (P1) 🎯 MVP

**Objetivo**: na tela de login, o botão "Acessos de teste" abre o modal com os 5 perfis e preenche o formulário sem enviar.

**Teste independente**: abrir o login, escolher um perfil, ver o formulário preenchido e o foco em Entrar, entrar e chegar à Visão geral do "Oxigênio Cariri".

### Testes (escrever antes, precisam falhar)

- [X] T009 [P] [US1] Escrever `src/pages/auth/test-accesses-dialog.test.tsx`: o botão "Acessos de teste" abre o diálogo de nome "Acessos de teste"; o aviso de acessos públicos; os 5 itens com papel, descrição, e-mail e senha visíveis; "Usar este acesso de <papel>" chama `onUse` com e-mail e senha e fecha; Escape e "Fechar" fecham e devolvem o foco ao botão [RF-006 a RF-008; contracts/acessos-de-teste.md].
- [X] T010 [P] [US1] Estender `src/pages/auth/login-page.test.tsx`: "Usar este acesso" preenche e-mail e senha, leva o foco a "Entrar" e não chama `login` [RF-007].
- [X] T011 [P] [US1] Escrever `tests/e2e/acessos-de-teste.spec.ts` com o backend simulado: jornada só com teclado (abrir, Tab preso no modal, escolher o administrador, Entrar); axe sem violação crítica ou grave; sem rolagem horizontal; e entrar chega à Visão geral; incluir `acessos-de-teste` em `LARGURAS_DE_REFERENCIA` de `playwright.config.ts` (360, 768 e 1920 px e WebKit) [RF-010, MS-001].
- [X] T012 [P] [US1] Escrever `tests/integration/demo-accounts.live.test.ts` (Supabase local com o seed): os 5 perfis entram com as senhas do JSON, chegam ao "Oxigênio Cariri" e o administrador vê o C262 em `query-cylinders` [MS-002].

### Implementação

- [X] T013 [US1] Criar `src/pages/auth/test-accesses-dialog.tsx` (botão secundário e `Dialog` do design system, só tokens, 44 px de toque, itens um abaixo do outro em 360 px), até T009 passar; usar a skill `ui-ux-pro-max` para o layout do modal.
- [X] T014 [US1] Integrar em `src/pages/auth/login-page.tsx` com `React.lazy` dentro de uma condição constante sobre `import.meta.env.VITE_DEMO_ACCESS !== 'false'`, para o Vite eliminar o import quando desligado; "Usar este acesso" chama `setEmail`, `setPassword` e foca `submitRef`, até T010, T011 e T012 passarem.
- [X] T015 [US1] Gerar no Linux a captura visual `tests/e2e/visual/acessos-de-teste.visual.spec.ts` (modal aberto em 360, 768 e 1920 px), com `npm run build` antes, e conferir as imagens.

**Ponto de controle**: no ambiente local, um visitante entra com qualquer um dos 5 perfis pelo modal.

---

## Fase 4: História 2, os mesmos acessos no local e na nuvem (P1)

**Objetivo**: script idempotente que cria ou restaura a demonstração na nuvem e rotina diária no GitHub.

**Teste independente**: partindo do seed, bagunçar a demonstração (bloquear um vínculo, inativar o C262), rodar o script duas vezes e conferir 1 tenant, 5 perfis e o C262 restaurados, e nada mudado no Master e nos outros tenants. A criação do zero é coberta pelo pgTAP (T016).

### Testes (escrever antes, precisam falhar)

- [X] T016 [P] [US2] Escrever `supabase/tests/014_demo_restore.test.sql` (o banco de teste já tem a demonstração do seed: o teste apaga a demonstração dentro da transação, com `rollback` no fim, para testar a criação do zero, e depois as execuções seguintes): `public.demo_restore` cria ou reativa o tenant, os perfis, os vínculos ativos e um papel por usuário; cria o tipo e o C262 ativo em estoque pelas operações do domínio, com evento no histórico; a segunda chamada responde `unchanged` em tudo; vínculo bloqueado, papel trocado e C262 inativo voltam ao publicado; com vínculo que não é de demonstração responde `DEMO_FOREIGN_MEMBERS` sem alterar nada; C262 em viagem em andamento responde `skipped_in_trip`; lacre destinado e sem vínculo fica `bound`, não destinado fica `not_assigned`; grava `demo.restore` na auditoria da plataforma sem senha; a fase `markers` grava `private.demo_accounts` com a senha publicada antes da fase `state`, e trocar a senha publicada no manifesto e rodar de novo atualiza a tabela, com o gatilho passando a aceitar só a nova; com 3 sessões ativas de visitantes no administrador de demonstração, a restauração funciona, as 3 sessões continuam ativas e a sessão `service` não aparece na lista de sessões ativas do visitante; Master e Tenant A intactos [RF-005, RF-013, RF-014, MS-004; contracts/restauracao-da-demonstracao.md]. (Feito com um manifesto de teste próprio, sem apagar a demonstração do seed; a parte do gatilho aceitar só a senha nova ficou no T023, porque o gatilho nasce no T028.)
- [X] T017 [P] [US2] Escrever `tests/contract/demonstracao-script.test.ts` para `scripts/operacao/demonstracao.mjs` com dublê do Admin API: valida o JSON antes de tudo; cria o usuário com o id do JSON e a senha publicada, ou atualiza senha e e-mail confirmado; e-mail já usado por outro id para sem alterar nada; recusa URL fora de `https://<ref>.supabase.co` sem `--permitir-fora-da-nuvem`; nunca imprime a chave nem senha; repassa o resumo de `demo_restore`.
- [X] T018 [P] [US2] Escrever `tests/integration/demo-restore.live.test.ts`: partindo do estado do seed, bloquear um vínculo e inativar o C262, rodar o script contra o Supabase local duas vezes, conferir que voltaram ao publicado, que a segunda execução responde `unchanged` e que os 5 perfis entram.

### Implementação

- [X] T019 [US2] Criar `supabase/migrations/20261020170100_demo_restore.sql` com `public.demo_restore(p_manifest jsonb, p_phase text)` (`security definer`, executável só por `service_role`), nas fases `markers` e `state`: checa vínculos estranhos, reativa tenant, perfis, vínculos e papéis, abre e encerra uma sessão de serviço do administrador de demonstração que não entra na contagem do limite de sessões (Spec 002) nem encerra as dos visitantes e usa `save_cylinder_type`, `create_cylinder`, `stock_in_cylinder`, `reactivate_cylinder` e `bind_seal`, até T016 passar.
- [X] T020 [US2] Criar `scripts/operacao/demonstracao.mjs` no molde de `scripts/operacao/primeiro-master.mjs` e o comando `operacao:demonstracao` em `package.json`, chamando `demo_restore` na ordem `markers` → Auth → `state`, até T017 e T018 passarem.
- [X] T021 [US2] Criar `.github/workflows/restaurar-demonstracao.yml` (`schedule: '23 6 * * *'` e `workflow_dispatch`, `vars.SUPABASE_CLOUD_URL` e `secrets.SUPABASE_SERVICE_ROLE_KEY`, erro claro sem o segredo, só o resumo na saída) [RF-017].

#### Seed local da demonstração (depois do T019, porque usa `demo_restore`)

- [X] T007 Escrever `tests/contract/demo-accounts-parity.test.ts`: o manifesto inline de `supabase/seeds/demonstracao.sql` e os 5 usuários inseridos (id, e-mail e senha) são exatamente os do JSON; reprova qualquer diferença [RF-002, RF-004].
- [X] T008 Criar `supabase/seeds/demonstracao.sql`: inserir só os 5 usuários em `auth.users` (id, e-mail e senha do JSON, e-mail confirmado) e chamar `public.demo_restore(<manifesto>, 'markers')` e `public.demo_restore(<manifesto>, 'state')` com o mesmo manifesto do JSON, inline. Assim o tenant, os perfis, os vínculos, os papéis, as marcas e o C262 vêm do mesmo caminho da nuvem, pelas operações do domínio. Incluir em `sql_paths` de `supabase/config.toml` depois de `./seed.sql`, até T007 passar; `npx supabase db reset`.

**Ponto de controle**: o script cria e restaura a demonstração e a rotina está pronta para receber o segredo.

---

## Fase 5: História 3, a demonstração não alcança a plataforma nem outros tenants (P1)

**Objetivo**: isolamento testado e as restrições de RF-016 no servidor.

**Teste independente**: com o Tenant A e o Master, cada perfil de demonstração é negado fora do "Oxigênio Cariri" e nas telas da plataforma; convites, devolução do lacre e troca de senha são recusados.

### Testes (escrever antes, precisam falhar)

- [X] T022 [P] [US3] Escrever `supabase/tests/014_demo_isolation.test.sql`: cada perfil de demonstração lê e altera só o "Oxigênio Cariri" (RLS com dois tenants, permitido e bloqueado); nenhuma permissão `scope = 'global'`; `platform.manage` negado; o administrador de demonstração tenta, por `save_role` e por `assign_role`, criar ou dar um papel com permissão global (`platform.manage`, `master.manage`) e é recusado, com a negação auditada [RF-003, RF-012, MS-003].
- [X] T023 [P] [US3] Escrever `supabase/tests/014_demo_restrictions.test.sql`: `reserve_tenant_invitation` e `invite_first_tenant_admin` no tenant da demonstração respondem `DEMO_RESTRICTED` e auditam a negação; `return_device` no tenant da demonstração responde `DEMO_RESTRICTED`; o gatilho de `auth.users` recusa uma senha diferente da publicada para usuário de demonstração e aceita a publicada; a recusa da troca de senha não grava `audit_logs` (só as de convite e devolução gravam); nada disso muda para o Tenant A [RF-016].
- [X] T024 [P] [US3] Estender `tests/contract/password-recovery.test.ts`: e-mail de demonstração responde o mesmo 202 genérico, não emite link e registra a entrega como `not_applicable` [RF-016 c].
- [X] T025 [P] [US3] Estender `tests/contract/invitations.test.ts`, `tests/contract/organizations.test.ts` e `tests/contract/manage-seals-handler.test.ts`: `DEMO_RESTRICTED` vira 403 com o corpo do banco.
- [X] T026 [P] [US3] Estender os testes de tela de Pessoas do tenant e do diálogo de devolver o lacre: `DEMO_RESTRICTED` mostra os textos de `contracts/acessos-de-teste.md`.
- [X] T027 [P] [US3] Estender `tests/integration/demo-accounts.live.test.ts`: cada perfil de demonstração recebe "Acesso negado" nas funções da plataforma e "inexistente" para dados do Tenant A, e as negações por permissão (`ACCESS_DENIED`) desses pedidos ficam em `audit_logs`; o convite é recusado; a troca de senha por `updateUser` com a sessão do próprio visitante é recusada.

### Implementação

- [X] T028 [US3] Criar `supabase/migrations/20261020170200_demo_restrictions.sql`: `DEMO_RESTRICTED` em `reserve_tenant_invitation`, `invite_first_tenant_admin` e `return_device` (com negação auditada) e o gatilho `demo_password_guard` em `auth.users`, até T022 e T023 passarem; `npx supabase stop` e `npx supabase start`.
- [X] T029 [US3] Ajustar `supabase/functions/password-recovery/handler.ts` e o gateway para não emitir link a e-mail de demonstração, registrando a entrega como `not_applicable` (a coluna `result` de `audit_logs` só aceita `success`, `denied` e `failed`), até T024 passar.
- [X] T030 [US3] Mapear `DEMO_RESTRICTED` para 403 nas bordas de `invite-user`, `manage-organizations`, `manage-seals` e `_shared/operations.ts`, até T025 passar.
- [X] T031 [US3] Mostrar os textos das restrições nas telas de convite e de devolver o lacre, até T026 e T027 passarem.

**Ponto de controle**: as senhas públicas não abrem nada fora do "Oxigênio Cariri".

---

## Fase 6: História 4, desligar os acessos de teste (P2)

**Objetivo**: com `VITE_DEMO_ACCESS=false`, nenhuma credencial no site.

**Teste independente**: build desligado sem nenhum e-mail `@demo.fluxid.invalid` em `dist/`.

- [X] T032 [P] [US4] Estender `src/pages/auth/login-page.test.tsx`: com `demoAccessEnabled()` falso, sem botão nem modal [RF-009].
- [X] T033 [P] [US4] Escrever `tests/contract/demo-access-build.test.ts`: um build com `VITE_DEMO_ACCESS=false` não contém nenhum e-mail de demonstração em `dist/`; com a variável ausente, contém, só num pedaço carregado sob demanda [MS-005].
- [X] T034 [US4] Confirmar o corte em tempo de build feito no T014, em `src/pages/auth/login-page.tsx`, até T032 e T033 passarem; ajustar só se o build com `VITE_DEMO_ACCESS=false` ainda tiver alguma credencial.

---

## Fase 7: Polimento e encerramento

- [X] T035 [P] Atualizar `docs/publicacao-em-nuvem.md` (script da demonstração, aprovação do lacre pelo Master, segredo `SUPABASE_SERVICE_ROLE_KEY` e o workflow), `README.md` e `docs/prd.md`.
- [ ] T036 Rodar a rodada completa: `npm run lint`, `npm run typecheck`, `npm run test:coverage` (sem reduzir limites), `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build` e `npx playwright test`, e as capturas no Linux; anotar os números em `specs/014-perfis-demonstracao/validation.md`.
- [ ] T037 Publicar na nuvem com confirmação da pessoa responsável: `db push --dry-run` e `db push` das 5 migrations novas; publicar `password-recovery`, `invite-user`, `manage-organizations` e `manage-seals`; a pessoa responsável roda `npm run operacao:demonstracao`; o Master real aprova o lacre `DSP-P77E49TC` para o "Oxigênio Cariri"; rodar o script de novo e conferir o vínculo; cadastrar o segredo e rodar o workflow à mão uma vez; no site publicado, entrar com os 5 perfis pelas credenciais do modal (MS-002, nuvem); cronometrar da abertura do login até a Visão geral (MS-001, até 30 s) e do envio do lacre até a posição aparecer no C262 para o administrador de demonstração (MS-006, até 1 minuto); anotar em `specs/014-perfis-demonstracao/validation.md`.
- [ ] T038 Conferir que nenhuma chave de serviço, senha real ou a senha da rede de configuração entrou no repositório, no pacote ou nos logs; as únicas senhas versionadas são as 5 de demonstração (RN-001). Estender `tests/contract/client-secrets.test.ts`: acrescentar `/^FluxID-Demo-\d{2}!$/` a `SYNTHETIC_VALUES`, com a justificativa "senhas públicas dos acessos de demonstração (Spec 014, RN-001), válidas só no tenant da demonstração", e um teste novo que reprova esse formato em qualquer arquivo fora de `src/domain/demo/acessos-demonstracao.json`, `supabase/seeds/demonstracao.sql` e testes, para a exceção não se espalhar.
- [ ] T039 **Gate de registro de IA** (AGENTS.md): `git add` explícito; `npm run ia:registro -- --spec 014 --ciclo 01 --titulo "Perfis de demonstração e acessos de teste"`; entrevistar a pessoa responsável pela validação (quem validou; amostra; ambiente; duração; resultado; itens a corrigir; decisão com justificativa; confirmação), sem presumir; preencher o RIA, atualizar `docs/governanca-ia/indice.md`, rodar `npm run ia:validar` e commitar, sem `--no-verify` e sem linhas de coautoria.
- [ ] T040 Abrir o pull request com a conta `equipefluxid`, citando a issue, e trocar no RIA o link de revisão pelo do PR; aguardar os checks e a revisão humana.
- [ ] T041 Depois do merge, entregar o DOCX do RIA na branch `docs/ria-NNN-docx`.

---

## Fase 8: Pedidos do responsável durante a implementação (20/10/2026)

- [X] T042 Mostrar a rede em uso do lacre como "GSM/Telemetria" no painel de redes Wi-Fi (`src/pages/seals/components/wifi-networks-panel.tsx`), em vez do nome do Wi-Fi; o nome real continua nas listas de redes guardadas e disponíveis. Testes em `wifi-networks-panel.test.tsx` e `seal-detail-page.test.tsx`.
- [X] T043 Trocar "tenant" por "empresa" em todo texto visível do app (telas, menus, mensagens, modal dos acessos de teste) e nos nomes e descrições dos papéis padrão vindos do banco (migration nova que atualiza `roles` e `bootstrap_tenant_roles`), com concordância ("do tenant" → "da empresa"). Código, identificadores, tabelas, specs fechadas e documentação técnica ficam como estão. Atualizar testes e capturas visuais.

## Fase 9: Dados de exemplo da demonstração (pedido de 20/10/2026, RF-018)

- [X] T044 Acrescentar a seção `sample` em `src/domain/demo/acessos-demonstracao.json` (tipos e 12 cilindros com teste hidrostático, 3 clientes com unidades e geocercas, 2 veículos, 2 motoristas, 3 viagens e 4 lacres simulados com o alerta publicado de cada um) e validá-la em `demo-access.ts` e no script; estender `tests/contract/demo-accounts.test.ts`.
- [X] T045 Escrever `supabase/tests/014_demo_sample.test.sql` sobre o estado do seed: os registros publicados existem e foram criados pelas operações do domínio (histórico e auditoria do administrador de demonstração); o motorista publicado está ligado ao perfil Motorista; as três viagens estão planejada, em andamento e concluída; os 4 lacres simulados estão vinculados, com posição e o alerta publicado aberto; a segunda restauração responde `unchanged`; cliente, veículo e cilindro inativados por um visitante voltam ao ativo, e a viagem planejada que um visitante iniciou ganha uma nova planejada; Master e Tenant A intactos.
- [X] T046 Criar `supabase/migrations/20261020170400_demo_sample.sql`: `private.demo_records` (referência publicada → id), o manifesto guardado em `private.demo_tenant`, e a fase `state` de `demo_restore` passando pelos dados de exemplo com `create_customer`, `create_site`, `create_geofence`, `create_vehicle`, `create_driver`, `link_driver_user`, `create_cylinder`, `register_hydrostatic_test`, `stock_in_cylinder`, `create_trip`, `start_loading`, `check_item`, `start_trip`, `arrive_stop`, `register_delivery`, `complete_trip`, `create_device`, `bind_seal` e `seal_ingest`, até T045 passar; regenerar o manifesto do seed.
- [ ] T047 Atualizar o contrato da restauração (resumo `sample`), o quickstart, `docs/publicacao-em-nuvem.md` e o README; rodar de novo pgTAP, Vitest, `.live` e E2E.

## Dependências e ordem de execução

- **Fase 1** → **Fase 2**: a fundação (JSON e marcas, T003 a T006) bloqueia todas as histórias.
- O seed da demonstração (T007, T008, na Fase 4) depende de `demo_restore` (T019). Na entrega, a ordem fica: T003 a T006 → T016 e T019 → T007 e T008 → História 1.
- **História 1** depende da fundação e do seed (T008): é o MVP (o modal funciona no local com o seed).
- **História 2** depende da fundação; T019 usa as operações do domínio já existentes.
- **História 3** depende da fundação; pode correr junto da História 2 (arquivos diferentes), mas T037 precisa das duas.
- **História 4** depende da História 1 (o componente do login).
- **Polimento** depois de todas.

### Dentro de cada história

Testes primeiro (falhando), depois banco, depois bordas, depois telas.

### Oportunidades de paralelismo

- Fase 2: T003 e T005 juntos.
- História 1: T009, T010, T011 e T012 juntos.
- História 2: T016, T017 e T018 juntos.
- História 3: T022 a T027 juntos.

## Exemplo de paralelo: História 3

```text
T022 supabase/tests/014_demo_isolation.test.sql
T023 supabase/tests/014_demo_restrictions.test.sql
T024 tests/contract/password-recovery.test.ts
T025 testes de contrato de invite-user, manage-organizations e manage-seals
```

## Estratégia de implementação

### MVP primeiro

1. Fases 1 e 2 (sem o seed), T016 e T019, depois T007 e T008.
2. História 1: o modal funciona no local.
3. **Parar e validar** com o roteiro do quickstart, seção 1.

### Entrega incremental

1. Fundação → História 1 (modal no local).
2. História 3 (restrições e isolamento), antes de publicar senha nenhuma na nuvem.
3. História 2 (script e rotina) → publicação na nuvem (T037).
4. História 4 (desligar).

## Notas

- A ordem de entrega recomendada coloca a História 3 antes da publicação na nuvem: as senhas só vão ao site com as restrições no ar.
- Os perfis e o C262 da demonstração vêm sempre de `demo_restore`, no seed local e no script da nuvem; só os usuários do Auth são inseridos direto no seed, porque o Admin API não existe dentro do banco (research.md, item 7).
