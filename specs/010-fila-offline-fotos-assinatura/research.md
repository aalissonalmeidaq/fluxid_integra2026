# Pesquisa e decisões: Fila offline, fotos e assinatura de entrega

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Cada decisão traz o motivo e as alternativas descartadas. Nenhum marcador de esclarecimento restou na spec; os pontos abaixo são de desenho.

## 1. Reaproveitar a pilha de sincronização da Spec 002

- **Decisão**: usar a base local, a outbox, o coordenador, o resolvedor de conflitos e a política offline que a Spec 002 já entregou (`src/infrastructure/local-database`, `src/infrastructure/synchronization`), e preencher a allowlist `offline-safe` com **quatro operações da outbox** (os anexos seguem por envio próprio, depois da entrega confirmada).
- **Motivo**: a Spec 002 deixou a pilha pronta e **desligada de propósito** ("a allowlist offline-safe é vazia", `tenant-sync-runner.ts`), já com chave de idempotência, dependências entre itens, estados explícitos, descarte autorizado e auditado, conflito que **preserva as duas versões** e promoção de destino que espera a fila esvaziar. Isso atende a arquitetura de conectividade sem reinventar.
- **Alternativas**: fila nova específica de viagens (descartada: duplicaria estados e regras já testados e divergiria do contrato de conectividade); biblioteca de fila (descartada: nenhuma dependência nova).

## 2. Envio pelas operações de `manage-trips`, não pela função `sync-command`

- **Decisão**: o `PushSynchronizer` ganha um registro de **executores por operação**. O executor de cada item chama `manage-trips` com o corpo original e `request_id` igual à `idempotency_key` da outbox; a resposta decide o estado do item. A função genérica `sync-command` continua existindo para operações futuras sem efeito de domínio.
- **Motivo**: `sync-command` só registra a idempotência (`process_sync_command`), **não executa a operação**. As operações de viagem já são atômicas, auditadas e idempotentes por `request_id` (`private.trip_requests`), com toda a validação de domínio e RLS. Executar por elas mantém uma só fonte de regras.
- **Alternativas**: estender `sync-command` para despachar para as RPCs (descartada: duplicaria a validação e a autorização, e criaria um segundo caminho de escrita); reenviar sem `request_id` (descartada: perderia a garantia de não duplicar).
- **Mapeamento de resposta**: 200 → `synced` (remove da fila e do aparelho o conteúdo sensível); 409 e os códigos de recusa de domínio → `conflict`; 400 de validação → `conflict` com o motivo, porque exige decisão humana e não adianta repetir; 401 e 403 → interrompe o envio e pede nova entrada; falha de rede e 5xx → volta a `pending` com espera crescente (`retry-policy`), até o limite de tentativas da outbox.

## 3. Ordem, dependências e paralelismo

- **Decisão**: cada operação de uma viagem **depende da anterior da mesma viagem** (campo `dependencies` da outbox); viagens diferentes não dependem entre si. A chegada precede a entrega da mesma parada. Conflito numa operação bloqueia só as dependentes, na mesma viagem.
- **Motivo**: RF-010 e RF-012. O `PushSynchronizer` já só envia itens cujas dependências estão `synced`.
- **Alternativas**: envio totalmente paralelo (descartada: quebraria a ordem de conferência, chegada e entrega); fila global em série (descartada: uma viagem em conflito pararia todas).

## 4. Viagem guardada no aparelho e leitura offline

- **Decisão**: uma consulta nova, `get_trip_offline`, devolve a viagem aberta e, para cada cilindro previsto, os **identificadores ativos já normalizados**, para a pessoa que pode conferir carga. O aparelho guarda isso em `local_trips` quando a viagem é aberta com conexão, atualiza a cada abertura online e remove ao sair da conta. A leitura offline compara o código só com esses identificadores.
- **Motivo**: `resolve` (Spec 009) é do servidor e não funciona offline. Código fora da viagem não pode ser distinguido entre "de outra organização" e "inexistente" sem o servidor, então a tela diz "não confirmado sem conexão" e nada é conferido (clarificação da spec). Devolver só os identificadores da viagem expõe o mínimo.
- **Alternativas**: baixar todos os identificadores da organização (descartada: volume e exposição desnecessária); conferir sem validar o código (descartada: perderia o ganho da leitura).

