# Validação da Spec 007: clientes, unidades, geocercas, veículos e motoristas

**Branch**: `feat/007-clientes-geocercas-frota` | **Data**: 07/10/2026

Este registro guarda apenas o que foi **medido ou observado de fato**. Itens ainda não executados aparecem como **pendente**; nada aqui foi preenchido por suposição.

## 1. Pacote de entrada (T120, RF-047, RNF-005, CA-014)

| Item | Valor |
|---|---|
| Linha de base (`main`, `baseline.md`) | 579,54 kB |
| Limite (Spec 005) | 593,95 kB |
| Medido com a Spec 007 (`dist/assets/index-*.js`) | **581,73 kB** (581 729 bytes) |
| Acréscimo | 2,19 kB (folga restante: 12,22 kB) |

Chunks novos (todos por `React.lazy`, fora do pacote de entrada): `registry-area`, `use-registry-service` (20,3 kB), `registry-list`, `registry-history`, `lifecycle-actions`, `reason-dialog`, `reveal-document`, `registry-validation`, `geofence-preview`, e uma página por tela (`customer-list/form/detail`, `site-form/detail`, `geofence-list/form/detail`, `vehicle-list/form/detail`, `driver-list/form/detail`).

- `dependencies` do `package.json`: **uma dependência nova de execução, `leaflet`** (mapas, RF-070), por decisão registrada na especificação e no plano (RNF-006); `@types/leaflet` entra em `devDependencies`. O Leaflet carrega só sob demanda, no chunk `map-view` (150,45 kB, 44,17 kB com gzip), fora do pacote de entrada. A inclusão de `@vitejs/plugin-basic-ssl` no `package.json` da máquina é alheia a esta spec e não entra no commit.
- **Pacote de entrada final** (com modais, geocodificação e mapas): **574,05 kB** (limite 593,95 kB).
- A **Visão geral mudou por decisão desta spec** (RF-070 e T149): mapa em 80% da largura, indicadores empilhados em 20%, unidades reais com coordenadas para quem tem `customer.read` e região de exemplo, marcada "Exemplo", para quem não tem. A regra de "dados só reais da organização ativa" (RF-042) vale para o bloco do mapa; os demais blocos seguem como exemplo, rotulados.
- Nenhuma tela de `src/pages/registry/` importa de `src/infrastructure/overview/`.

## 2. Desempenho das listas em 4G (T117, RNF-002)

Supabase local real, volume de referência (10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas), perfil Slow 4G (150 ms, 1,6 Mbps/750 kbps), 20 cargas por lista, `npm run test:desempenho:registro`:

| Lista | p95 | Limite |
|---|---|---|
| Clientes | 735 ms | 2 s |
| Geocercas | 730 ms | 2 s |
| Veículos | 728 ms | 2 s |
| Motoristas | 737 ms | 2 s |

Consulta "geocercas que contêm um ponto" com 50 mil geocercas: abaixo de 200 ms (plano GiST confirmado em `007_geofence_query`). Buscas com volume: p95 abaixo de 1 s.

## 3. E2E dos cadastros (T115)

`npx playwright test tests/e2e/registro-*.spec.ts` nos projetos desktop-chromium, tablet-webkit e mobile-360-chromium: **276 testes**; na primeira rodada 271 passaram e 5 falharam. Uma falha era seletor ambíguo (o histórico passou a repetir o texto "Unidade reativada"), corrigido com o texto completo do aviso. As outras duas, no WebKit, passaram na repetição isolada (instabilidade sob carga). Menu a 360 px com os quatro itens novos conferido pela suíte transversal.

Capturas visuais Linux: 177 capturas (48 dos cadastros) geradas e reproduzidas na segunda rodada, sem `*-win32.png`. O diálogo de anonimização a 768 px era instável (captura antes de o foco inicial assentar); o teste agora espera o foco no campo "Motivo". Os espaçamentos `gap-3` (fora da escala) de `lifecycle-actions` e `registry-history` viraram `gap-4`.

## 3b. Cadastro e edição em modal (RF-064, T127 a T134)

Decisão de 07/10/2026: os formulários de cliente, unidade, geocerca, veículo e motorista abrem em modal sobre a lista ou o detalhe, sem recarregar a página.

