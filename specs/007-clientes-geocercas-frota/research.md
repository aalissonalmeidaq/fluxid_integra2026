# Pesquisa e decisões técnicas: Clientes, unidades, geocercas, veículos e motoristas

**Feature**: `007-clientes-geocercas-frota` | **Data**: 07/10/2026 | **Spec**: [spec.md](./spec.md)

Cada decisão traz o que foi escolhido, o porquê e as alternativas descartadas. Os itens que a spec deixou para o plano (CNPJ alfanumérico, limites de geocerca, volumes e PostGIS no CI) estão resolvidos aqui. Nenhum `NEEDS CLARIFICATION` permanece.

## 1. PostGIS para geocercas

**Decisão**: habilitar `postgis` (3.3.7, já presente na imagem do Supabase local e, portanto, no CI) por migration, no schema `extensions`, e guardar a forma da geocerca como `geography(Polygon, 4326)` em `area`, mais `center geography(Point, 4326)` e `radius_m` para o círculo.

**Verificado**: `select name, default_version from pg_available_extensions where name = 'postgis'` retorna 3.3.7 na imagem local (`supabase_db_fluxid`). O CI sobe a mesma pilha do Supabase CLI, então a extensão existe lá.

**Por quê**: `geography` mede em metros sobre o elipsoide, sem projeção, que é o que raio em metros e "ponto dentro" pedem. O índice GiST em `area` responde "quais geocercas contêm este ponto" sem varrer a tabela (RNF-003).

**Detalhes**:
- Como as funções usam `set search_path = ''`, todo uso do PostGIS é qualificado (`extensions.ST_Covers`, `extensions.geography`).
- **Círculo exato**: o polígono `area` de um círculo é uma aproximação (`ST_Buffer`, 32 segmentos por quarto), boa para o filtro por índice, mas a decisão "dentro" usa a distância exata: `ST_DWithin(center, ponto, radius_m)`. A consulta faz o pré-filtro `area && ponto` (índice) e depois o teste exato por forma: polígono por `ST_Covers(area, ponto)`, círculo por `ST_DWithin`. Assim a borda conta como dentro (spec, casos de borda) sem erro de aproximação. O pré-filtro usa uma `area` ligeiramente maior que o círculo (buffer circunscrito), para nunca descartar um ponto que o teste exato aceitaria.
- **Sentido dos vértices**: a spec aceita horário e anti-horário. Em `geography`, polígono muito grande é ambíguo pelo sentido, mas as geocercas têm no máximo 5 km de extensão prática; um teste cobre os dois sentidos (CA-007). A validade (cruzamento de arestas, área > 0) é checada em `geometry` com `ST_IsValid` antes da conversão, porque `geography` não tem `ST_IsValid`.
- Coordenadas são sempre `(longitude, latitude)` no PostGIS e `latitude`, `longitude` na API e na tela; a conversão fica em um só lugar da RPC.

**Alternativas descartadas**: `latitude`/`longitude`/`raio` em colunas simples com cálculo no código (sem índice espacial, retrabalho na Fase 7); `earthdistance` + `cube` (não faz polígono); `geometry` em SRID 4326 (mede em graus); bibliotecas de geometria no cliente para a decisão "dentro" (a regra precisa ser única e do servidor).

## 2. Limites da geocerca

**Decisão**: raio de 25 m a 5 000 m; polígono de 3 a 100 vértices (sem contar o fechamento), sem arestas cruzadas, sem vértices repetidos em sequência e com área maior que zero; latitude de −90 a 90 e longitude de −180 a 180. Os limites existem uma vez no TypeScript (`geofence-limits.ts`) e uma vez no SQL (`private.geofence_limits()`), com teste de contrato que reprova divergência, como o limite de 30 dias da Spec 006.

**Por quê**: 25 m cobre a precisão realista de GPS de celular em área urbana (abaixo disso o alerta seria ruído) e 5 km cobre unidades industriais grandes; 100 vértices bastam para qualquer contorno de unidade e limitam o custo da validação (O(n²) em 100 arestas é trivial).