## 5. O que fica no aparelho e por quanto tempo

- **Decisão**: o conteúdo sensível do item (posição, nome e função do recebedor, fotos, assinatura) fica em `local_outbox` e `local_attachments` **só até o servidor confirmar**; ao virar `synced`, o item é removido por inteiro (a Spec 002 exige confirmação do servidor para remover). Nada é apagado por tempo, sessão ou limite (RF-026): item sem confirmação por mais de 24 horas aparece **destacado** na tela. O aplicativo pede armazenamento persistente (`navigator.storage.persist()`) para o navegador não descartar a fila, e acompanha o uso por `navigator.storage.estimate()` com aviso a 80% do limite interno (200 operações ou 50 MB de anexos).
- **Cifra**: **não** se cifra o conteúdo da fila nesta spec. A chave teria de ficar no mesmo aparelho (a proteção real seria pequena) e a perda dela destruiria evidência pendente; a mitigação é guardar o mínimo, por pouco tempo, avisar antes de sair da conta e remover ao confirmar. Registrado como risco aceito e candidato à spec de privacidade.
- **Motivo**: decisão de 12/10/2026 (clarificação 2). A Spec 009 proibia posição no aparelho; esta spec a substitui **só para a fila e só até o envio confirmado**. `localStorage`, `sessionStorage` e cache de rede continuam proibidos para esses dados.
- **Alternativas**: prazo máximo no aparelho (descartada na decisão: forçaria apagar ou resolver evidência não enviada); cifra com chave do usuário (descartada: escopo e risco de perda).

## 6. Partição por conta, organização e destino

- **Decisão**: todo registro local leva `actor_id`, `organization_id` e `endpoint_id` (o destino Supabase de origem); a lista da base filtra pelos três. Outra conta, organização ou destino **não** vê nem envia a fila. O envio compara o destino atual com o do item e, se diferirem, não envia e avisa; o `EndpointPromotionCoordinator` já adia a troca enquanto houver pendência.
- **Motivo**: RF-016 e RN-007; a arquitetura proíbe a mesma mutação em duas instâncias e a troca de sessão por simples troca de URL.
- **Alternativas**: filtrar só por organização (descartada: outra conta no mesmo aparelho veria a fila); reenviar ao novo destino (descartada: viola a arquitetura).

## 7. Uma aba por vez

- **Decisão**: o envio roda sob um **trava de aba** (`navigator.locks.request`, nome fixo por conta e organização). Sem o recurso, uma eleição simples por `BroadcastChannel` com tempo de vida decide a aba que envia.
- **Motivo**: RF-017; evita duas abas enviarem o mesmo item. A idempotência do servidor é a segunda defesa.
- **Alternativas**: sem trava, só idempotência (descartada: gera conflito desnecessário e tentativas duplicadas).

## 8. Quando enviar

- **Decisão**: com o aplicativo aberto, ao iniciar, ao voltar a conexão (`online` e a verificação de saúde do destino), a cada 30 segundos enquanto houver pendência e no botão "Enviar agora". Sem promessa em segundo plano.
- **Motivo**: clarificação da spec; o Background Sync do navegador não é garantido em todos os aparelhos e não funciona com o aplicativo fechado de forma confiável.
- **Alternativas**: depender de Background Sync (descartada: comportamento variável); notificações push (fora de escopo).

## 9. Horário informado, janela de 7 dias e validade da posição