- **Testes novos:** `registry-navigation.test.ts` (5), `form-modal.test.tsx` (4), teste de `RegistryArea` com modal, teste de largura do `Dialog` e `tests/e2e/registro-modal.spec.ts` (6 cenários × 3 projetos: abrir sem recarregar, Escape com devolução de foco, Cancelar, Voltar, link direto, salvar na edição e no cadastro, erro de validação no modal, botão de salvar à vista e 360 px sem rolagem horizontal).
- **Ajustes nos E2E existentes:** como a lista ou o detalhe continua por trás, os rótulos dos formulários passaram a ser buscados dentro do diálogo; nenhuma asserção foi removida nem timeout aumentado.
- **Medido no navegador a 360 px:** a barra de ações fixa termina rente à borda do modal (base da barra = base do diálogo). As capturas dos modais são feitas na janela, como a pessoa vê.
- **Capturas Linux:** 177 aprovadas nas duas rodadas do gerador; a captura dos diálogos de anonimização e inativação oscilava porque o histórico carrega depois do detalhe, e agora o teste espera os blocos saírem de carregamento.
- **Rodada final depois do modal:** `npm test` 207 arquivos e 2770 testes (duas rodadas); E2E nos três projetos 1115 aprovados, 31 ignorados, com 1 oscilação do WebKit no teste de Escape do diálogo de cascata, que passa isolado.
- **Contrato de segurança dos logs:** os testes que varrem todos os arquivos ganharam tempo de 30 s, porque passavam dos 5 s padrão com a suíte inteira em paralelo.
- **Pacote de entrada final:** 574,05 kB (veja a seção 1).

## 4. Limites da anonimização (constituição VIII, RF-063)

A anonimização é irreversível e sobrescreve, no banco, os dados pessoais do registro e seus documentos. Ela **não** alcança:

- cópias de segurança do banco e logs da plataforma (Supabase), que não são reescritos por esta funcionalidade;
- endereço e geocercas de cliente pessoa física, que permanecem (a anonimização cobre nome, documento e contatos);
- eventos já gravados em `registry_events` e `audit_logs`, que são imutáveis, mas não carregam CPF, CNH, telefone nem e-mail.

## 5. Rodada completa final (T122) e métricas de sucesso

Rodada feita com tudo junto: cadastros, modais (RF-064), geocodificação (RF-065 a RF-069) e mapas (RF-070).

| Verificação | Resultado |
|---|---|
| `npm run lint` e `npm run typecheck` | sem erros |
| `npm test` | 212 arquivos, 2850 testes aprovados |
| `npx supabase db reset` + `test db` | 63 arquivos, 1607 testes pgTAP aprovados (inclui `007_site_geocoding` e `007_site_points`) |
| `npm run test:live` | 17 arquivos, 108 testes aprovados (arquivos em série; as suítes de anonimização e concorrência compartilham o administrador do Tenant G) |
| `npm run build` | pacote de entrada 574,05 kB; chunk `map-view` (Leaflet) 150,45 kB, sob demanda |
| E2E nos três projetos de funcionalidade (desktop-chromium, tablet-webkit, mobile-360-chromium) | 1127 aprovados e 31 ignorados (suítes ao vivo); 4 falhas da Visão geral com o mapa (estilos fora das escalas nos controles do Leaflet e a requisição aos blocos do OpenStreetMap), corrigidas e reexecutadas com 127 aprovados nesses arquivos |
| Capturas visuais Linux | regeneradas com modais, mapas e o formulário de unidade com coordenadas; nenhum `*-win32.png` |
| `tests/contract/client-secrets.test.ts` | aprovado |

Correções feitas na rodada final: controles do Leaflet (`map-view.css`) passaram para margens, fonte, entrelinha e alvo de 44 px dos tokens; o teste de domínios externos de `telas-transversais.spec.ts` admite só `tile.openstreetmap.org`, como o teste de contrato.

**Fora desta spec (pendências registradas):** T145 (reconfirmação do motorista na primeira entrega, Fase 4) e T146 (decisão da pessoa responsável e da equipe jurídica sobre enviar endereço de pessoa física ao Nominatim e sobre uso em volume em produção).

## 6. Validação humana (T124)

