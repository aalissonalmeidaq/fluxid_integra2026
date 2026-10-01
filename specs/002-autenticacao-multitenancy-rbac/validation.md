# Validação da Spec 002 — Autenticação, multitenancy e RBAC

Este documento reúne as evidências de validação do ciclo. Cada seção informa o que foi medido, onde e como repetir.
Itens que dependem de pessoas ficam como **pendentes** até alguém registrar o resultado real.

## 1. Ambiente de referência (RNF-003 e RNF-004)

| Item | Valor |
|------|-------|
| Sistema operacional | Windows 11 Pro 10.0.26200 |
| Processador | Intel Core 7 240H, 16 núcleos lógicos |
| Memória | 31,7 GB |
| Node.js | 24.21.0 |
| Playwright | 1.63.0 |
| Navegadores | Chromium (desktop e 360 px) e WebKit (tablet) do Playwright |
| Aplicação | build de produção servido por `vite preview` na porta 4173 |
| Backend | simulado por rede (`MockBackend`), sem latência artificial |

## 2. Desempenho percebido

Comando: `npx playwright test tests/e2e/performance.spec.ts --workers=1`.
Cada cenário executa 20 amostras, cada uma em um contexto novo do navegador, e compara o percentil 95 com o orçamento.

| Requisito | Orçamento (p95) | desktop-chromium | tablet-webkit | mobile-360-chromium |
|-----------|-----------------|------------------|---------------|---------------------|
| RNF-003 — login válido até o resultado visível | 3000 ms | 132 ms | 458 ms | 133 ms |
| RNF-004 — confirmação de recuperação visível | 2000 ms | 82 ms | 216 ms | 80 ms |

Medição de 30/09/2026.

**Limite da evidência.** O backend é simulado e responde de imediato, então os números acima mostram apenas a parcela
da interface: renderização, validação local e tratamento da resposta. O tempo do Supabase não está incluído neles.

### 2.1 Medição contra o Supabase local (T145)

Comando: `npm run test:live` (arquivo `tests/integration/performance.live.test.ts`). Supabase local em Docker, Edge
Functions e Auth reais, mesmo computador da seção 1, 20 amostras por cenário, cliente sem navegador.

| Requisito | Orçamento (p95) | p95 medido | Pior amostra |
|-----------|-----------------|------------|--------------|
| RNF-003 — `session-login` com credenciais válidas | 3000 ms | 56 ms | 59 ms |
| RNF-004 — `password-recovery`, confirmação devolvida | 2000 ms | 13 ms | 16 ms |

Esta medição inclui Auth, funções e banco, mas roda na mesma máquina, sem rede entre cliente e servidor. Ela não
representa cloud nem LAN. **Pendente (T147):** repetir contra um destino cloud ou LAN quando houver um homologado; só então
RNF-003 e RNF-004 ficam comprovados nas condições de referência. A solicitação de recuperação mede a resposta da
função, não a entrega do e-mail, como a spec pede.

O e-mail de recuperação não entra no prazo de 2 s: o teste para na confirmação exibida na tela, como a spec pede.

## 3. Testes transversais de interface e PWA

| Arquivo | Cobre | Resultado |
|---------|-------|-----------|
| `tests/e2e/responsive.spec.ts` | 360 px, 768 px e 1920 px; entrada, recuperação e áreas autenticadas; sem rolagem horizontal; alvos de no mínimo 24 × 24 px | aprovado nos 3 projetos |
| `tests/e2e/accessibility.spec.ts` | axe WCAG 2.2 AA em todas as rotas novas, foco preso e devolvido no diálogo, Escape, movimento reduzido | aprovado; testes de teclado pulados no WebKit (limitação já documentada do driver no Windows) |
| `tests/e2e/pwa.spec.ts` | cache do app shell sem Auth/Data/Storage/Functions, navegação offline a essas rotas sem app shell, nenhuma confirmação falsa offline, retomada | aprovado; testes com service worker e backend simulado pulados no WebKit |