- **Decisão**: operações de origem offline levam `queued_at` (hora do aparelho, evidência auxiliar). Duas mudanças de servidor:
  1. `arrive_stop` e `register_delivery` passam a medir a validade da posição (hoje "lida há no máximo 10 minutos de **now()**") contra o **horário informado** do registro (`coalesce(p_arrived_at, p_queued_at, now())` na chegada e `p_delivered_at` na entrega), porque uma posição lida há 3 horas e sincronizada agora estaria correta. A regra de não estar no futuro continua.
  2. Quando há `queued_at`, um horário informado com **mais de 7 dias** de atraso vira conflito `STALE_OFFLINE_OPERATION`. Sem `queued_at` (uso online) as regras da Spec 008 e da Spec 009 **não mudam**.
- **Motivo**: RF-014 e RF-015. As funções já aceitam o horário informado; só a referência da posição estava presa a `now()` (confirmado em `20261013100100_field_position.sql`, linhas 84 e 188).
- **Alternativas**: ampliar a janela de 10 minutos para todos (descartada: enfraqueceria a regra online); ignorar a validade offline (descartada: perderia a proteção contra posição velha); usar a hora de recebimento para ordenar (descartada: a ordem é a da fila, e o relógio do aparelho nunca é autoridade).
- **Mantido**: a regra de 2 minutos da Spec 009 é do cliente e vale **no momento do registro** no aparelho.

## 10. Trilha de sincronização e resolução de conflitos

- **Decisão**: o servidor grava `private.trip_sync_events` (imutável) para cada operação vinda da fila, com resultado `applied`, `replayed`, `conflict`, `discarded` ou `resubmitted`, ator, hora de recebimento, hora informada, código do motivo e **nenhum dado sensível**. A operação nova `resolve_sync_conflict` (em `manage-trips`) registra a decisão de **descartar** (justificativa de 5 a 500 caracteres) ou **reenviar**, com permissão de operar viagens, evento e auditoria. O conflito em si fica no aparelho (`local_sync_conflicts`, com as duas versões); descartar exige conexão, para a decisão ser auditada no servidor **antes** de o item sair do aparelho.
- **Motivo**: RF-012, RF-013, CA-002; a Spec 002 já descarta com autorização e auditoria no cliente, mas sem registro de servidor para viagem.
- **Quem decide**: só quem está com o aparelho de origem (`trip.operate`); gestores e auditores veem a trilha, sem os dados do registro (clarificação de 12/10/2026).
- **Dado sensível do conflito**: o registro do conflito guarda só um resumo sem dado sensível; os dados originais ficam no item da fila que ele referencia e saem com ele (decisão da análise de 12/10/2026, para cumprir o RF-025).
- **Alternativas**: conflito guardado também no servidor (descartada: duplicaria dados sensíveis fora do aparelho); descarte offline (descartada: a decisão ficaria sem auditoria até o envio).
- **Códigos que viram conflito**: viagem em situação que não aceita mais a operação, item já conferido por outra pessoa, cilindro fora da viagem, viagem cancelada, versão divergente e `STALE_OFFLINE_OPERATION`. Falha de permissão (403) **não** é conflito: interrompe e pede nova entrada.

## 11. Fotos

