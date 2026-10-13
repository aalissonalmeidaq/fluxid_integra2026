# Plano de implementação: Fila offline, fotos e assinatura de entrega no aplicativo de campo

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/010-fila-offline-fotos-assinatura/spec.md` (31 requisitos funcionais, 7 não funcionais, 7 regras de negócio, 8 critérios de aceitação e 7 metas de sucesso; 8 decisões na seção Clarifications, incluindo foto e assinatura opcionais e dados sensíveis na fila só até o envio confirmado).

## Resumo

Fazer o aplicativo de campo continuar útil sem sinal e dar à entrega uma evidência. A pessoa confere, chega e entrega **offline**; cada operação vira um pedido pendente numa fila no aparelho; ao voltar a conexão o aplicativo envia tudo em ordem, sem duplicar, e preserva qualquer conflito para uma decisão humana. A entrega ganha até **três fotos** e a **assinatura do recebedor**, enviadas como anexos depois do registro principal. A instalação em Android é confirmada num endereço HTTPS real.

A abordagem **aproveita a pilha de sincronização que a Spec 002 já construiu e deixou desligada**, em vez de criar outra:

- **Peça existente 1, base local** (`src/infrastructure/local-database`): IndexedDB `fluxid-local`, com travas por tenant e as lojas `local_outbox`, `local_sync_cursors` e `local_sync_conflicts`. Passa para a versão 2, com duas lojas novas (viagem guardada e anexos) e a partição por conta e destino.
- **Peça existente 2, outbox** (`sync-outbox.ts`): estados `pending`, `syncing`, `synced`, `conflict`, `failed` e `discarded`, chave de idempotência, dependências entre itens, descarte autorizado e auditado, contagem de tentativas. É a fila da spec.
- **Peça existente 3, coordenador e conflitos** (`sync-coordinator.ts`, `conflict-resolver.ts`, `endpoint-promotion-coordinator.ts`): empurrar antes de puxar, conflito sem resolução automática que **preserva as duas versões**, e a promoção de destino que espera a fila esvaziar. Já atendem as regras da arquitetura de conectividade.
- **Peça existente 4, política offline** (`offline-operation-policy.ts`): hoje a lista de operações offline é **vazia por decisão da Spec 002**. Esta spec a preenche com exatamente **quatro operações na outbox**: `trip.check_item`, `trip.uncheck_item`, `trip.arrive_stop` e `trip.deliver`; os anexos (foto e assinatura) seguem pelo envio próprio de anexos, depois da entrega confirmada.
- **Peça existente 5, servidor das viagens**: `manage-trips` já é atômico, auditado e **idempotente por `request_id`** (`private.trip_requests`). O envio da fila usa essas mesmas operações, com o `request_id` igual à chave de idempotência da outbox. A função genérica `sync-command` (que só registra a idempotência, sem efeito de domínio) **não é usada** para estas operações.
- **Peça nova 1, executores por operação**: o envio atual (`PushSynchronizer`) chama `sync-command`; ele ganha um registro de **executores** que traduzem cada item da outbox para a chamada certa de `manage-trips` e interpretam a resposta (sucesso, conflito, falha, interrupção).
- **Peça nova 2, viagem guardada e leitura offline**: uma consulta `get_trip_offline` devolve a viagem e, para cada cilindro previsto, os identificadores ativos normalizados; o aparelho guarda só isso para conferir por leitura sem servidor.
- **Peça nova 3, evidência de entrega**: uma tabela `trip_delivery_attachments`, um bucket privado `trip-evidence` e uma função `trip-attachments` que valida os bytes reais, o limite, a permissão e a idempotência por anexo, no padrão do avatar da Spec 002. O cliente nunca escreve no bucket.
- **Peça nova 4, trilha de sincronização**: o registro imutável `private.trip_sync_events` (aplicada, repetida, conflito, descartada, reenviada) e a operação de resolução de conflito, auditada.
- **Ajustes de regra no servidor**: `arrive_stop` e `register_delivery` passam a medir a validade da posição contra o **horário informado do registro** (hoje contra `now()`, o que rejeitaria posição sincronizada horas depois) e a recusar operação de origem offline informada há mais de 7 dias.
- **Cliente (padrão herdado)**: `domain/` (regras da fila, janela de tempo, limites de anexo), `application/` (serviço de sincronização de campo e de anexos), `infrastructure/` (executores, câmera de foto, assinatura, travas de aba), `pages/` (tela Sincronização, indicador na barra superior, blocos de foto e de assinatura na entrega), sem regra de domínio em componentes React.
- **Interface**: padrão visual da Spec 005 e skill `ui-ux-pro-max`; **nenhuma entrada nova no menu** (a tela Sincronização abre pelo indicador da barra superior).

Fica de fora, por decisão da spec: trava física e IoT (Fase 6), rastreamento contínuo, proximidade, alertas e relatórios (Fase 7), exigir foto ou assinatura por organização, cifra do conteúdo da fila no aparelho, envio em segundo plano com o aplicativo fechado e o prazo de retenção de coordenadas e evidências (spec de privacidade).

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase) e Edge Functions em Deno, como nas specs anteriores

**Dependências principais**: as já existentes. **Nenhuma dependência nova**: IndexedDB, Web Locks, BroadcastChannel, `navigator.storage`, canvas e `<input type="file" capture>` são recursos nativos do navegador, com detecção de suporte em tempo de execução

**Armazenamento**: no servidor, 2 tabelas novas (`public.trip_delivery_attachments`, `private.trip_sync_events`), 1 bucket privado (`trip-evidence`), 1 Edge Function nova (`trip-attachments`), 1 operação de comando nova, 3 consultas novas e 2 funções SQL alteradas; no aparelho, a base `fluxid-local` passa à versão 2 com 2 lojas novas (`local_trips` e `local_attachments`) e as 3 existentes

**Testes**: pgTAP em `supabase/tests/010_*.test.sql` (RLS com dois tenants, anexos, trilha de sincronização, janela de tempo, validade da posição pelo horário informado, imutabilidade); Vitest para domínio, executores, fila, conflitos, anexos, manipuladores das funções e páginas; contrato (nenhum dado sensível em log, auditoria ou URL; metadados de foto removidos); `.live` para a idempotência e o reenvio contra o Supabase local; E2E com backend simulado e rede cortada pelo Playwright (`context.setOffline`); axe, e regressão visual

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem; foto por câmera e envio com o aplicativo aberto no Chrome do Android; os demais navegadores seguem sem foto quando faltar o recurso

**Tipo de projeto**: aplicação web cliente única + migrations, Edge Functions e bucket do Supabase

**Metas de desempenho**: registrar na fila em até 1 s sem rede (RNF-001); fila de 10 cilindros e 3 paradas enviada em até 30 s em 4G (RNF-002); entrega com 3 fotos e assinatura enviada em até 60 s em 4G sem bloquear o resto (RNF-003); fila de 200 operações e 50 MB de anexos sem degradar (RNF-004); pacote de entrada no máximo 5% maior que a linha de base da Spec 009 (RNF-007)

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; organização ativa vem do servidor; nenhuma credencial privilegiada no cliente; a mesma operação nunca vai a dois destinos; nenhuma coordenada, nome de recebedor, foto ou assinatura em log, auditoria em texto aberto, URL ou mensagem de erro; nenhum dado pendente apagado em silêncio; nenhuma exclusão física

**Escala/escopo**: 2 tabelas, 1 bucket, 1 Edge Function nova (`trip-attachments`), 1 operação de comando nova (`resolve_sync_conflict`), 3 consultas novas (`get_trip_offline`, `get_attachment_url`, `list_sync_events`), 2 funções SQL alteradas (`arrive_stop`, `register_delivery`), 0 permissões novas, 4 migrations, 1 página nova (Sincronização), componentes novos (indicador, foto, assinatura, conflito, acrescentar anexo e aviso de saída) e 4 operações offline-safe na outbox, mais os anexos

## Verificação da constituição

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec com 5 histórias, 31 requisitos funcionais e 8 critérios transversais, esclarecida em 12/10/2026 | Atende |
| II TDD obrigatório | Regras de fila, janela de tempo, limites de anexo e mapeamento de erro nascem com teste; recursos do navegador (IndexedDB, câmera, canvas, locks) entram por interfaces simuláveis; as regras do servidor nascem em pgTAP | Atende |
| III Multitenancy e segurança | Fila particionada por conta, organização e destino; anexos em bucket privado com RLS por permissão e sem escrita do cliente; trilha de sincronização imutável; resolução de conflito com permissão, justificativa e auditoria; nenhuma credencial privilegiada no cliente | Atende |
| IV Estados explícitos | A fila **guarda pedidos, não decisões** (RN-001): o estado da viagem e do cilindro continua só no servidor; os estados da fila (pendente, enviando, enviado, conflito, falhou, descartado) são independentes dos estados de domínio e nada presume que um envio ocorreu antes da confirmação | Atende |
| V Experiência e acessibilidade | **Fecha o item "tolerante a operação offline"** para o aplicativo de campo; padrão visual da Spec 005, WCAG 2.2 AA, 360 px a desktop amplo, estados de carregando, vazio, erro, offline e sincronização | Atende |
| VI Rastreabilidade de desenvolvimento | Branch `feat/010-fila-offline-fotos-assinatura`, spec, PR e RIA próprios; issue a abrir antes da primeira tarefa (ação externa, com confirmação) | Atende |
| VII Qualidade verificável | Lint, tipos, unidade, cobertura, pgTAP, `.live`, E2E com rede cortada, axe, build PWA e regressão visual; validação humana em aparelho Android real, por entrevista | Atende |
| VIII Documentação viva | `docs/prd.md`, `docs/arquitetura-conectividade-supabase.md` (classificação das quatro operações e dos anexos como `offline-safe`), contratos e validação atualizados na mesma entrega | Atende |

**Resultado antes e depois do desenho**: sem violações. Os pontos de atenção estão em [research.md](./research.md): a regra da Spec 009 de não guardar posição no aparelho é **substituída, só para a fila e só até o envio confirmado** (decisão da spec); o contrato `field-no-camera-frames-sent` da Spec 009 precisa ser delimitado, porque foto e assinatura **passam a ser enviadas de propósito** (a leitura de identificador continua proibida de enviar imagem).

## Estrutura do projeto

### Documentação desta funcionalidade

```text
specs/010-fila-offline-fotos-assinatura/
├── plan.md                         # este arquivo
├── research.md                     # decisões e alternativas
├── data-model.md                   # tabelas, bucket, lojas locais, transições
├── quickstart.md                   # roteiro de validação ponta a ponta
├── contracts/
│   ├── operacoes-servidor.md       # manage-trips, query-trips, trip-attachments
│   ├── fila-local.md               # lojas, estados, regras da fila e dos executores
│   └── telas-e-fluxos.md           # telas, textos e estados
├── checklists/requirements.md
└── tasks.md                        # saída de /speckit-tasks
```

### Código-fonte (raiz do repositório)

```text
supabase/
├── migrations/
│   ├── 20261014100000_trip_sync_events.sql           # trilha, resolve_sync_conflict e tipos de evento de conflito
│   ├── 20261014100100_trip_offline_position_time.sql # arrive_stop e register_delivery pelo horário informado
│   ├── 20261014100150_trip_offline_read.sql          # query_trip_offline (viagem e identificadores para o aparelho)
│   └── 20261014100200_trip_delivery_attachments.sql  # tabela, bucket, RLS dos anexos e tipo de evento de evidência
├── functions/
│   ├── manage-trips/handler.ts        # queued_at, trilha, resolve_sync_conflict
│   ├── query-trips/handler.ts         # get_trip_offline, get_attachment_url, list_sync_events
│   └── trip-attachments/              # nova: recebe foto e assinatura
│       ├── handler.ts
│       └── index.ts
└── tests/010_*.test.sql

