# Plano de implementação: Aprovação e destinação de lacres pelo Master, com a rede configurada pelo próprio lacre

**Feature**: `013-aprovacao-lacres-master` | **Data**: 18/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/013-aprovacao-lacres-master/spec.md` (sessão de 18/10/2026: senha da rede de configuração fixa no firmware e só consultada pelo Master; o tenant devolve o lacre à plataforma e não desativa nem gera chave).

## Resumo

Trocar o cadastro manual da Spec 012 (chave mostrada uma vez, gravada à mão no firmware) por um fluxo sem cabo, com **um único firmware para todos os lacres**:

1. **Portal do lacre:** sem rede salva, o lacre abre a rede `FluxID-Lacre-XXXX` com a senha padrão. Uma página dele, servida localmente, escolhe e testa o Wi-Fi.
2. **Pedido de aprovação:** com internet, o lacre se apresenta pelo código derivado do chip e por uma chave que ele mesmo cria. O `seal-gateway` registra o pedido e responde "aguardando aprovação".
3. **Master:** a tela nova `/admin/lacres` lista os pedidos. O Master aprova destinando a um tenant, recusa, resolve conflitos de chave, retira de operação (mantendo ou esquecendo as redes) e consulta a senha padrão, sempre com justificativa e auditoria.
4. **Tenant:** vê só os lacres destinados a ele, marcados como "Pronto para vincular", vincula como na Spec 012 e pode devolver um lacre à plataforma.

O desenho reaproveita a Spec 012: o mesmo endpoint, o mesmo formato de código e de chave, as mesmas RPCs com RLS e auditoria, e a mesma troca de rede com teste e volta à rede anterior ([research.md](./research.md), itens 1 a 5). As peças novas são:

- a fila de pedidos da plataforma, com uma linha de dispositivo por destinação, para o histórico ficar com cada tenant (itens 5 e 6);
- a função `platform-seals`, no molde de `manage-organizations` (item 7);
- o portal cativo no firmware, com o núcleo testado no computador e a página em arquivo próprio, testada no navegador (item 10);
- o esquecimento das redes do tenant anterior, com confirmação do lacre, antes de destiná-lo a outro tenant (RN-006; item 5).

## Rastreabilidade

- **Issue:** [#48](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/48), "Spec 013: aprovação e destinação de lacres pelo Master", aberta pela conta `equipefluxid` em 18/10/2026.
- **Branch:** `feat/013-aprovacao-lacres-master`, a partir da `main` com a Spec 012 integrada (PRs #43 e #47).
- **Pull request:** a abrir no fechamento (T071).

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase); Edge Functions em Deno; firmware em C++ (arduino-esp32 2.0.17 sobre PlatformIO 6.1.16, ESP32-C3)

**Dependências principais**: nenhuma nova. O portal usa `WebServer` e `DNSServer`, que já vêm no núcleo do arduino-esp32.

**Armazenamento**: 1 tabela nova de plataforma (`seal_enrollments`, com conflito, `forget_networks` e `last_organization_id`), 1 tabela privada de limites (`private.seal_enroll_rate_windows`), 4 colunas novas e um índice único parcial em `seal_devices`, o auxiliar `private.seal_deactivate_line` e 1 segredo no Vault (`seal_portal_password`). Detalhe em [data-model.md](./data-model.md).

**Testes**:

- pgTAP para os pedidos, a aprovação, a devolução, o isolamento entre dois tenants e a auditoria;
- Vitest para o domínio, o serviço, as telas e os contratos das funções;
- suítes `.live` com o simulador no Supabase local;
- Playwright para as jornadas do Master e do tenant, a acessibilidade em 360, 768 e 1920 px e as capturas no Linux, e também para a página do portal (`tests/e2e/portal-lacre.spec.ts`, com as rotas do lacre simuladas);
- Unity (`pio test -e native`) para o núcleo do portal, o código do chip e o modo "aguardando".

**Plataforma alvo**: PWA (navegadores modernos, Android e iOS), Supabase local e em nuvem, ESP32-C3 Super Mini alimentado pela USB.

**Tipo de projeto**: aplicação web com backend Supabase e firmware embarcado.

**Metas de desempenho**:

- o pedido aparece para o Master em até 1 min (MS-002);
- o lacre aparece no tenant em até 1 min depois da aprovação (MS-003);
- a rede é configurada pelo celular em até 3 min (MS-001).

**Restrições**:

- firmware na partição atual (medido em 86,2% da flash com o portal; o limite de alerta é 95%);
- nenhuma senha ou chave em arquivo versionado;
- o lacre não informa organização;
- a página do portal funciona sem internet.

**Escala**: frota de protótipo (dezenas de lacres). A fila do Master é paginada em 100 por página.

## Verificação da constituição

| Princípio | Como o plano atende |
|---|---|
| I. Especificação antes do código | spec esclarecida; requisitos e cenários testáveis |
| II. TDD | testes pgTAP, Vitest, `.live`, Playwright e Unity escritos antes de cada fatia (tasks) |
| III. Multitenancy e segurança | pedidos sem tenant só por RPC com `platform.manage` (o segundo fator deixou de ser exigido em 19/10/2026, RF-021); uma linha de dispositivo por destinação (RN-005); justificativa e auditoria em toda ação do Master e na devolução; redes de um tenant nunca seguem para outro (RN-006); chave e senha nunca em log, auditoria ou arquivo versionado |
| IV. Estados explícitos | situações do pedido independentes da saúde e da trava do lacre; "aguardando" nunca vira operação sem a decisão do Master |
| V. Experiência e acessibilidade | telas no padrão da Spec 005 com `ui-ux-pro-max`; portal com rótulos, foco, contraste e anúncio do resultado; 360 px a desktop |
| VI. Rastreabilidade | branch `feat/013-aprovacao-lacres-master`, issue e PR, RIA no fechamento |
| VII. Qualidade verificável | os mesmos gates da Spec 012, incluindo o job do firmware no CI |
| VIII. Documentação viva | contratos, quickstart, `firmware/README.md`, `docs/publicacao-em-nuvem.md` (senha no Vault) e PRD |

Nenhuma violação. Há duas trocas conscientes, decididas pela pessoa responsável e registradas na spec: a senha única para todos os lacres (premissas) e o acesso só com e-mail e senha, sem segundo fator obrigatório (RF-021, sessão de 19/10/2026).

## Estrutura do projeto

### Documentação (esta feature)

```text
specs/013-aprovacao-lacres-master/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # decisões técnicas
├── data-model.md        # tabela de pedidos, colunas, Vault, auditoria e limites
├── quickstart.md        # roteiro de validação
├── contracts/
│   ├── pedido-de-aprovacao.md   # respostas novas do seal-gateway
│   ├── operacoes-plataforma.md  # platform-seals e mudanças em manage-seals e query-seals
│   ├── portal-do-lacre.md       # rotas e regras da página do lacre
│   └── telas.md                 # /admin/lacres e mudanças em /lacres
├── checklists/requirements.md
└── tasks.md             # gerado por /speckit-tasks
```

### Código (raiz do repositório)

```text
supabase/
├── migrations/20261019120xxx_seals_enrollment_*.sql   # 7: schema, ingest, platform, watchdog, compat, return, portal_password
├── migrations/20261019120700_auth_sem_segundo_fator.sql # RF-021: acesso só com e-mail e senha (o segundo fator saiu das funções e do cliente)
├── functions/platform-seals/                          # nova (handler, index, deno.json)
├── functions/manage-seals/handler.ts                  # + return_device; − create/rotate/deactivate
├── functions/query-seals/handler.ts                   # ready_to_bind e approved_at
└── tests/013_*.test.sql