- **Decisão**: captura por `<input type="file" accept="image/*" capture="environment">` (abre a câmera traseira no Android e o seletor nos demais), sem `getUserMedia` e sem dependência. A imagem é redimensionada (lado maior de até 1.600 px) e **recodificada em JPEG** por canvas, com qualidade reduzida em passos até 1,5 MB; a recodificação **remove EXIF e demais metadados** (inclusive localização). Até 3 fotos por entrega. Cada foto recebe um `attachment_id` (UUID) e um resumo SHA-256 no aparelho.
- **Motivo**: RF-018 e RF-019; zero dependências e funciona no PWA instalado. O envio de arquivo pequeno dispensa fragmentação: a "retomada" é reenviar o arquivo, e o `attachment_id` com o resumo torna isso idempotente.
- **Alternativas**: `getUserMedia` com vídeo ao vivo (descartada: mais código, permissão e consumo, sem ganho para foto de comprovação); biblioteca de compressão (descartada: dependência); envio em partes (descartada: arquivo de até 1,5 MB).
- **Impacto em contrato da Spec 009**: `tests/contract/field-no-camera-frames-sent.test.ts` proíbe `canvas.toBlob`, `FileReader`, `fetch` com imagem etc. em `src/infrastructure/field/` e `src/pages/field/`. A foto de comprovação **é** enviada de propósito, então o código novo fica em `src/infrastructure/attachments/` e o contrato é **delimitado**, não enfraquecido: a leitura de identificadores continua proibida de gerar ou enviar imagem; o contrato novo garante que só `attachments/` envia imagem e que o JPEG gerado não traz EXIF.

## 12. Assinatura

- **Decisão**: um canvas com eventos de ponteiro (dedo, caneta e mouse) desenha o traço; "Limpar" refaz; assinatura sem traço não vale (conta de pixels desenhados); a imagem sai em PNG de até 200 KB, em fundo branco. A assinatura é **opcional**, e a tela explica que a entrega vale sem ela.
- **Motivo**: RF-020; sem dependência. Por ser gesto, **não** é exigida: quem usa só teclado ou tecnologia assistiva conclui a entrega sem ela (a spec não torna o gesto obrigatório).
- **Alternativas**: biblioteca de assinatura (descartada: dependência); assinatura digitada (descartada: não é assinatura de quem recebe).

## 13. Armazenamento dos anexos no servidor

- **Decisão**: bucket privado `trip-evidence` (limite de 2 MB por objeto, tipos `image/jpeg` e `image/png`), caminho canônico `<organization_id>/<trip_id>/<delivery_id>/<attachment_id>.<ext>`, tabela `public.trip_delivery_attachments` imutável e sem exclusão. **Sem política de escrita para o cliente**: o upload passa pela Edge Function `trip-attachments`, que autentica, confere a sessão, a permissão (conferir carga, a mesma do registro de entrega), a entrega existente e do mesmo tenant, os **bytes reais** (assinatura de arquivo, não o tipo informado), o limite de 3 fotos e 1 assinatura por entrega, e a idempotência por `attachment_id` com o resumo SHA-256. Leitura: `get_attachment_url` confere a permissão (foto: ver viagens; assinatura: ver o recebedor) e devolve uma **URL assinada de vida curta** (60 segundos).
- **Motivo**: segue o padrão já aprovado do avatar (Spec 002: bucket privado, escrita só pela função servidor, validação pelos bytes). RF-022 e RN-006.
- **Alternativas**: upload direto do cliente ao Storage com política (descartada: o cliente poderia gravar caminho ou tipo arbitrário); guardar em coluna `bytea` (descartada: peso no banco e nas consultas); URL pública (descartada: dado pessoal).

## 13a. Anexos depois do registro da entrega

- **Decisão**: `trip-attachments` aceita anexos para uma entrega já registrada enquanto a viagem está `in_progress` ou `completed` há até 7 dias; viagem cancelada ou fora do prazo devolve `ATTACHMENT_WINDOW_CLOSED`. O registro da entrega **não** é alterado (imutável); o anexo posterior é uma linha nova com evento `evidence_attached` e marca `added_later` quando chega depois do primeiro anexo ou depois de a entrega fechar a parada. `get_trip_offline` devolve os identificadores das entregas já registradas, para o anexo posterior funcionar offline.
- **Motivo**: clarificação de 12/10/2026; cobre o esquecimento comum no campo sem exigir uma correção de entrega.
- **Alternativas**: só na hora do registro (descartada: força a correção da Spec 008 por um esquecimento simples); sem prazo (descartada: abriria evidência de viagem antiga indefinidamente).

## 14. Evento, auditoria e privacidade dos anexos

