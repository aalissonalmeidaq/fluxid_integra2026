# Contrato: verificações automáticas

Cada critério da spec tem pelo menos um teste. Os testes de banco e de função nascem antes do código (TDD).

| Critério | Verificação | Camada | Comando |
|---|---|---|---|
| CA-001 | Itens do menu por perfil (administrador de tenant, operador, Master, pessoa com dois tenants) iguais ao esperado | Vitest (domínio e menu) + live (paridade com o servidor) | `npm test`, `npm run test:live` |
| CA-002 | Consulta devolve só o tenant ativo; tenant alheio devolve `[]`; nenhum código nem identificador de outro tenant | pgTAP + live | `supabase test db`, `npm run test:live` |
| CA-003 | Pessoa sem permissão abre cada tela restrita pela URL e recebe "Acesso negado" sem dado; menu adulterado não concede acesso | E2E com backend simulado + live | `npm run test:e2e`, `npm run test:live` |
| CA-004 | axe sem violação crítica ou grave em 360, 768 e 1920 px; operação só por teclado; foco de 3:1 ou mais | Playwright + axe | `npm run test:e2e` |
| CA-005 | Sem rolagem horizontal de 320 a 1920 px e com zoom de 200% | Playwright | `npm run test:e2e` |
| CA-006 | Carregamento, falha e offline sem item restrito e sem mover o foco | Vitest (provedor) + E2E | `npm test`, `npm run test:e2e` |
| CA-007 | Suítes das Specs 001 a 003 passam; só o seletor de "Meu perfil" no cabeçalho muda | todas | `npm test`, `npm run test:e2e` |
| CA-008 | Capturas do menu em três larguras e nos estados principais | Playwright visual (Linux do CI) | `npm run test:visual` |
| CA-009 | A função nova tem teste com dois tenants (permitido e bloqueado) e não é executável por `anon` nem `authenticated` | pgTAP | `supabase test db` |

## Casos obrigatórios por camada

### pgTAP (`supabase/tests/004_actor_permissions.test.sql`)

- Administrador do Tenant A: `tenant` = `[audit.read, profile.read, tenant.manage]` (conforme o papel de sistema) para A; `[]` para B.
- Operador técnico do Tenant B: sem `tenant.manage` nem `audit.read`.
- Pessoa administradora em A e operadora em B: conjuntos distintos por tenant.
- Master: `global` igual a todas as permissões ativas e `tenant` `[]` em tenant sem vínculo próprio. Administrador FluxID: `global` igual a `platform.manage`, `audit.read` e `profile.read`, sem `tenant.manage`.
- Organização proprietária como tenant ativo: `tenant` e `global` coincidem, e `audit.read` (escopo `tenant`) continua em `global`, pois é o que autoriza a auditoria da plataforma.
- Vínculo bloqueado, tenant suspenso, papel inativado, permissão inativa: `[]`.
- Sessão expirada, revogada ou de outra pessoa: `access_denied`.
- O JSON não tem chaves além de `kind`, `tenant` e `global`.
- `anon` e `authenticated` recebem `permission denied`; `service_role` executa.

### Edge Function

- Sem `Authorization`, token inválido: 401. UUID inválido: 400. Método diferente de POST: 405. Falha do gateway: 500 sem detalhe.
- Sucesso: sem evento de auditoria gravado (RF-023); resposta só com `code`, `tenant`, `global`.
- Nenhum log com token, chave ou corpo.

### Menu e provedor

- `loading` e `error` mostram só Início e Meu perfil; `ready` mostra o conjunto exato.
- Troca de tenant limpa antes do novo render; resposta atrasada de um tenant anterior é descartada.
- Polling de 60 s só com a aba visível e online (relógio falso); pausa offline e retoma.
- Cache lido apenas offline, só da mesma pessoa e tenant, e removido no logout, na expiração e na troca de pessoa.
- Resposta fora do contrato: nenhum item restrito.
- ARIA e teclado: `nav` nomeado, `aria-current`, `aria-expanded`, `aria-controls`, Escape devolve o foco, Tab sem painel fechado, link de pular primeiro.

### E2E (backend simulado estendido com `query-permissions`)

- Perfis: administrador, operador, Master, dois tenants, sem vínculo.
- Larguras: 320, 360, 768, 1920 px; zoom de 200%; retrato e paisagem.
- Estados: carregamento lento, falha com "Tentar de novo", offline com e sem cache.
- Acesso por URL sem permissão: "Acesso negado" e nenhuma requisição de dados do tenant devolvida.
- Pessoa sem vínculo ativo: só Início e Meu perfil, consulta sem `organization_id`. Sessão expirada com o menu aberto: o menu some, a pessoa vai à entrada e não restam permissões nem cache. Tenant suspenso ou vínculo bloqueado depois de o menu carregar: o menu se corrige na consulta seguinte.
- Master com a sessão limitada à verificação (`mfa_required`): sem menu até o segundo fator ser confirmado. Administrador de tenant em `aal1`: o menu mostra Pessoas do tenant e abri-la leva ao fluxo de verificação (RN-004).

### Paridade ao vivo

Para cada perfil semeado, abrir cada tela restrita pelo servidor e comparar com a visibilidade do item. Divergência falha o teste (RF-008).

## Medições

`tests/e2e/medicao-shell.spec.ts` compara o shell com o menu contra a linha de base de 132 ms da Spec 003 (limite 158 ms, MS-006) e registra o p95 da consulta com o backend simulado (limite 1 s, RNF-001).

## Higiene

`escalas-no-codigo`, `no-external-assets`, `client-secrets` e `catalogo-fora-do-pacote` continuam passando; nenhuma dependência nova entra no `package.json` (RNF-003).