## 3. CNPJ alfanumérico e demais documentos

**Decisão**: validar CPF, CNPJ (numérico e alfanumérico) e CNH no domínio TypeScript e repetir a validação no banco (defesa em profundidade), com a mesma tabela de casos nos dois lados.

**CNPJ alfanumérico (fonte oficial)**: Nota Técnica Conjunta do CNPJ alfanumérico 2025.001 (Receita Federal, ENCAT e demais órgãos), confirmada em materiais da Serasa Experian, TOTVS e do CNPJ.ws. Os 12 primeiros caracteres aceitam `0-9` e `A-Z`; os 2 dígitos verificadores continuam numéricos; o total segue com 14 caracteres. O cálculo é o módulo 11 de sempre, com os pesos `5,4,3,2,9,8,7,6,5,4,3,2` para o primeiro dígito e `6,5,4,3,2,9,8,7,6,5,4,3,2` para o segundo; **só muda a conversão**: o valor de cada caractere é o código ASCII menos 48 (`0-9` valem 0 a 9; `A` vale 17, `B` 18 e assim por diante). Resto menor que 2 → dígito 0; senão dígito = 11 − resto. O CNPJ numérico é um caso particular do mesmo algoritmo, então **uma só função** valida os dois. Entrada normalizada: maiúsculas, sem `.`, `/` e `-`. Rejeita os 14 caracteres iguais (como no numérico).
- **Pegadinha**: o dígito verificador é numérico; letra nas posições 13 e 14 é inválida.
- Casos de teste: o CNPJ de exemplo oficial da nota técnica `12.ABC.345/01DE-35`, os CNPJs numéricos conhecidos e os de dígito errado (CA-008). Dados de teste sempre fictícios.

**CPF**: módulo 11 clássico (pesos 10→2 e 11→2), rejeitando 11 dígitos iguais. **CNH**: 11 dígitos com os dois dígitos verificadores do algoritmo do DENATRAN (pesos 9→1 e 1→9, com o ajuste de `dsc` quando o primeiro resto for ≥ 10), rejeitando sequências iguais. Os algoritmos entram nos testes de domínio com valores fictícios gerados pela própria suíte (nunca documento real).

## 4. Guardar documentos pessoais fora do alcance do cliente

**Decisão**: CPF e número da CNH ficam em tabelas próprias (`customer_documents` para clientes pessoa física e `driver_documents`), com RLS ligada, **sem política de `select` e com todos os privilégios revogados de `anon` e `authenticated`**. O acesso só acontece por RPC `security definer` chamada pela Edge Function com a chave de serviço: a RPC de listagem devolve o documento **mascarado** (calculado no banco), e só `reveal_document` devolve o valor completo, depois de conferir a permissão `*.document` e gravar a auditoria na mesma transação.

**Por quê**: na Spec 006, as tabelas têm uma política de `select` para membros ativos com `cylinder.read` como segunda barreira. Para CPF isso vazaria o dado completo a qualquer membro com a permissão de leitura que consultasse a tabela pelo PostgREST. Separar o documento em tabela sem política elimina o caminho. A unicidade por organização continua garantida por índice único nessas tabelas (`unique (organization_id, value)`).

**Máscara**: CPF → `***.***.***-XY` (só os dois últimos dígitos); CNH → `*********XYZ` (só os três últimos); CNPJ de pessoa jurídica não é dado pessoal e aparece completo. A coluna de exibição (`document_display`) é gerada na RPC de escrita e armazenada na tabela principal, para a lista nunca tocar a tabela de documentos. Busca por documento é por igualdade do valor completo digitado (a RPC compara com a tabela protegida), nunca por trecho, para não virar oráculo de enumeração.