- **Decisão**: a entrega, o evento de viagem e a auditoria mostram só **a quantidade de fotos e se houve assinatura**, nunca caminho, nome do arquivo ou conteúdo. O histórico da viagem acrescenta "fotos anexadas" e "assinatura anexada" com a contagem. O anexo repetido (mesmo `attachment_id` e resumo) devolve o mesmo resultado sem criar outro registro nem outro evento.
- **Motivo**: RF-023 e CA-004; mesma política do nome do recebedor (Spec 008).

## 15. Estado e indicador na interface

- **Decisão**: a barra superior ganha um indicador discreto ("3 pendentes", "Enviando…", "1 conflito") que abre a tela **Sincronização** (`/sincronizacao`), sem entrada nova no menu e sem ocupar o corpo (decisão visual da Spec 005). A tela lista os itens por viagem, com estado em texto, hora, a ação "Enviar agora" e, nos conflitos, o comparativo e as decisões. O estado de conexão já existente continua na barra.
- **Motivo**: RF-004 e RF-030.
- **Alternativas**: item de menu (descartada: a decisão da Spec 005 evita menu por funcionalidade de apoio); aviso no corpo de cada tela (descartada: ocupa o corpo).

## 16. Instalação em Android por HTTPS

- **Decisão**: a história 5 valida a instalação numa **URL HTTPS real**. O diagnóstico da Spec 009 mostrou que o app instala no computador, mas não no Android por `localhost` via `adb reverse`, e que o `npm run dev:rede` (certificado autoassinado) não permite instalar. A confirmação precisa de um endereço HTTPS com certificado confiável: o ambiente de homologação (a decidir, `docs/publicacao-em-nuvem.md`) ou, só para o teste, um túnel HTTPS temporário. O plano **não bloqueia** a fila por isso: a fila é validada pelos testes e em aparelho pelo navegador; a instalação fica com a pendência explícita se o endereço não existir.
- **Motivo**: RF-028 e MS-007; a decisão de publicação depende da pessoa responsável.
- **Alternativas**: certificado local confiável instalado no celular (descartada: não representa o ambiente real); considerar o Capacitor (fora de escopo; o PRD o cita para o aplicativo nativo).

## 17. Testes que dependem do relógio e do servidor

- **Decisão**: a janela de 7 dias, a validade da posição e as comparações de data nos novos testes pgTAP usam **datas explícitas** e a data de São Paulo, não `current_date` em UTC. O defeito dos testes da Spec 008 por `current_date` (reprovam entre 00:00 e 03:00 UTC) **não** é replicado, e a correção dos antigos fica como tarefa própria, fora do escopo funcional.
- **Motivo**: o CI da Spec 009 reprovou por esse motivo; a nova spec lida com horários e não pode herdar a fragilidade.

## 18. Sessão local offline

- **Decisão**: sem conexão, a sessão local vale até **8 horas desde a última confirmação do servidor** (`session-status` com sucesso); a regra de 30 minutos de inatividade da Spec 002 não bloqueia o registro offline. Ao voltar a conexão, o aplicativo confirma a sessão no servidor **antes** de enviar (gate `session` do coordenador); sessão expirada ou revogada interrompe o envio (401 ou 403), pede nova entrada da mesma conta e mantém a fila. Passado o teto, a tela bloqueia novas operações e mostra só a contagem de pendentes.
- **Motivo**: clarificação de 12/10/2026. A inatividade de 30 minutos existe para proteger aparelho sem dono; offline ela impediria registrar a entrega depois de uma espera sem sinal, e a pessoa não consegue entrar de novo sem o servidor. O teto de 8 horas continua protegendo aparelho perdido, e a autorização real é conferida no envio.
- **Alternativas**: seguir a Spec 002 à risca (descartada: inviabiliza o uso offline); teto de 24 horas (descartada: dobra a exposição de um aparelho perdido); sem expiração local (descartada).
- **Cuidado**: a hora do aparelho mede o teto de 8 horas; relógio adiantado só encurta o prazo, e relógio atrasado é limitado pelo servidor, que reavalia a sessão no envio.