**Inconsistência resolvida.** `tasks.md` citava Alisson Almeida, o RIA-024 registra Natã Baracho e esta seção declarava a validação pendente. Confirmado pelo responsável pelo projeto em 08/10/2026 (mensagem na conversa): (1) o validador oficial é **Natã Baracho**; (2) a validação registrada no RIA-024 pode ser usada; (3) T124 deve ser corrigida, e foi, sem nova entrevista com Alisson. O conteúdo da validação é o do RIA-024; nada foi acrescentado em nome de ninguém.

## 7. Ajuste: uso controlado do Nominatim no protótipo (08/10/2026)

**A integração de geocodificação é temporária e exclusiva do protótipo.** Este ajuste (T152 a T160) a colocou atrás de configuração de servidor e de aviso e confirmação explícita, sem substituir a decisão pendente de T146 para produção. Documento de referência: `docs/geocodificacao-prototipo.md`.

| Requisito do ajuste | Como foi verificado |
|---|---|
| Configurações `GEOCODING_*` | `tests/contract/geocoding-config.test.ts` (padrões seguros, teto de 1/s); `.env.example` e `supabase/config.toml` |
| Nominatim só pela Edge Function | `geocode-address` é o único chamador; `tests/contract/client-secrets.test.ts` e a proteção de `fetch` em `src/test/setup.ts` |
| Consulta só no clique, sem autocomplete | `coordinates-field.test.tsx`: mudar endereço ou digitar não consulta; só o clique abre o aviso |
| Aviso e confirmação explícita | `coordinates-field.test.tsx` (texto exato, "Concordo", "Cancelar"); `geocode-address-handler.test.ts` (428 sem `consent_confirmed`); E2E |
| Bloqueios (pessoa física, desligada, incompleto, limite, teste sem mock) | `geocode-address-handler.test.ts` e `nominatim-provider.test.ts`; nenhum bloqueio chama o provedor |
| Só logradouro, número, cidade, UF, CEP e país saem | `nominatim-provider.test.ts` (captura da consulta) e `geocode-address-handler.test.ts` (campos extras ignorados) |
| Cache por organização, retenção documentada | `supabase/tests/007_geocode_cache.test.sql` (dois tenants, 30 dias) e testes de acerto e falha no handler |
| Limite global de 1/s | balde `geocode:provider` com janela derivada de `GEOCODING_RATE_LIMIT_PER_SECOND`, teto de 1 |
| Registros sem endereço nem URL | `geocode-address-handler.test.ts` percorre oito cenários e confere o registro |
| Interface `GeocodingProvider` trocável | `registry.ts` e o teste de troca por configuração |
| Correção manual do ponto no mapa | `coordinates-field.test.tsx`, `osm-map.tsx`/`map-view.tsx` (`onPick`) e E2E |
| Nenhuma chamada real nos testes | adaptador bloqueado sob Vitest, `fetch` ao Nominatim rejeitado no setup, teste dedicado |

Os resultados medidos estão na seção 8.

**T160:** a validação do RIA-024 é anterior a este ajuste. Confirmado pelo responsável pelo projeto em 08/10/2026 (mensagem na conversa): o fluxo novo está validado. Amostra, ambiente e duração não foram informados e não estão registrados.

## 8. Revisão final: gates reproduzidos e corrigidos (08/10/2026)

**A cobertura anterior foi reprovada.** O `npm run test:coverage` do estado anterior à correção (commit `f1597a2`) não atendia aos limites, que foram mantidos:

| Métrica | Antes (reprovado) | Mínimo | Depois |
|---|---|---|---|
| Statements | 86,63% | 85% | 91,70% |
| Branches | 79,80% (medido aqui: 79,79%) | 80% | 86,83% |
| Functions | 84,17% | 85% | 91,08% |
| Lines | 89,61% | 85% | 94,23% |
| Branches em `src/domain/**` | 91,94% | 95% | acima de 95% (o comando passa) |

