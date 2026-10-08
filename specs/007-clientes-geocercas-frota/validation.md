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

**Pendente.** A entrevista com a pessoa responsável ainda não aconteceu.
