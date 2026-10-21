# Plano de implementação: Perfis de demonstração e acessos de teste na página de login

**Feature**: `014-perfis-demonstracao` | **Data**: 20/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/014-perfis-demonstracao/spec.md` (sessão de 20/10/2026: só perfis de tenant, botão em todos os ambientes, tenant "Oxigênio Cariri", cilindro C262 com o lacre de bancada na nuvem, restrições das contas de demonstração e restauração diária).

## Resumo

Criar 5 acessos de demonstração, um por papel de tenant, no "Oxigênio Cariri", com as mesmas credenciais no Supabase local e no publicado, e mostrá-los na tela de login.

1. **Fonte única** em JSON, lida pelo script da nuvem e pela tela de login; o seed local tem um arquivo próprio, conferido contra o JSON por teste ([research.md](./research.md), item 1).
2. **Marca no banco** do tenant e dos usuários de demonstração, para as restrições valerem em qualquer caminho (item 3).
3. **Restrições** no servidor: convites, troca e recuperação de senha e devolução do lacre (itens 4 a 6).
4. **Restauração** por um script e uma função do banco que reaproveita as operações do domínio para o C262 e o lacre; rotina diária no GitHub (itens 7 e 8).
5. **Login**: botão "Acessos de teste" e modal, desligáveis por `VITE_DEMO_ACCESS` (item 9).

## Rastreabilidade

- **Issue:** [#51](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/51), aberta pela conta `equipefluxid` (T001).
- **Branch:** `feat/014-perfis-demonstracao`, a partir da `main` com a Spec 013 integrada (PRs #49 e #50).
- **Pull request:** a abrir no fechamento.

## Contexto técnico

**Linguagem/versão**: TypeScript sobre Node.js 24; React 19; Tailwind CSS 4; SQL (PostgreSQL 17 do Supabase); Edge Functions em Deno; script de operação em Node (ESM).

**Dependências principais**: nenhuma nova. O script usa `@supabase/supabase-js`, já no projeto, como o `primeiro-master`.

**Armazenamento**: 2 tabelas privadas (`private.demo_tenant`, `private.demo_accounts`), 4 funções novas, 1 gatilho em `auth.users` e mudanças em 3 funções existentes. Detalhe em [data-model.md](./data-model.md).

**Testes**:

- pgTAP: marca de demonstração, `DEMO_RESTRICTED` nos convites e na devolução, gatilho de senha, `demo_restore` idempotente e a recusa com vínculo estranho, isolamento com dois tenants;
- Vitest: o componente do login e do modal, a leitura de `VITE_DEMO_ACCESS`, o script com dublê do Admin API, a paridade JSON × seed e os mapas de `DEMO_RESTRICTED`;
- `.live`: login dos 5 perfis com as senhas publicadas, as restrições pelas funções e o script contra o Supabase local;
- Playwright: o modal só com teclado, em 360, 768 e 1920 px e WebKit, axe sem violação grave, e a captura visual no Linux.

**Plataforma alvo**: PWA (navegadores modernos, Android e iOS), Supabase local e em nuvem, GitHub Actions.

**Tipo de projeto**: aplicação web com backend Supabase.

**Metas**: entrar com um acesso de teste em até 30 s (MS-001); demonstração restaurada em até 24 h (MS-007).

**Restrições**:

- nenhuma permissão global nos perfis de demonstração;
- a chave de serviço só no terminal de quem opera e no segredo do GitHub;
- com `VITE_DEMO_ACCESS=false`, nenhuma credencial no pacote publicado;
- o seed continua fora da nuvem.

**Escala**: 5 usuários, 1 tenant, 1 cilindro, 1 lacre.

## Verificação da constituição

| Princípio | Como o plano atende |
|---|---|
| I. Especificação antes do código | spec esclarecida (6 perguntas respondidas) e checklist completo |
| II. TDD | testes de cada fatia antes do código (tasks) |
| III. Multitenancy e segurança | perfis só de tenant, RLS e permissões de sempre; restrições no banco, não na tela; isolamento testado com dois tenants; negações auditadas; chave de serviço fora do cliente e do repositório |
| IV. Estados explícitos | estado publicado definido (data-model.md); a restauração diz o que criou, restaurou ou pulou |
| V. Experiência e acessibilidade | modal no padrão da Spec 005, só com teclado, 360 px a desktop, WCAG 2.2 AA |
| VI. Rastreabilidade | branch, issue, PR e RIA no fechamento |
| VII. Qualidade verificável | os mesmos gates da Spec 013 e um teste de paridade das credenciais |
| VIII. Documentação viva | `docs/publicacao-em-nuvem.md` (script, aprovação do lacre e segredo do GitHub), README e PRD |

**Exceção consciente (RN-001):** as senhas de demonstração ficam no repositório e na página, por decisão do responsável. Elas valem só para o tenant da demonstração, e as restrições de RF-016 e o isolamento limitam o dano. Nenhuma outra senha, chave ou segredo é versionado.

## Estrutura do projeto

### Documentação (esta feature)

```text
specs/014-perfis-demonstracao/
├── spec.md
├── plan.md               # este arquivo
├── research.md           # decisões técnicas
├── data-model.md         # fonte única, tabelas, funções, estado publicado e códigos
├── quickstart.md         # roteiro de validação
├── contracts/
│   ├── acessos-de-teste.md             # botão, modal e mensagens das restrições
│   └── restauracao-da-demonstracao.md  # script, demo_restore e rotina diária
├── checklists/requirements.md
└── tasks.md              # gerado por /speckit-tasks
```

### Código (raiz do repositório)

```text
src/
├── domain/demo/acessos-demonstracao.json   # fonte única (RF-002)
├── domain/demo/demo-access.ts              # leitura e validação do JSON, VITE_DEMO_ACCESS
└── pages/auth/test-accesses-*.tsx          # botão e modal (React.lazy)

supabase/
├── migrations/20261020170xxx_demo_*.sql    # marca, restrições, gatilho de senha e demo_restore
├── seeds/demonstracao.sql                  # os mesmos acessos no ambiente local
├── config.toml                             # sql_paths inclui o seed da demonstração
├── functions/password-recovery/handler.ts  # sem link para e-mail de demonstração
└── tests/014_*.test.sql

scripts/operacao/demonstracao.mjs           # npm run operacao:demonstracao
.github/workflows/restaurar-demonstracao.yml

tests/
├── contract/demo-accounts-parity.test.ts, demonstracao-script.test.ts
├── integration/demo-accounts.live.test.ts
└── e2e/acessos-de-teste.spec.ts, visual/
```

**Decisão de estrutura**: mesma organização das Specs 002 a 013 (domínio e páginas no cliente; regras no banco; operação por script no terminal, como o `primeiro-master`).

## Complexidade a acompanhar

| Ponto | Por que é necessário | Alternativa mais simples rejeitada |
|---|---|---|
| Gatilho em `auth.users` | a troca de senha vai direto ao Auth, sem função nossa no caminho | só restaurar todo dia deixaria a senha trocada por até 24 h |
| Restauração pelas operações do domínio | mantém o histórico do C262 e passa pelas validações | inserir direto nas tabelas pularia regras e eventos |
