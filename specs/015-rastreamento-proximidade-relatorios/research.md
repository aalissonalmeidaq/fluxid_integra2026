# Pesquisa técnica — Spec 015

## 1. Coleta em segundo plano

**Decisão**: usar um plugin Capacitor local, mantido pelo projeto, para iniciar um Android Foreground Service do tipo `location` quando o motorista inicia a viagem em tela visível. O serviço mantém notificação persistente, coleta preferencialmente a cada 60 s e termina ao concluir/cancelar ou após a janela offline. A web/PWA usa `watchPosition` somente enquanto o documento estiver visível.

**Motivo**: a especificação W3C descarta atualizações para documentos não totalmente ativos/visíveis, e o plugin oficial de geolocalização do Capacitor não oferece rastreamento contínuo em segundo plano. Desde o Android 8, um processo comum em background recebe localização poucas vezes por hora; Foreground Service é a fronteira suportada para uma tarefa contínua e perceptível.

**Permissões**: pedir somente localização foreground no fluxo normal. Um FGS iniciado pela Activity visível mantém acesso ao apagar a tela, portanto `ACCESS_BACKGROUND_LOCATION` não é necessário para este caso e aumentaria coleta e revisão de privacidade. Android 10 exige o tipo `location`; Android 12+ restringe início do FGS em background; Android 13 exige declarar e solicitar `POST_NOTIFICATIONS` para a indicação normal na gaveta — sua recusa não impede o FGS nem a viagem, mas deve produzir aviso de visibilidade reduzida/degradada; Android 14 exige `FOREGROUND_SERVICE_LOCATION` e localização concedida antes da promoção do serviço. Recusa de localização também não impede a viagem e gera modo degradado.

**Cadência**: `60_000 ms` é preferência, não garantia. Persistir o instante fornecido pela medição, não o envio; não usar batching; precisão insuficiente vira inconclusiva. Não reiniciar silenciosamente serviço morto: registrar lacuna e pedir retomada visível.

**Alternativas rejeitadas**: PWA como garantia de segundo plano; plugin comunitário com manutenção/permissões não auditadas; `ACCESS_BACKGROUND_LOCATION` sem necessidade; processo Android comum.