## 19a. Abrir o aplicativo sem conexão (lacuna achada na implementação)

- **Achado**: hoje o aplicativo **não abre autenticado sem servidor**. A Spec 002 decidiu que a sessão só é restaurada se confirmada pelo servidor ("sem servidor alcançável nenhum acesso é concedido", `AuthProvider`), o contexto do tenant só se resolve com a lista de vínculos do servidor (`TenantContextService.load`), as permissões só valem depois da confirmação do servidor (o cache é só da aba, `PermissionsProvider`) e o `SyncGate` exige sessão, tenant e consistência confirmados antes de liberar a área protegida. Resultado: com o celular sem sinal e o aplicativo fechado, ao abrir a pessoa cai na tela de entrada e **não alcança a viagem guardada nem a fila**. Isso quebra o cenário 3 da US1 (a fila sobrevive a fechar e abrir) e os cenários 2 e 3 da US5 (abrir o aplicativo instalado sem conexão).
- **Decisão (13/10/2026, opção A, confirmada pela pessoa responsável)**: um **acesso offline restrito**, que respeita o teto de 8 horas da decisão 18 e não relaxa nada online:
  1. **Registro de acesso offline** (`offline-access`), em uma base IndexedDB própria e pequena (a base `fluxid-local` só abre desbloqueada por tenant): conta, organização ativa, destino, nível de autenticação, **códigos de permissão** do tenant, nome de exibição e o instante da última confirmação da sessão pelo servidor. **Sem token e sem dado de domínio.** Gravado a cada confirmação online (no máximo uma vez por minuto) e apagado no logout, na expiração ou na revogação.
  2. **Restauração**: se o servidor está inalcançável na abertura e existe um registro com menos de 8 horas, a sessão volta como `authenticated` com a marca `offline`; senão, entrada normal. A marca `offline` some assim que o servidor confirmar a sessão de novo.
  3. **Contexto degradado**: tenant, permissões e base local vêm do registro (a base local desbloqueia só a organização do registro); o `SyncGate` não bloqueia (não há o que sincronizar sem rede); o menu mostra o que as permissões do registro permitem, e as telas que dependem do servidor mostram o estado offline que já existe.
  4. **Volta da conexão**: o aplicativo reconfirma a sessão e o tenant no servidor **antes** de enviar a fila; sessão expirada ou revogada limpa o registro, pede nova entrada e **mantém a fila** (RF-016).
- **Risco**: é a única parte desta spec que muda o desenho de autenticação da Spec 002. Aparelho perdido com sessão offline vale por até 8 horas desde a última confirmação, com as permissões da última confirmação. Mitigações: teto de 8 horas, registro sem token, nenhuma escrita aceita pelo servidor sem sessão válida, e o envio só depois da reconfirmação.
- **Alternativa mais simples (menos entrega)**: manter a abertura **online obrigatória** e só permitir operar offline com o aplicativo **já aberto** (a fila e a viagem guardada continuam). A US5 deixaria de provar "abrir instalado sem conexão" e o cenário 3 da US1 valeria só para o aplicativo já aberto (fechar a aba e abrir sem sinal cairia na entrada, com a fila intacta no aparelho).

## 19. Riscos aceitos

- **Dado sensível no aparelho sem cifra** até o envio (decisão 5). Mitigação: mínimo necessário, remoção ao confirmar, aviso antes de sair da conta, destaque de itens antigos.
- **Evidência declarada, não provada** (RN-005): foto e assinatura são guardadas e protegidas, sem afirmação de autenticidade.
- **Envio só com o aplicativo aberto** (decisão 8): item pode esperar até a próxima abertura.
- **Instalação em Android** depende de endereço HTTPS que a spec não provê.
