# Plano de implementação: Leitura de identificadores e GPS no aplicativo de campo

**Feature**: `009-leitura-gps-campo` | **Data**: 12/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/009-leitura-gps-campo/spec.md` (11 decisões na seção Clarifications: recorte leitura mais GPS, precisão ruim só avisa, posição continua opcional, leitura também na entrega, NFC pelo número de série ou texto gravado, viagem de outro cilindro só para quem vê viagens, "Ler cilindro" para quem vê cilindros, quatro métodos de conferência e confirmação antes de substituir coordenadas digitadas, retenção das coordenadas enquanto a viagem existir e desligamento da câmera e do NFC após 2 minutos sem leitura)

## Resumo

Dar ao celular de campo os dois sentidos que a Spec 008 deixou como confirmação manual: **ler o cilindro** (câmera para QR Code e Data Matrix, NFC) e **saber onde está** (GPS na chegada e na entrega). Nada nas regras da viagem muda: o servidor continua decidindo, a conferência e a entrega manuais continuam completas, e a posição continua opcional.

A abordagem aproveita o que já existe e acrescenta pouco:

- **Peça existente 1, câmera**: o `CameraScanButton` da Spec 006 já lê QR Code e Data Matrix com o detector do navegador, sem biblioteca e sem enviar imagem. Ele é generalizado em um **leitor contínuo** reutilizável (várias leituras seguidas, anti-repetição, foco preso, Escape).
- **Peça existente 2, busca por identificador**: `query_cylinder_lookup` (Spec 006) já procura o valor ativo na organização e normaliza em maiúsculas. Uma operação nova, `resolve_identifier`, a estende para até três valores candidatos (necessários ao NFC), devolve o cilindro e, **só a quem tem `trip.read`**, a viagem aberta que o reserva.
- **Peça existente 3, conferência e entrega**: `check_item` já guarda `check_source`, hoje travado em `'manual'` por uma restrição; `register_delivery` já guarda o resultado por cilindro em `results`. As duas ganham o **método** como argumento validado.
- **Peça nova 1, NFC**: leitor do navegador (Web NFC, só Chrome no Android) que entrega o número de série e os registros de texto da etiqueta; o cliente normaliza o número de série e envia os candidatos, e o servidor compara com os identificadores `nfc_tag` da organização.
- **Peça nova 2, posição**: a chegada hoje **não guarda posição alguma** (`arrive_stop` só tem o horário). Entram 6 colunas em `trip_stops` e 3 em `trip_deliveries` (origem, precisão e horário da leitura), com restrições que repetem as regras do cliente. A leitura do GPS fica num módulo de domínio puro e numa única chamada ao navegador por pedido, sem observador contínuo.
- **Cliente (padrão herdado)**: `domain/` (normalização NFC, classificação da precisão, validade da posição, rótulos de método), `application/` (estende o serviço de viagens e o de cilindros), `pages/` (leitor, bloco de posição e botão "Ler cilindro", sem regra de domínio em componente).
- **Interface**: padrão visual da Spec 005 e skill `ui-ux-pro-max`; janela de leitura em tela cheia no celular; nenhuma entrada nova de menu (o botão "Ler cilindro" fica na lista e no detalhe de cilindros e no cabeçalho de viagens).

Fica de fora, por decisão da spec: fila offline e sincronização, fotos e assinatura (Spec 010), trava física e IoT (Fase 6), rastreamento contínuo, gravação ou formatação de etiquetas NFC, login e app próprio do motorista.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase) e Edge Functions em Deno, como nas specs anteriores

**Dependências principais**: as já existentes. **Nenhuma dependência nova**: câmera, NFC e GPS usam recursos nativos do navegador (detector de código de barras, leitor NFC e geolocalização), com detecção de suporte em tempo de execução

**Armazenamento**: 0 tabelas novas. 6 colunas em `public.trip_stops` (posição da chegada) e 3 em `public.trip_deliveries` (precisão, origem e horário da leitura), 1 restrição alterada em `trip_items` (`check_source`); 1 operação de consulta nova no servidor. **Nenhum dado no aparelho**: nada de `localStorage`, `sessionStorage` nem IndexedDB para leitura ou posição

**Testes**: pgTAP em `supabase/tests/009_*.test.sql` (RLS com dois tenants, resolução de identificador, restrições de posição, método, auditoria sem coordenadas); Vitest para domínio, serviço, manipuladores das funções e páginas, com detector de código, leitor NFC e geolocalização simulados; testes de contrato (nenhuma coordenada em log, catálogo de operações, nenhuma permissão nova); suíte `.live` contra o Supabase local; E2E em três larguras com geolocalização e detector simulados no Playwright; capturas visuais no Linux

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo, retrato e paisagem. Leitura por câmera e NFC só no Chrome do Android; os demais seguem pelo fluxo manual

**Tipo de projeto**: aplicação web cliente única + migrations e Edge Functions do Supabase

**Metas de desempenho**: do código reconhecido ao cilindro conferido na tela em até 1 s em 4G (RNF-001); leitura do GPS com tempo máximo de 15 s e nunca bloqueando a tela (RNF-002); pacote de entrada no máximo 5% maior que a linha de base da Spec 008 (RNF-005)

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; escritas exigem conexão e nunca são enfileiradas; organização ativa vem do servidor; nenhuma credencial privilegiada no cliente; nenhuma imagem de câmera sai do aparelho; nenhuma coordenada, nome de recebedor ou código lido em log ou auditoria em texto aberto; contexto seguro (HTTPS ou localhost) obrigatório para câmera, NFC e GPS

**Escala/escopo**: 0 tabelas, 9 colunas, 1 operação de consulta nova (`resolve`), 1 consulta alterada (`get_trip`), 3 operações de comando alteradas (`check_item`, `arrive_stop`, `register_delivery`), 0 permissões novas, 3 migrations, 3 componentes novos (leitor, bloco de posição, botão "Ler cilindro"), 3 larguras de referência

## Verificação da constituição

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec com 4 histórias, 24 requisitos funcionais e 7 critérios transversais, esclarecida em 12/10/2026 | Atende |
| II TDD obrigatório | Domínio (normalização NFC, precisão, validade da posição) e as regras de servidor nascem com teste; os recursos do navegador entram por interfaces simuláveis | Atende |
| III Multitenancy e segurança | Sem tabela nova; a resolução procura só a organização ativa e responde igual a código inexistente ou de outro tenant; a viagem só aparece a quem tem `trip.read`; nenhuma credencial privilegiada no cliente | Atende |
| IV Estados explícitos | O método e a origem da posição são dados do evento e não mudam nenhum estado; a leitura **identifica, não decide** (RN-001); nada é presumido sobre posição ou etiqueta | Atende |
| V Experiência e acessibilidade | Design system e padrão da Spec 005; teclado, anúncio de resultado, `prefers-reduced-motion`, estados sem suporte, permissão negada e offline; escritas offline desabilitadas, fila na Spec 010 | Atende |
| VI Rastreabilidade | Branch `feat/009-leitura-gps-campo`, spec, PR e RIA próprios | Atende |
| VII Qualidade verificável | Lint, tipos, unidade, cobertura, pgTAP, `.live`, E2E, axe, build PWA e regressão visual; validação humana em aparelho Android real, por entrevista | Atende |
| VIII Documentação viva | `docs/prd.md`, contratos e validação atualizados na mesma entrega | Atende |

**Resultado antes e depois do desenho**: sem violações. Não há complexidade a justificar.

## Estrutura do projeto

### Documentação desta funcionalidade

```text
specs/009-leitura-gps-campo/
├── plan.md                              # este arquivo
├── research.md                          # decisões técnicas e alternativas
├── data-model.md                        # colunas novas, restrições, valores e regras
├── quickstart.md                        # roteiro de validação ponta a ponta
├── contracts/
│   ├── operacoes-servidor.md            # resolve_identifier e as 3 operações alteradas
│   └── telas-e-fluxos.md                # leitor, bloco de posição, estados e acessibilidade
├── checklists/requirements.md
└── tasks.md                             # gerado por /speckit-tasks
```

### Código-fonte

```text
supabase/
├── migrations/
│   ├── 20261013100000_field_reading_source.sql   # método em check_item e register_delivery; restrição de check_source
│   ├── 20261013100100_field_position.sql         # posição da chegada e metadados da posição da entrega
│   └── 20261013100200_resolve_identifier.sql     # query_identifier_resolve
├── functions/
│   ├── query-cylinders/handler.ts                # operação resolve
│   ├── manage-trips/handler.ts                   # campos source, accuracy_m, position_source, position_read_at
│   ├── query-trips/handler.ts                    # sem mudança de código; teste de contrato de get_trip ampliado
│   └── _shared/operations.ts                     # catálogo de operações
└── tests/009_*.test.sql