src/
├── domain/seals/                     # rótulos das situações do pedido e regras do "pronto para vincular"
├── application/seals/                # platform-seal-service, views novas
├── pages/admin/seals/                # /admin/lacres (React.lazy)
├── pages/seals/                      # tenant: sem cadastro manual, devolver, pronto para vincular
└── domain/navigation/screens.ts      # item "Lacres da plataforma"

firmware/
├── src/nucleo/Identidade.*           # código do chip e chave (puro, testado)
├── src/nucleo/Portal.*               # validação, escape, JSON, tempos e motivos (puro, testado)
├── src/PortalWiFi.*                  # softAP, DNS e servidor web
├── src/main.cpp                      # modo aguardando × operando; botão BOOT; esquecimento das redes
├── src/PortalPagina.h                # gerado na compilação a partir de portal/index.html (fora do git)
├── portal/index.html                 # página do portal (HTML, CSS e JS inline, sem rede externa)
├── ferramentas/embutir_portal.py     # extra_scripts do PlatformIO que gera PortalPagina.h
└── test/test_identidade, test_portal

tests/
├── contract/platform-seals-handler.test.ts, seal-enrollment-protocol.test.ts
├── integration/seals-enrollment.live.test.ts
└── e2e/lacres-plataforma.spec.ts, portal-lacre.spec.ts, visual/lacres-plataforma.visual.spec.ts
```

**Decisão de estrutura**: mesma organização das Specs 006 a 012 (domínio, aplicação e páginas no cliente; RPCs e funções no Supabase; núcleo puro e hardware separados no firmware).

## Complexidade a acompanhar

| Ponto | Por que é necessário | Alternativa mais simples rejeitada |
|---|---|---|
| Uma linha de `seal_devices` por destinação | o histórico tem de ficar no tenant em que foi gerado (RN-005) sem mexer na RLS da Spec 012 | trocar o `organization_id` da linha levaria o histórico de um tenant para outro |
| Lacres da Spec 012 continuam com a chave manual | não quebrar a bancada nem os lacres já gravados | obrigar a regravar todos os lacres antes de publicar |