Os números "antes" são os informados na revisão final; funções (84,17%) e ramos (79,79%) foram conferidos aqui num `git worktree` do commit `f1597a2`. Nenhum threshold foi reduzido, nenhum arquivo saiu da cobertura e nenhum teste foi removido, ignorado ou desabilitado. O único ajuste em testes existentes foi subir de 5 s para 30 s o prazo de duas varreduras de arquivos em `tests/contract/escalas-no-codigo.test.ts`, que estouravam só com a cobertura ligada (a mesma medida já existia em `no-external-assets`).

Testes de comportamento acrescentados para a cobertura: `registry-views.test.ts` (mapeamento de todas as visões, valores ausentes e inválidos), `registry-service-operations.test.ts` (corpo e resposta de cada operação do serviço e detalhes das falhas), `registry-area.test.tsx` (todas as rotas, modais, Escape, links), `map-block.test.tsx` (permissão, exemplo, erro, repetição, desmontagem), `geofence-geometry.limites.test.ts`, `registry-validation.casos.test.ts` e `history-format.casos.test.ts`.

### Gates reexecutados

| Comando | Resultado |
|---|---|
| `npm ci` | **não executado**: o `node_modules` existente já corresponde ao `package-lock.json`, e reinstalar apagaria as dependências da máquina com alterações locais em `package.json` e `package-lock.json` que não são desta spec |
| `npm run typecheck` | sem erros |
| `npm run lint` | sem erros |
| `npm run test` / `npm run test:coverage` | 219 arquivos e 3116 testes aprovados; limites de cobertura atendidos |
| `npm run build` | aprovado |
| `npm run catalogo:build` | aprovado |
| `npx supabase db reset` + `npx supabase test db` | 64 arquivos e 1624 testes pgTAP aprovados (inclui `007_geocode_cache`, 17 testes com dois tenants) |
| `npm run test:live` | 17 arquivos e 108 testes aprovados |
| `npm run test:e2e` | 1464 aprovados e 31 ignorados (suítes ao vivo); 2 falharam na primeira execução (`registro-geocercas.spec.ts:72` em desktop-chromium e `navegacao-menu.spec.ts:372` em tablet-webkit, telas que este ajuste não altera) e passaram ao repetir cada um isolado, ou seja, são instáveis sob carga |
| `npm run test:visual:atualizar` | 177 capturas reproduzidas no Linux, nenhuma imagem alterada |
| `npm run ia:validar` | ver o resultado no commit (executado pelo hook) |

### Funcionamento das chaves de configuração (verificado por testes de contrato)

- `GEOCODING_ENABLED` diferente de `true`: `FEATURE_DISABLED` (403), sem consulta ao banco além da sessão e sem instanciar o provedor.
- `GEOCODING_PROVIDER` desconhecido: `SERVICE_UNAVAILABLE`, sem trocar de provedor às escondidas; um provedor registrado novo funciona sem mudar o frontend.
- `GEOCODING_ALLOW_PERSONAL_ADDRESSES=false`: cliente pessoa física responde `PERSONAL_ADDRESS_NOT_ALLOWED` (403) e nada sai; o tipo vem do banco, e um `person_type` no corpo é ignorado.
- `GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION=true`: sem `consent_confirmed: true`, `CONFIRMATION_REQUIRED` (428).
- `GEOCODING_CACHE_TTL_DAYS`: 1 a 90 dias, padrão 30, repassado à gravação do cache.
- `GEOCODING_RATE_LIMIT_PER_SECOND`: nunca acima de 1 requisição por segundo.

### Decisões humanas registradas em 08/10/2026 (Confirmado pelo responsável pelo projeto em 08/10/2026 (mensagem na conversa))

- **Validador oficial:** Natã Baracho; validação do RIA-024 aceita; T124 corrigida (seção 6).
- **T125:** revisão aprovada; falta apenas os checks da PR ficarem verdes.
- **T160:** fluxo novo de coordenadas validado.
- **T146:** envio ao Nominatim liberado para o protótipo, a ser revisado no futuro; produção continua exigindo avaliação jurídica, contratual e de capacidade.
- **T122:** o roteiro do quickstart foi realizado, com tempos de 20 minutos e de 34 minutos. Não foi dito a que etapa ou métrica cada tempo se refere, então MS-001 a MS-008 **não** foram preenchidas.

### Pendências

- T122: resultado e tempo de cada métrica MS-001 a MS-008, um a um.
- T125: checks da PR verdes.