**Nada de documento em saídas**: histórico e auditoria guardam o evento `document_changed` sem valor (CPF/CNH) e os campos `old`/`new` apenas para CNPJ de pessoa jurídica e placa (decisão da clarificação). Mensagens de duplicidade nomeiam o cadastro existente, nunca o documento. Os manipuladores das funções não registram corpo de requisição. Um teste (CA-005) cadastra e edita valores conhecidos e procura esses valores em `audit_logs`, `registry_events`, respostas de erro, logs capturados e cache.

**Risco aceito e registrado**: o valor completo fica em colunas de texto do PostgreSQL, protegidas por RLS, privilégios e criptografia em repouso da plataforma; criptografia por coluna (`pgsodium`/Vault) foi avaliada e adiada, porque exige gestão de chaves que o projeto ainda não tem e não muda o modelo de acesso.

**Revelar**: a revelação é sob demanda, um registro por vez, e gera a auditoria `driver.document_reveal` / `customer.document_reveal` sem o valor. A tela guarda o valor só em estado de componente (nunca em `localStorage`, URL, cache ou histórico de navegação), descarta ao ocultar, sair da tela, trocar de organização, recarregar ou perder a sessão; respostas com valor levam `Cache-Control: no-store`.

## 5. Consulta de CEP pelo servidor (ViaCEP)

**Decisão**: nova Edge Function `lookup-postal-code`, com uma porta `PostalCodeProvider` (`lookup(cep): Promise<PostalAddress | 'NOT_FOUND'>`) e a implementação `ViaCepProvider`. A tela só conhece a resposta padronizada do FluxID.

**Contrato real do ViaCEP (verificado em 07/10/2026)**:
- `GET https://viacep.com.br/ws/{cep}/json/` com CEP de 8 dígitos.
- CEP válido e existente: HTTP 200 com `cep`, `logradouro`, `complemento`, `bairro`, `localidade`, `uf`, `ibge` etc.
- CEP bem formado que **não existe**: HTTP 200 com `{"erro":"true"}` (texto, não booleano; a documentação antiga cita booleano). O adaptador aceita `true` e `"true"`.
- CEP **malformado** (menos de 8 dígitos): HTTP 400 com **HTML**, não JSON; o adaptador não depende desse caso, porque o FluxID valida os 8 dígitos antes de chamar.
- O campo `complemento` do ViaCEP descreve o logradouro (por exemplo "lado ímpar"), **não** o complemento da unidade; a spec manda a pessoa informar o complemento, então esse campo é ignorado.
- Respostas trazem `Cache-Control: public, max-age=3600` e `Access-Control-Allow-Origin: *`, o que confirma que é serviço público, sem chave, e que o FluxID não deve tratar o resultado como dado da organização.

**Mapeamento padronizado**: `{ postal_code, street, district, city, state, ibge_code }`, todos como texto com tamanho limitado (logradouro 120, bairro 80, cidade 80, UF 2 letras maiúsculas, IBGE 7 dígitos); campos fora disso são descartados; `state` fora das 27 UFs vira "serviço indisponível" (resposta suspeita).

**Privacidade (RF-009, CA-006)**: a única informação enviada é o CEP, no caminho da URL; sem query string, sem corpo, sem cookies e com `User-Agent` fixo `FluxID/1.0`. O navegador nunca chama o ViaCEP, então a política de segurança de conteúdo e o service worker não mudam. Teste de contrato captura a requisição de saída e confere que ela só tem o CEP.

**Falhas (RF-011, RNF-004)**: prazo total de 4 s (`AbortController`) dentro do máximo de 5 s da spec; 5xx, tempo esgotado, JSON inválido e resposta suspeita viram `SERVICE_UNAVAILABLE`; `{"erro":...}` vira `NOT_FOUND`. Sem nova tentativa automática (evita multiplicar chamadas), sem cache servidor (o CEP não é dado da organização, e cache entre organizações exigiria cuidado de isolamento por pouco ganho).

**Limite de taxa (clarificação)**: reaproveita `public.take_rate_limit_token` (Spec 002): dois baldes, `postal_code:user` com 10 por 60 s por pessoa e `postal_code:org` com 100 por 60 s por organização. O contador conta toda tentativa, inclusive as negadas, e o sujeito é o identificador opaco da pessoa ou da organização, não o CEP. A resposta `RATE_LIMITED` (HTTP 429) traz `retry_after_seconds`.