src/
├── domain/field/                                 # regras puras, sem navegador
│   ├── identifier-candidates.ts                  # normaliza número de série e texto NFC em candidatos
│   ├── position-quality.ts                       # precisão (limite de 100 m) e validade (2 min)
│   ├── reading-source.ts                         # método: manual, typed, camera, nfc e rótulos
│   └── scan-debounce.ts                          # trata o mesmo código em sequência curta como uma leitura
├── infrastructure/field/                         # adaptadores finos do navegador, trocáveis nos testes
│   ├── barcode-reader.ts                         # detector de código e câmera
│   ├── nfc-reader.ts                             # leitor NFC
│   └── geolocation-reader.ts                     # uma leitura de posição por pedido
├── application/field/field-service.ts            # resolve_identifier e erros mapeados
├── application/trips/trip-service.ts             # estende check_item, arrive_stop e register_delivery
├── design-system/ (sem mudança de tokens)
└── pages/
    ├── field/
    │   ├── identifier-reader-dialog.tsx          # leitor contínuo (câmera e NFC), generaliza o CameraScanButton
    │   ├── position-field.tsx                    # "Usar minha posição", precisão, confirmação de substituição
    │   └── read-cylinder-button.tsx              # "Ler cilindro"
    ├── trips/components/loading-panel.tsx        # leitura na conferência
    ├── trips/components/delivery-dialog.tsx      # leitura e GPS na entrega
    ├── trips/components/arrive-stop-action.tsx   # GPS na chegada
    └── cylinders/                                # "Ler cilindro" na lista e no detalhe