src/
├── domain/field/
│   ├── offline-queue-rules.ts         # operações offline-safe, dependências, janela de 7 dias
│   ├── offline-session.ts             # teto de 8 horas da sessão offline
│   ├── attachment-limits.ts           # 3 fotos, 1,5 MB, 1.600 px, assinatura
│   └── sync-status.ts                 # rótulos e textos dos estados da fila
├── infrastructure/
│   ├── local-database/                # versão 2: local_trips, local_attachments, partição por conta e destino
│   ├── synchronization/
│   │   ├── offline-operation-policy.ts  # allowlist com as quatro operações da outbox
│   │   ├── operation-executors.ts       # traduz item da outbox em chamada ao servidor
│   │   ├── push-synchronizer.ts         # usa os executores; respeita destino e dependências
│   │   ├── sender-lock.ts               # uma aba por vez (Web Locks)
│   │   └── (local-database) storage-persistence.ts  # armazenamento persistente e uso do espaço
│   └── attachments/
│       ├── photo-capture.ts             # entrada de arquivo com câmera, redução e remoção de metadados
│       └── signature-canvas.ts          # traço, vazio e PNG
├── application/field/
│   ├── offline-trip-store.ts            # viagem guardada e leitura offline
│   ├── offline-queue-service.ts         # enfileirar, desfazer, contagem, descartar
│   ├── offline-session-gate.ts          # teto de 8 horas offline
│   ├── conflict-service.ts              # descartar e reenviar com decisão no servidor
│   └── attachment-service.ts            # anexos pendentes e envio
├── pages/
│   ├── sync/                            # tela Sincronização, itens, conflito
│   └── trips/components/                # fotos, assinatura e acrescentar anexo na entrega
└── app/
    ├── shell/                           # indicador de pendências na barra superior
    └── auth/                            # aviso ao sair com pendências