**Log**: o manipulador registra apenas código de resultado e duração, sem CEP nem identificação da pessoa (RF-012). A consulta não é auditada (não altera nada), mas exige `customer.write`.

**Alternativas descartadas**: chamar o ViaCEP do navegador (expõe terceiros ao cliente e depende de CORS e do estado da rede da pessoa); BrasilAPI ou outro como principal (a pessoa escolheu o ViaCEP; a porta permite trocar); cache de resultados no servidor; nova tentativa automática.

## 6. Histórico imutável: uma tabela de eventos para as cinco áreas

**Decisão**: uma tabela `registry_events` com `entity_type` (`customer`, `site`, `geofence`, `vehicle`, `driver`), `entity_id`, `sequence` por entidade, tipo de evento, autor, sessão, justificativa e dados, no mesmo desenho de `cylinder_events`, com os mesmos gatilhos de imutabilidade. A sequência é atribuída sob bloqueio (`for update`) da linha da própria entidade, escolhida por tipo.

**Por quê**: cinco tabelas quase idênticas multiplicariam gatilhos, políticas RLS e testes pgTAP sem benefício; a consulta de histórico é a mesma. Índice `(organization_id, entity_type, entity_id, sequence)` mantém a leitura paginada eficiente. **Descartado**: reaproveitar `cylinder_events` (acopla à FK de cilindro) e 5 tabelas separadas (custo de manutenção).

**Contatos do cliente**: são a única parte do cadastro que pode ser removida. Eles não têm situação nem histórico próprio e a edição da lista de contatos (acrescentar e remover) é um requisito da tela; por isso `customer_contacts` aceita `delete` **somente** dentro de `update_customer`, por gatilho com variável de sessão local, e o evento `contacts_changed` registra só contagens. Contatos anonimizados são preservados. A alternativa de remoção lógica (`removed_at`) foi descartada porque manteria nome, telefone e e-mail do contato removido no banco, o oposto do que a proteção de dados pede.

## 7. Cascata atômica da inativação do cliente

**Decisão**: a RPC `inactivate_customer` roda em uma transação: trava o cliente, as unidades ativas dele e as geocercas ativas dessas unidades (`for update`, em ordem estável para evitar impasse), marca todos como inativos, grava um evento por registro afetado e **um** registro de auditoria da ação com a contagem de unidades e geocercas afetadas. Falha em qualquer ponto desfaz tudo (CA-010). A tela chama primeiro uma consulta de prévia (`preview_customer_inactivation`) que devolve as quantidades, mostradas no diálogo de confirmação; se, entre a prévia e a confirmação, as quantidades mudarem, a RPC recebe `expected_counts` e responde `CASCADE_CHANGED` para a tela refazer a confirmação. Inativar uma unidade segue a mesma lógica sobre as geocercas dela. Reativar nunca desce em cascata; reativar unidade ou geocerca exige o pai ativo (`PARENT_INACTIVE`).

## 8. Vínculo motorista ↔ usuário

**Decisão**: `drivers.linked_user_id uuid` referencia `auth.users(id)`, com índice único parcial `(organization_id, linked_user_id) where linked_user_id is not null`. A RPC `link_driver_user` confere, no banco, que existe `memberships` ativa do usuário na organização **e** um `membership_roles` para o papel `driver` daquela organização; qualquer outro caso é `USER_NOT_ELIGIBLE`, sem revelar se o usuário existe em outra organização. A operação auxiliar `list_linkable_users` devolve só nome de exibição e identificador dos elegíveis (sem e-mail), para a tela oferecer a escolha. O vínculo não concede nem altera papéis. Se o usuário depois deixa de ser elegível, o vínculo permanece no histórico e a leitura marca "usuário inativo" (calculado na consulta).

## 9. Situação do documento do veículo e da CNH