tests/
├── contract/                                     # sem coordenada em log; catálogo; sem permissão nova
├── e2e/campo-*.spec.ts                           # leitura, GPS, sem suporte, permissão negada, offline
└── e2e/visual/campo.visual.spec.ts
```

**Decisão de estrutura**: cliente único com `domain/` puro, adaptadores finos do navegador em `infrastructure/field/` (para trocar por simulações em testes) e telas em `pages/`; o servidor segue o padrão de RPC `security definer` por Edge Function. Nenhuma pasta nova no servidor.

## Rastreabilidade

Issue da Spec 009: [#31](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/31). Branch: `feat/009-leitura-gps-campo`.

| Requisito da spec | Onde é atendido |
|---|---|
| RF-001, RF-001a, RF-005 | `identifier-reader-dialog`, `loading-panel`, `delivery-dialog`, `check_item` e `register_delivery` com `source` |
| RF-002, RF-003, RF-006 | `query_identifier_resolve`, `read-cylinder-button`, mensagens por resultado |
| RF-004 | `scan-debounce.ts` |
| RF-007 | `identifier-candidates.ts`, `nfc-reader.ts`, `query_identifier_resolve` |
| RF-008, CA-003 | detecção de suporte nos adaptadores; fluxo manual intacto |
| RF-009 a RF-015 | `position-field`, `position-quality.ts`, `geolocation-reader.ts`, colunas de posição |
| RF-016 a RF-019, CA-001, CA-002, CA-004 | RPCs, auditoria sem coordenadas, testes de RLS e de contrato |
| RF-020 a RF-023, CA-006, CA-007 | telas, estados, axe, offline |
| RNF-001 a RNF-005 | medições no quickstart; carregamento sob demanda do leitor |