**Defeito encontrado e corrigido.** Com o service worker ativo e sem rede, navegar para `/storage/v1/...` ou
`/functions/v1/...` devolvia o app shell como se fosse resposta do servidor. A lista `navigateFallbackDenylist` do
`vite.config.ts` cobria só `/rest`, `/auth` e `/graphql`; agora inclui também `/storage/v1`, `/functions/v1` e
`/realtime/v1`. O teste falhou antes da correção e passou depois.

## 4. Validação humana (MS-004, MS-005, MS-006)

**Realizada pelo responsável do projeto; resultado informado como conforme o esperado.** Em 30/09/2026 o responsável
declarou, em conversa com o assistente, que as validações humanas já foram feitas e que o resultado está de acordo com o
esperado.

O que **não** foi informado e, por isso, não é registrado aqui: tamanho e perfil da amostra, ambiente usado, duração de
cada sessão e resultados por critério (MS-004, MS-005 e MS-006 separadamente). Nada disso foi presumido. Se a equipe
ou a revisão do RIA exigir esse detalhe, ele precisa ser preenchido por quem executou os testes.

## 5. Regressão completa (T135)

Medição de 30/09/2026 no ambiente da seção 1.

| Comando | Resultado |
|---------|-----------|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm run test:coverage` | 83 arquivos, 1083 testes aprovados; instruções 91,17%, ramos 87,32%, funções 89,17%, linhas 94,75% (mínimos da CA-012 atendidos, inclusive 95% no domínio) |
| `npm run test:e2e` | 315 aprovados, 0 falhas, 9 pulados (limitação documentada do WebKit no Windows), nos 3 projetos |
| `npm run build` | concluído sem erros |

**Regressão do E2E após mudança na tela de login (30/09/2026) — resolvida.** Depois das medições acima, uma alteração em
`src/pages/auth/login-page.tsx` e em `src/app/App.tsx`, feita fora desta sequência de tarefas, derrubou o E2E (280 falhas).
O redesenho trazia um botão "Entrar com Google" sem ação (a Spec 002 exclui login social e SSO), uma imagem externa,
o login renderizado **fora** do shell (sem cabeçalho, `main`, link de pular nem indicador de conexão) e problemas de
contraste e de alvos de toque. Por decisão do responsável, o redesenho fica para a spec de telas e design. Foi feito:

- `login-page.tsx` refatorada para e-mail, senha, entrar e recuperar, com a mesma lógica de antes; a tela passa a ser uma
  `section` dentro do shell, como as demais telas de identidade;
- desvio removido do `App.tsx`: o login volta a ser exibido pelo `ProtectedRoute` dentro do shell;
- teste de escopo em `src/pages/auth/login-page.test.tsx` (só dois botões, sem login social, sem recurso externo, sem
  segundo `main`);
- seletores ambíguos dos testes E2E tornados exatos ("Senha" e "Entrar");
- defeito real achado no caminho e corrigido: o grupo da direita do cabeçalho não quebrava linha e estourava 24 px em
  360 px no WebKit (`flex-wrap` em `App.tsx`).

**Reexecução depois da refatoração:** `npm run lint` e `npm run typecheck` sem erros; `npm run test:coverage` com 83
arquivos e 1083 testes aprovados (instruções 91,17%, ramos 87,32%, funções 89,17%, linhas 94,75%);
`npx supabase test db` com 26 arquivos e 383 asserts; `npm run test:live` com 11 arquivos e 61 testes;
`npm run test:e2e` com 315 aprovados, 0 falhas e 9 pulados.

**Instabilidade tratada.** Nas três primeiras execuções completas houve 8, 2 e 2 falhas. Causas, todas de teste:
verificação de sessão após o login não simulada em dois testes antigos (`auth-session`); leitura das chamadas ao
servidor no mesmo instante em que o título aparecia (`audit-log`); preenchimento de campo antes de a sessão restaurada
terminar de remontar o formulário (`password-recovery` no WebKit); e service worker ativo com backend simulado no
WebKit (`pwa`). Após os ajustes, uma execução completa ficou sem falhas. Foi uma única rodada limpa; se a
instabilidade reaparecer, reabrir este item.

**Observação de UX.** Na carga inicial o conteúdo aparece enquanto a sessão é verificada e é remontado quando o
`SyncGate` bloqueia a resolução do tenant; o que for digitado nesses primeiros milissegundos se perde. Não é falha de
segurança; fica como melhoria.

## 6. Banco de dados (T136)

| Comando | Resultado |
|---------|-----------|
| `npx supabase db reset` | migrations e seed aplicados sem erro |
| `npx supabase test db` | 26 arquivos, 383 asserts aprovados (RLS com dois tenants incluída) |
| `npm run test:live` | 11 arquivos, 61 testes aprovados contra o Supabase local |
| `npx supabase db lint` | 1 aviso de baixa gravidade: parâmetro `p_status` sem uso em `create_managed_organization` (mantido por compatibilidade da assinatura; remover exige nova migration) |
| `npx supabase db advisors --local` | sem avisos após a migration `profiles_single_read_policy` (antes: múltiplas políticas permissivas em `profiles`) |

**Pendente (T146).** A comprovação da mesma versão pública de contrato/schema, migrations, RLS e catálogo em um
destino cloud ou LAN não foi executada neste ambiente. Localmente, a versão pública é verificada por
`tests/contract/public-compatibility.live.test.ts`. O T146 fica aberto até existir um destino homologado; se não
existir antes do encerramento, a pendência segue para o RIA.

## 7. Segredos e dependências (T137)

- Varredura por JWT, `sb_secret_`, chaves privadas e `service_role` em arquivos versionáveis: nenhuma ocorrência. O
  teste `tests/contract/client-secrets.test.ts` também varre o bundle gerado.
- `npm audit`: 0 vulnerabilidades. Única dependência nova: `fake-indexeddb` 6.2.5, apenas de desenvolvimento.
- Os arquivos `setup.json` e `setup-utf8.json` na raiz são saídas de scripts do Spec Kit, sem segredos, e não fazem
  parte da entrega: não incluir no `git add`.

## 8. Convergência (T138)

Análise de 30/09/2026 contra `spec.md`, `plan.md`, `tasks.md` e o código, com uma segunda passada após a
implementação.

- **Rastreabilidade:** os 135 identificadores de requisito definidos na spec (RF, RNF, CA, RS, RA, AUD e MS) aparecem
  em pelo menos uma tarefa; 14 deles só por faixa (por exemplo `RA-001–RA-009`). A checagem é mecânica: confirma que
  o requisito é citado, não que o conteúdo da tarefa o satisfaz.
- **Marcadores pendentes no código** (TODO, FIXME): nenhum em `src`, funções e migrations.

**Lacunas encontradas na segunda passada e tratamento**

| Achado | Tratamento |
|--------|------------|
| Função `retention-storage-cleanup` sem contrato, plano nem tarefa | T144 retroativo, `contracts/retention-cleanup.md` e entrada no `plan.md` |
| Acionamento da limpeza nunca exercitado no runtime real | `tests/contract/retention-cleanup.live.test.ts` (5 testes) e segredo local em `supabase/.env` |
| Política `profiles_read` e lista de exclusão do service worker fora dos contratos | acrescentados em `contracts/profile-avatar.md` e `contracts/connectivity.md` |
| RNF-003/004 medidos só no cliente | T145: medição ao vivo no Supabase local (seção 2.1); cloud/LAN pendente |
| T136 marcado sem a prova em cloud/LAN | T136 restringido ao ambiente local; T146 aberto para o destino homologado |
| Nenhum agendador chamava a função de limpeza (AUD-009 só valia no banco) | T148: workflow `.github/workflows/retention-cleanup.yml` com teste de contrato; configuração no repositório fica em T149 |
| T132 marcado sem resultado humano | T132 reaberto e depois fechado com a declaração do responsável (seção 4); detalhes da execução não informados |
| T145 marcado com medição só local | T145 restrito ao Supabase local; medição em cloud/LAN virou T147 |
| Fila e retenções legais fora do modelo de dados | `data-model.md`: estruturas privadas da retenção |

**Hipótese descartada.** Suspeitei que o gateway exigiria `verify_jwt = false` para a função de limpeza. O teste ao
vivo mostrou que a chamada com `apikey` público e segredo, sem `Authorization`, passa com o padrão. Por isso o
`config.toml` não ganhou essa linha. Isso foi observado só no runtime local; em cloud o comportamento do gateway deve
ser reconfirmado ao configurar o agendador.

**Validação do agendador.** O script do workflow foi executado contra o Supabase local com o segredo de
`supabase/.env`: com o segredo correto respondeu `removed=0 failed=0` (saída 0); sem segredo e com segredo errado
falhou com mensagem clara (saída 1). O `jq` não existe neste Windows, então essa execução usou um substituto mínimo em
Node; nos runners `ubuntu-latest` o `jq` é nativo. O YAML em si não foi validado por analisador (não há biblioteca
disponível); quem valida é o GitHub no primeiro push. O workflow agendado só roda na branch padrão, então ele ainda
**não foi executado no GitHub**.

**Pendências, sem resolução neste ambiente**

1. **T149:** configurar variáveis e segredo no repositório, executar o workflow por `workflow_dispatch` e registrar o
   resultado. Em LAN, configurar um agendador equivalente. Enquanto isso, os avatares anonimizados ficam no Storage.
2. **T146:** prova de contrato/schema em cloud ou LAN.
3. **T147:** repetir a medição de desempenho fora da máquina local.
4. **T132, detalhes:** a validação humana foi declarada conforme o esperado, mas amostra, ambiente, duração e resultados
   por critério não foram informados (seção 4).
5. **Parâmetro `p_status` sem uso** em `create_managed_organization` (aviso de lint, seção 6).
6. **Perda de digitação** nos primeiros milissegundos de carga (seção 5, observação de UX).

Tarefas: 142 concluídas. Abertas: T146, T147, T149 e T139–T142 (validação humana, governança e commit).

## 9. Governança de IA (T139–T142)

**T139 — índice preparado (30/09/2026).** `git add` de implementação, testes, `specs/002-autenticacao-multitenancy-rbac/`,
migrations, funções, workflows e documentação: 292 arquivos. Ficaram **de fora** de propósito `setup.json` e
`setup-utf8.json` (saídas de scripts do Spec Kit), `.claude/` e `.agents/` (configuração de ferramentas de agente, não
entrega da feature). O `supabase/.env` com o segredo local é ignorado pelo git. Revisão do `git diff --cached` por dados
sensíveis: nenhum JWT, chave secreta, chave privada ou `service_role` literal; o único arquivo de ambiente no índice é
o `.env.example`, sem valores sensíveis; os achados restantes são dados sintéticos de teste (senhas `Local-only-*`, o
vetor de teste público de TOTP do RFC e e-mails `.invalid`). Nada foi commitado.

**T140 — RIA gerado.** `docs/governanca-ia/registros/RIA-017-autenticacao-multitenancy-e-rbac.md`, com a ADR-001 e uma
síntese sanitizada. O gerador falhava em silêncio com diffs acima de 1 MB (`ENOBUFS` virava "diff vazio"); corrigido
em `scripts/governanca-ia/gerar-registro-ia.mjs` com um `maxBuffer` maior, sem mudar nenhuma regra. O validador usa só
`--name-only` e não precisou de ajuste. O hash do diff funcional é verificado apenas quanto ao formato.

**T141 — concluído (30/09/2026).** O responsável, Alisson Almeida, preencheu e conferiu o RIA-017: validação humana
em ambiente local, cerca de 40 minutos, resultado conforme o esperado; decisão `adaptado`; justificativa; data; observações; e
o checklist final, inclusive a revisão do texto. A decisão também consta no `docs/governanca-ia/indice.md`. A validação
humana foi só no ambiente local; o link do RIA, que apontava para o branch, foi trocado pelo do pull request
(https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/3).

**T142 — gate executado.** `npm run ia:validar` rodou duas vezes. A primeira **reprovou** por dois motivos: checklist final
incompleto (item de revisão do texto, do responsável) e decisão ausente no índice. O responsável concluiu o checklist e a
decisão foi copiada para o índice; a segunda execução terminou com **"Gate de governança de IA aprovado (1 registro(s))"**.
O GitHub Actions repetirá a validação no pull request. Nenhum commit, push ou pull request foi criado nesta etapa.