**Decisão**: o cálculo "em dia / a vencer / vencido / sem data" é uma função de domínio única (`src/domain/shared/validity-status.ts`) com o limite `EXPIRING_DAYS = 30`; `hydrostatic-status.ts` passa a importar essa constante, e `private.document_expiring_days()` no SQL devolve `private.hydrostatic_expiring_days()`, de modo que o limite continua existindo uma vez em cada lado e um teste de contrato reprova divergência (RF-022, CA-009). Diferente do teste hidrostático, aqui não há denormalização: a data de vencimento é uma coluna do próprio cadastro, e o filtro de lista usa faixas de data calculadas com o dia de `America/Sao_Paulo`, sem manter coluna derivada.

## 10. Permissões, papéis e menu

**Decisão**: 20 permissões novas no catálogo (`customer.read|write|deactivate|history|document|anonymize`, `geofence.read|write|deactivate|history`, `vehicle.read|write|deactivate|history`, `driver.read|write|deactivate|history|document|anonymize`), concedidas por migration ao `tenant_admin` (todas), `stock_operator` (`customer.read`, `geofence.read`, `vehicle.read`, `driver.read`), `technical_operator` (`customer.read`, `vehicle.read`) e `tenant_auditor` (`read` e `history` das quatro áreas), além do papel `master_fluxid`. O papel `driver` não recebe nenhuma. `bootstrap_tenant_roles` é atualizado e os tenants existentes recebem as concessões de forma idempotente; nenhum papel perde permissão. O catálogo de telas ganha quatro itens ("Clientes", "Geocercas", "Veículos" e "Motoristas") com ícones do conjunto oficial existente: `entrega`, `geocerca`, `caminhao` e `rota`. Unidades aparecem dentro do cliente.

## 11. Duas Edge Functions de domínio mais uma de CEP

**Decisão**: `query-registry` (consulta) e `manage-registry` (comando), no padrão de `query-cylinders` e `manage-cylinders`, reaproveitando a borda genérica de `_shared/cylinders.ts`. A borda é extraída para `_shared/operations.ts` (sem mudança de comportamento, coberta pelos testes atuais) e `_shared/cylinders.ts` passa a reexportá-la; os códigos de erro novos entram na tabela de HTTP. `lookup-postal-code` é separada porque tem outra permissão, outro tipo de efeito (chamada externa, sem auditoria) e outro limite de taxa. **Descartado**: um endpoint por entidade (mais arquivos, mesma lógica) e misturar a consulta de CEP no `manage-registry` (acoplaria comando auditado a chamada externa).

## 11b. Geocodificação do endereço (decisão de 07/10/2026)

**Decisão**: nova Edge Function `geocode-address`, no mesmo molde de `lookup-postal-code`, com porta `GeocodingProvider` e a implementação `NominatimProvider` (OpenStreetMap, busca estruturada, `countrycodes=br`). O resultado é só uma sugestão: a pessoa confirma o endereço normalizado e o ponto antes de gravar, e a origem (`manual` ou `geocoded`), quem confirmou e quando ficam na unidade. A reconfirmação do motorista na primeira entrega fica para a Fase 4.

**Motivo**: o ViaCEP não devolve coordenadas e digitar latitude e longitude é lento e sujeito a erro. O Nominatim é gratuito e sem chave, o que evita segredo novo, e a porta deixa trocar por Google ou Mapbox sem mexer na tela.

**Ajuste de 08/10/2026 (uso controlado no protótipo)**: a integração é **temporária e exclusiva do protótipo**. Ficou atrás de configuração no servidor (`GEOCODING_ENABLED`, `GEOCODING_PROVIDER`, `GEOCODING_ALLOW_PERSONAL_ADDRESSES`, `GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION`, `GEOCODING_RATE_LIMIT_PER_SECOND`), só consulta no clique em "Buscar coordenadas" depois de aviso e confirmação explícita, bloqueia pessoa física por padrão, envia só logradouro, número, cidade, UF, CEP e país, guarda cache por organização por 30 dias e registra apenas identificador, provedor, duração, status e código de erro. Ver `docs/geocodificacao-prototipo.md`. Isso **não** resolve T146: produção segue exigindo decisão jurídica e provedor adequado.