tests/
├── contract/                            # privacidade, metadados, anexos, operações offline-safe
├── integration/                         # .live: reenvio idempotente, anexo duplicado
└── e2e/campo-offline-fila*.spec.ts, campo-anexos*.spec.ts, visual/sincronizacao.visual.spec.ts
```

**Decisão de estrutura**: a base local e a pilha de sincronização da Spec 002 **são estendidas, não copiadas**; o domínio fica em `src/domain/field/` (regras puras, sem navegador), o que toca o navegador em `src/infrastructure/` atrás de interfaces simuláveis e a tela em `src/pages/`.

## Rastreabilidade

| Requisito da spec | Onde é atendido |
|---|---|
| RF-001 a RF-007 | `offline-queue-rules`, `offline-queue-service`, `offline-trip-store`, `OfflineOperationPolicy`, `get_trip_offline` |
| RF-008 a RF-017 | `operation-executors`, `push-synchronizer`, `sender-lock`, `conflict-resolver`, `trip_sync_events`, `resolve_sync_conflict`, migration da janela e da posição |
| RF-018 a RF-024 | `photo-capture`, `signature-canvas`, `attachment-service`, `trip-attachments`, `trip_delivery_attachments`, bucket `trip-evidence` |
| RF-025 a RF-027 | remoção na confirmação, `navigator.storage`, avisos de espaço, ausência de apagamento silencioso |
| RF-028 a RF-031 | PWA em HTTPS de homologação, tela Sincronização, indicador, design system |
| CA-001 a CA-008 | pgTAP, `.live`, contrato, E2E com rede cortada, axe, validação em aparelho |

## Pendências e dependências externas

- **Issue da Spec 010**: [#34](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/34), aberta em 13/10/2026 com a confirmação da pessoa responsável. Branch: `feat/010-fila-offline-fotos-assinatura`.
- **Endereço HTTPS de homologação** para confirmar a instalação em Android (RF-028, MS-007): depende de decisão de publicação (`docs/publicacao-em-nuvem.md`); sem ele, a história 5 fica com a instalação pendente e o restante é validado.
- **Prazo de retenção** de coordenadas, fotos e assinaturas: continua com a spec de privacidade futura; antes de produção.
- **Confirmado no código**: a resposta de `register_delivery` já traz `delivery_id` (necessário para vincular anexos), e as permissões existentes bastam, sem permissão nova: `trip.operate` (conferir, chegar, entregar e anexar; `trip.deliver` é só o nome da operação na auditoria), `trip.read` (ver fotos) e `trip.recipient` (ver assinatura e recebedor).