**Fontes**: [W3C Geolocation](https://www.w3.org/TR/geolocation/), [Capacitor Geolocation](https://next.capacitorjs.com/docs/apis/geolocation), [plugins Android do Capacitor](https://next.capacitorjs.com/docs/plugins/android), [serviços em primeiro plano](https://developer.android.com/develop/background-work/services/fgs/launch), [tipos de FGS](https://developer.android.com/develop/background-work/services/fgs/service-types), [restrições de início](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start), [mudanças por versão](https://developer.android.com/develop/background-work/services/fgs/changes), [permissão em background](https://developer.android.com/develop/sensors-and-location/location/permissions/background), [limites desde Android 8](https://developer.android.com/about/versions/oreo/background-location-limits), [uso de bateria](https://developer.android.com/develop/sensors-and-location/location/battery).

## 2. Fila offline e ingestão

**Decisão**: guardar IndexedDB por instalação com proprietário imutável `(user_id, organization_id, endpoint_id, trip_id, tracking_session_id)`. Cada item tem UUID v4, sequência monotônica e `observed_at`. Sincronizar em lotes ordenados; servidor faz upsert/`ON CONFLICT DO NOTHING` pela chave `(organization_id, client_position_id)` e devolve resultado por item.

**Motivo**: segue o coordenador offline existente, preserva 480 itens ou mais, tolera retry e impede que a troca de tenant/sessão envie dados ao destino errado. O servidor deriva o ator do JWT e valida vínculo vigente; não confia em IDs de autorização fornecidos pelo cliente.

**Alternativas rejeitadas**: remover item antes do aceite; gerar ID no servidor; trocar endpoint de destino durante fallback; armazenar tokens junto à fila.

## 3. Modelo e cálculo de proximidade

**Decisão**: PostGIS calcula `ST_Distance` entre `geography(Point,4326)`. A função transacional escolhe pares no mesmo contexto, grava comparação imutável e atualiza a sequência da sessão. Limites são versionados por vigência; três comparações válidas consecutivas `outside` abrem uma ocorrência única. `inside` reinicia sequência pendente; `inconclusive` não confirma nem desfaz.

**Motivo**: distância geodésica em metros, decisão reprodutível e regras fora do React. Índices compostos iniciam por `organization_id` e chaves de vínculo/tempo; FKs compostas impedem relações cruzadas entre tenants.

**Alternativas rejeitadas**: Haversine no componente; recalcular histórico com a configuração atual; armazenar somente o alerta final.

## 4. Atualização da operação

**Decisão**: emitir Broadcast privado contendo apenas tipo de invalidação e identificadores técnicos; o cliente consulta novamente pelas RPCs autorizadas. Manter polling de recuperação a cada 30 s.

**Motivo**: é o padrão da Spec 012 e o caminho recomendado para escala/segurança. A atualização de 2026 do Supabase tornou o schema Realtime interno fechado; a feature só cria políticas permitidas em `realtime.messages`, sem alterar tabelas internas.

**Alternativas rejeitadas**: coordenadas no payload; Postgres Changes para tabelas volumosas; depender exclusivamente do websocket.

**Fontes**: [Database Changes e Broadcast](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes), [autorização Realtime](https://supabase.com/docs/guides/realtime/authorization), [breaking changes do Supabase](https://supabase.com/changelog?types=breaking-change).

## 5. Relatórios e exportações

**Decisão**: uma consulta canônica normaliza filtros e cria um snapshot lógico com `generated_at`; resumo, linhas e exportação usam esse snapshot. Paginação por cursor `(occurred_at, id)`. CSV UTF-8 neutraliza células iniciadas por `=`, `+`, `-`, `@`, tab ou CR e registra geração/download sem conteúdo integral. Arquivos completos ficam em bucket privado, com expiração; o download revalida pessoa, tenant e permissão.

**Motivo**: garante igualdade entre tela e arquivo, paginação determinística e defesa contra CSV injection. Jobs maiores são assíncronos para não depender do limite de uma requisição.

**Alternativas rejeitadas**: paginação por offset; CSV no navegador; bucket público; disponibilizar arquivo durante escrita.

## 6. E-mail

**Decisão**: `email_notification_outbox` deduplica `(occurrence_id, transition, recipient_user_id)`. Uma Edge Function idempotente reclama pequenos lotes, chama uma porta `EmailProvider` e registra sucesso/falha/retry. Categorias do tenant e opt-in individual começam desligados; elegibilidade é revalidada antes do envio. Nenhum provedor externo é fixado nesta fase.

**Motivo**: falhas do canal não participam da transação do alerta; segredos permanecem no servidor; um adaptador permite homologação posterior sem reescrever domínio.

**Alternativas rejeitadas**: SMTP/SDK no React; chamada externa dentro da transação; e-mail com coordenadas; escolha antecipada de fornecedor.

**Fontes**: [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [tarefas em background](https://supabase.com/docs/guides/functions/background-tasks), [limites](https://supabase.com/docs/guides/functions/limits), [Supabase Cron](https://supabase.com/features/supabase-cron).

## 7. UX e acessibilidade

**Decisão**: mapa e lista recebem o mesmo `TrackingTimelineView`. No desktop, aparecem lado a lado; no mobile, Lista é a visão operacional padrão e há alternância explícita. Lacunas quebram polilinhas. Origem, frescor, precisão e retrospectividade aparecem em texto e ícone, nunca só por cor. Filtros canônicos vivem na URL e atualizações não movem foco.

**Motivo**: mantém operação possível sem tiles, com leitor de tela e offline; reduz divergência entre mapa, contadores e relatório; preserva o padrão visual das Specs 003/005.

**Alternativas rejeitadas**: mapa como fonte única; atualização destrutiva da página; filtros apenas em estado React; cores como único indicador.

## 8. Segurança e minimização

**Decisão**: novas permissões independentes `tracking.read`, `report.export`, `notification_category.manage` e `proximity_rule.manage` (alteração da regra exige justificativa e auditoria); operações existentes de alerta continuam exigindo sua permissão própria. RPCs retornam `NOT_FOUND` para recurso de outro tenant. Auditoria guarda IDs, filtros resumidos e resultado, nunca coordenadas. Logs omitem payloads de posição e URLs assinadas.

**Motivo**: localização é dado sensível; a divisão de capacidades está na spec e precisa ser aplicada no servidor, não apenas na navegação.

**Alternativas rejeitadas**: herdar automaticamente de `trip.read`; RLS sem checks na função; telemetria completa em logs/auditoria.

## 9. Banco e desempenho

**Decisão**: tipos estreitos (`timestamptz`, `integer`, `numeric`, enums por `check`), PK UUID e FKs compostas com organização. Índices cobrem tenant, contexto e tempo; jobs usam índices parciais por estado. Transações de ingestão são curtas, lotes limitados e bloqueios seguem ordem determinística.

**Motivo**: segue as práticas do PostgreSQL/Supabase para RLS, paginação por cursor, índices de FK e filas concorrentes. A atualização para PostgreSQL 17.11 exige considerar `REINDEX` em extensões afetadas durante upgrade, não como parte da migration da feature.

**Alternativas rejeitadas**: JSONB para todos os campos; índices globais sem tenant; transação externa longa; offset para histórico volumoso.