**Riscos e tratamento**: a política do Nominatim limita a 1 requisição por segundo e exige identificação do aplicativo (balde global `geocode:provider` e `user-agent` fixo); a precisão no Brasil varia (por isso `precision` na resposta, aviso na tela e confirmação humana); o endereço completo de pessoa física sai para um terceiro (RF-065 limita aos campos de endereço; a premissa 14 e a equipe jurídica seguem como decisão aberta); o uso em produção de grande volume pode exigir instância própria ou provedor pago. **Alternativas descartadas**: Google Geocoding (pago e com chave secreta no servidor, adiável pela porta), geocodificar no navegador (expõe o endereço e fura o RF-009) e gravar a sugestão sem confirmação (risco de entrega no lugar errado).

## 11c. Mapas (decisão de 07/10/2026)

**Decisão**: Leaflet 1.9 com blocos do OpenStreetMap, em `src/components/maps/` (`OsmMap` para um ponto e `PointsMap` para vários), carregado com `React.lazy`: o pacote de entrada ficou em 574 kB (limite 593,95 kB) e o Leaflet vive no bloco `map-view`. Marcadores vetoriais (`circleMarker`) coloridos por token (azul: confirmado; ciano: sem confirmação), sem imagens de marcador; balões montados com `textContent`.

**Alternativas descartadas**: quadro (`iframe`) do OpenStreetMap (um marcador só e terceiro dentro da página) e mapa em SVG próprio (sem ruas nem zoom).

**Riscos**: o navegador pede blocos ao OpenStreetMap, que vê o IP e a região visualizada (nenhum dado de cadastro); a política de uso dos blocos pede uso moderado e atribuição (atribuição fixa no mapa), e produção em volume exige provedor de blocos próprio ou pago, trocando só `TILE_URL`. A regra e o teste de recursos de terceiros ganharam uma exceção só para os dois domínios.

## 12. Volume de referência e desempenho

**Decisão**: volume oficial por organização para testes: 10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas (RNF-001 a RNF-003). Índices: B-tree `(organization_id, status, lower(legal_name))` para a lista de clientes; trigrama (`pg_trgm`, já instalado) em nome, nome fantasia, cidade e nome da unidade para a busca por trecho; `(organization_id, plate)` único; GiST em `geofences.area`; paginação por cursor. Scripts de massa e limpeza em `tests/support/sql/`, no padrão de `cilindros-volume-*.sql`; medição de banco na suíte `.live` e a primeira página em 4G com Playwright e limitação de rede, registradas em `validation.md`.

## 13. Interface e bundle

**Decisão**: nenhuma dependência nova no cliente. A validação de polígono (vértices, cruzamento, área) e a pré-visualização esquemática em SVG são domínio próprio e componente próprio, com os tokens e ícones existentes. As rotas são `React.lazy`; só o catálogo de telas (quatro itens) entra no pacote de entrada. Linha de base atual: 579,54 kB, folga de 14,4 kB até 593,95 kB. A tela de geocerca descreve a forma em texto (alternativa do SVG) para leitores de tela.

## 14. Concorrência e unicidade

**Decisão**: `version` otimista em cada tabela principal (`expected_version`, `VERSION_CONFLICT`), como na Spec 006. Unicidade por índice único (documento, placa, CPF, CNH, nome de unidade por cliente, nome de geocerca por unidade) mais `pg_advisory_xact_lock` por (organização, valor normalizado) para que o perdedor da corrida receba o conflito limpo e nunca grave pela metade. A correção de documento/placa (RF-004a) passa pelo mesmo caminho e exige justificativa.

## 15. Anonimização de dados pessoais

