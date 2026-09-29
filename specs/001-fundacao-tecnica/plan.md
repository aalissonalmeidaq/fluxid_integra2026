# Plano de implementação: Fundação técnica do FluxID

**Feature**: `001-fundacao-tecnica` | **Data**: 28/09/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: Especificação em `specs/001-fundacao-tecnica/spec.md`

## Resumo

Criar a primeira base executável do FluxID como aplicação web responsiva e instalável, ainda sem telas ou regras de negócio. A base terá validação de ambiente, seleção determinística de um único Supabase entre dispositivo local, LAN e cloud, indicação acessível do estado de conectividade e gates automatizados de qualidade. O trabalho seguirá TDD, com contratos e estados definidos antes do código de produção.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0

**Dependências principais**: React 19.3.0, Vite 8.3.1, Tailwind CSS 4.3.3, `@supabase/supabase-js` 2.117.2, Supabase CLI 2.117.0 como dependência de desenvolvimento, `vite-plugin-pwa` 1.3.0 e Zod; todas fixadas por versão exata e `package-lock.json`

**Armazenamento**: Supabase local para desenvolvimento e testes; endpoint LAN self-hosted homologado ou Supabase gerenciado para ambientes operacionais; nenhuma tabela de domínio nesta spec

**Testes**: Vitest 5.0.2, React Testing Library, Playwright 1.63.0, axe-core, checagem de tipos, ESLint 10.11.0 e validação de build/PWA

**Plataforma alvo**: Navegadores modernos em desktop e Android, viewport mínimo de 360 px; instalação PWA quando suportada

**Tipo de projeto**: Aplicação web cliente única, sem backend de negócio próprio nesta etapa

**Metas de desempenho**: base utilizável em até 2 segundos em ambiente de referência; cada probe limitado por timeout configurável de 2 segundos; resolução automática limitada a uma passagem pela lista de destinos

**Ambiente de referência de desempenho**: build de produção servido localmente, projeto Chromium desktop do Playwright, contexto novo e Supabase simulado para que a medição cubra apenas o shell. O intervalo começa na navegação e termina quando o marco principal está visível e operável. O preparo em até 15 minutos é medido separadamente, do início de `npm ci` em checkout limpo até o shell de desenvolvimento ficar visível, com os pré-requisitos já instalados; sistema, hardware, duração e resultado devem ser registrados de forma sanitizada em `validation.md`.

**Restrições**: WCAG 2.2 AA; funcionamento responsivo; nenhuma chave secreta no cliente; modo offline sem fingir conexão; sem escrita duplicada; sem fallback em erro 4xx de autenticação, autorização ou configuração; Supabase CLI não exposto como serviço operacional na LAN

**Escala/escopo**: shell da aplicação, manifest e service worker, resolvedor de conectividade, status acessível, infraestrutura de testes e documentação; sem autenticação de usuário, schema de domínio, CRUD, mapas ou IoT

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| Especificação antes do código | Spec 001 e checklist aprovados antes do planejamento | Aprovado |
| TDD obrigatório | Resolver, validação de ambiente, estados e UI nascerão de testes RED | Aprovado |
| Multitenancy e segurança | Nenhuma tabela será criada; apenas chaves publicáveis no cliente; RLS permanece obrigatória para specs futuras | Aprovado |
| Estados explícitos | A conectividade possui máquina de estados e categorias de falha definidas em `data-model.md` | Aprovado |
| Experiência e acessibilidade | Shell responsivo, status não dependente apenas de cor, foco e testes automatizados | Aprovado |
| Rastreabilidade | Spec e plano estão ligados à feature 001; a branch atual é `chore/bootstrap-antigravity`; a issue [#1](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/1) foi vinculada antes de qualquer código de implementação e o PR será criado no encerramento | Aprovado |
| Qualidade verificável | Gates de lint, tipo, unidade, integração, E2E, acessibilidade, build e PWA previstos | Aprovado |
| Documentação viva | Quickstart, contratos, modelo e documentos oficiais acompanharão a implementação | Aprovado |

A spec foi aprovada para implementação em 28/09/2026. A branch confirmada é `chore/bootstrap-antigravity` e a issue de rastreabilidade é [#1](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/1). O gate de entrada da implementação está concluído.

## Estrutura do projeto

### Documentação desta feature

```text
specs/001-fundacao-tecnica/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── connectivity.md
│   └── environment.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Código-fonte previsto

```text
public/
└── icons/

src/
├── app/
│   ├── App.tsx
│   └── providers.tsx
├── components/
│   └── system/
│       └── ConnectivityStatus.tsx
├── config/
│   └── environment.ts
├── infrastructure/
│   └── supabase/
│       ├── connection-resolver.ts
│       ├── connection-state.ts
│       ├── endpoint-health.ts
│       ├── failure-classifier.ts
│       └── client-factory.ts
├── styles/
│   └── globals.css
├── test/
│   ├── setup.ts
│   └── fixtures/
└── main.tsx

tests/
├── contract/
│   └── environment.test.ts
├── integration/
│   └── connectivity.test.ts
└── e2e/
    ├── app-shell.spec.ts
    ├── accessibility.spec.ts
    └── pwa.spec.ts

supabase/
└── config.toml
```

**Decisão de estrutura**: projeto web único. Regras de seleção de endpoint ficam em infraestrutura independente de React; componentes apenas apresentam o estado. Não haverá pasta de domínio nesta spec porque nenhuma regra de negócio será implementada.

## Sequência TDD prevista

1. RED: contratos de variáveis e rejeição de configuração incompleta.
2. GREEN: leitor de ambiente tipado, sem expor segredos.
3. RED: estados e prioridade `local → lan → cloud`, incluindo timeouts e falhas bloqueantes.
4. GREEN: probe de disponibilidade e resolvedor puros com dependências injetadas.
5. RED/GREEN: classificar separadamente falhas do probe e erros operacionais recebidos do cliente selecionado; erros de autenticação, autorização, validação ou RLS bloqueiam a operação sem iniciar nova resolução.
6. REFACTOR: separar classificação de falhas, seleção e criação do cliente.
7. RED: contrato visual e acessível para cada estado.
8. GREEN: shell e indicador de conectividade.
9. RED/GREEN: manifest, service worker, instalação, responsividade e cenários E2E.
10. REFACTOR: consolidar scripts, documentação e evidências dos gates.

## Gates de conclusão

- dependências com versões exatas e lockfile;
- lint e checagem de tipos aprovados;
- testes unitários, de contrato, integração e E2E aprovados;
- cobertura global mínima de 85% de linhas/funções e 80% de branches;
- 100% dos cenários do resolvedor de conectividade cobertos;
- zero violação crítica de acessibilidade na base;
- build e validação PWA aprovados;
- varredura sem segredos;
- documentação atualizada;
- convergência formal executada depois da implementação e dos testes, com eventuais tarefas adicionais concluídas antes do staging;
- RIA criado somente no encerramento, após testes e antes do commit final do ciclo.

## Rastreamento de complexidade

Nenhuma violação constitucional ou complexidade excepcional foi aceita. A sincronização entre bancos, autenticação e dados de negócio permanecem fora do escopo.