**Decisão**: a anonimização é uma **substituição irreversível dos campos pessoais no próprio registro**, sem excluir linha alguma. Cada operação (`anonymize_driver`, `anonymize_customer`, `anonymize_contact`) roda em uma transação: confere a permissão (`driver.anonymize` ou `customer.anonymize`, marcadas `critical = true` no catálogo e só do `tenant_admin`), a pré-condição (registro inativo, exceto contato), a versão e a confirmação; sobrescreve nome por texto fixo e anula documento, telefone, e-mail e demais campos pessoais; preenche `anonymized_at` e `anonymized_by`; remove o vínculo de usuário; grava um evento (`person_anonymized` ou `contact_anonymized`) e uma auditoria com a **lista de campos**, sem valores.

**MFA**: o manipulador exige sessão `aal2` e responde `MFA_REQUIRED` (403) sem ela, exatamente como `manage-membership` já faz (`identity.aal !== 'aal2'`), reaproveitando o padrão e o código de erro que a borda genérica já conhece.

**Efetividade no histórico**: a anonimização só é completa se o histórico nunca guardou o valor. Por isso, além de CPF, CNH, telefone e e-mail (decisão 4), o **nome de pessoa física** (nome do motorista, nome e nome fantasia de cliente pessoa física, observações, contatos e campos pessoais das unidades) também só registra "alterado" nos eventos de edição (`data.changed_sensitive`). A mensagem de duplicidade, que cita o nome do dono do cadastro existente, passa a citar "Motorista anonimizado" depois da anonimização, porque lê o registro vivo.

**Constraints**: `document_key` (clientes) e `cpf` e `cnh_number` (motoristas) ficam **nuláveis somente com a marca de anonimização, que existe na própria linha do documento** (`anonymized_at`), por `check` de linha única, porque o PostgreSQL não aceita `CHECK` que consulte outra tabela; a consistência com o pai (cliente ou motorista também anonimizado) vem de a anonimização gravar as duas marcas na mesma transação e de um teste que a confere; como `unique` aceita vários nulos, o documento fica livre para novo cadastro (RF-059). O gatilho que recusa `update` nessas tabelas aceita a mudança para nulo só dentro das funções de anonimização (variável de sessão local, como o padrão `app.system_bootstrap` já usado nas migrations).

**Bloqueio do registro anonimizado**: feito por gatilho `before update` nas tabelas (que consulta o cliente pai nas unidades), e não reescrevendo as RPCs das fases anteriores; a exceção `anonymized_record` é traduzida pela borda das funções em `ANONYMIZED_RECORD` (409), e só as funções de anonimização contornam o gatilho, por variável de sessão local.

**O que permanece**: identificadores, situação, categoria e validade da CNH, endereço de unidade (CEP, logradouro, bairro, cidade e UF), geocercas, histórico e auditoria. Endereço e geocerca de cliente pessoa física são localização; mantê-los é decisão de rastreabilidade (premissa 14 da spec), com a ressalva de que podem ser tratados por spec futura.

**Cópias de segurança e logs**: a plataforma mantém cópias do banco por prazo próprio; a anonimização não as reescreve (RF-063). Isso fica documentado para a pessoa responsável e para a equipe jurídica.

**Alternativas descartadas**:
- **Exclusão física**: viola RF-033, quebra chaves e históricos e impede a rastreabilidade.
- **Pseudonimização com chave guardada** (valor cifrado que pode ser recuperado): reversível, logo não é anonimização, e exige gestão de chaves que o projeto ainda não tem.
- **Tabela de lápide que copia o valor antes de apagar**: preservaria exatamente o dado que se quer remover.
- **Anonimizar também endereço e geocerca**: apagaria a rastreabilidade das entregas já feitas; fica como decisão aberta da premissa 14.

## 16. Fora do que a pesquisa alterou na spec

Nenhuma decisão desta pesquisa muda escopo. Dois ajustes de redação da spec, para a convergência: (a) citar que o `complemento` do ViaCEP é ignorado; (b) registrar o contrato de CEP e a lista de permissões em `contracts/`. Ambos são só documentação.
