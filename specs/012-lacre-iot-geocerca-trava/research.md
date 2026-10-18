# Pesquisa: Lacre IoT — posição em tempo real, geocerca e trava do cilindro

**Feature**: `012-lacre-iot-geocerca-trava` | **Data**: 17/10/2026 | **Spec**: [spec.md](./spec.md)

Cada item registra a decisão, o motivo e as alternativas descartadas. Não restou nenhum "NEEDS CLARIFICATION" no contexto técnico; os pontos que dependem do hardware estão em "Riscos" do [plan.md](./plan.md).

## 1. Onde mora o endpoint do lacre

- **Decisão**: uma Edge Function nova, `seal-gateway`, no mesmo projeto Supabase de teste, com `verify_jwt = false` (o lacre não tem sessão do Auth) e autenticação própria por dispositivo. A borda só confere o formato, calcula o hash da chave e chama **uma** RPC `security definer`, `seal_ingest`, que faz tudo numa transação: autenticação, limite de envios, deduplicação, posições, saúde, geocerca, comandos e alertas.
- **Estrutura**: a `seal_ingest` só autentica, aplica os limites, deduplica, ordena e repassa cada mensagem a um tratador em `private` (`seal_handle_position`, `seal_handle_event`, `seal_handle_alert`, `seal_handle_command_result`, `seal_handle_activation`, `seal_handle_shutdown`, `seal_handle_network_change`, `seal_handle_auto_lock`). No fim, monta a resposta por `seal_build_response`. A Fundação cria versões vazias de todos os tratadores, e cada história substitui só os seus; a `seal_ingest` é criada uma única vez e nunca mais é recriada, para não repetir as RPCs de quatro versões da Spec 008.
- **Motivo**: decisão da spec (Clarifications 16/10); repete o padrão das Specs 006 a 010 (borda fina, regra no banco); uma transação por envio garante que a resposta ao lacre já leve o comando de travar criado pela violação daquele mesmo envio (RF-021).
- **Alternativas**: servidor Node da API do lacre (descartado pela spec: outro serviço publicado); PostgREST direto com a chave publicável (exporia a tabela e dependeria de RLS para um ator que não é usuário); uma função por tipo de mensagem como na API do lacre (multiplicaria as chamadas, contra o RNF-004).

## 2. Autenticação do dispositivo

- **Decisão**: o código do dispositivo (`device_code`, ex.: `DSP-7KQ2M9XT`) é gerado pelo sistema, aleatório e único em todo o FluxID; a chave tem 32 bytes aleatórios (`gen_random_bytes`), é mostrada uma única vez no formato `fxk_<base64url>` e o banco guarda só o SHA-256 dela. O lacre envia `X-Device-Id` e `X-Device-Key` em todo pedido, por HTTPS. A comparação é feita no banco pelo hash; qualquer falha (sem chave, chave errada, de outro dispositivo, dispositivo inativo ou inexistente) responde o mesmo `401 {"error":"unauthorized"}`.
- **Motivo**: chave de alta entropia não precisa de hash lento (não há dicionário a atacar); o hash simples cabe nos 3 s do RNF-002. A resposta única atende RF-002 e CA-006. Código aleatório evita adivinhar dispositivos de outra organização.
- **Alternativas**: bcrypt ou argon2 (custo de CPU sem ganho para chave aleatória); JWT por dispositivo (exigiria relógio e renovação no lacre); chave escolhida pelo administrador, como na API do lacre (chaves fracas).

## 3. Limites de envio e de chaves erradas (RF-006)

- **Decisão**: janela fixa por minuto em `private.seal_rate_windows`: até **6 pedidos por dispositivo por minuto** (o normal é 1; sobra folga para reenvio e lote). Acima disso, `429` com `Retry-After` e um alerta "envio acima do limite" uma vez por hora. Chaves erradas: por **hash do endereço de origem** (`x-forwarded-for`), 10 falhas em 10 minutos bloqueiam aquele endereço por 15 minutos com o mesmo `429`, sem revelar se o dispositivo existe. O lacre trata `429` como "sem resposta" e mantém as leituras na fila, então nada se perde (os `message_id` não mudam).
- **Motivo**: o limite protege a cota do plano gratuito (RNF-004) e o banco; o endereço é guardado só como hash, sem dado pessoal.
- **Alternativas**: limite no gateway da plataforma (não configurável no plano gratuito); token bucket em memória da função (as instâncias não compartilham estado).

## 4. Deduplicação das mensagens e das posições

- **Decisão**: `seal_messages` tem `unique (device_id, message_id)`; a mensagem repetida responde `duplicate` e devolve de novo o comando pendente (RF-003). A posição nova é comparada com a **última posição guardada** daquele dispositivo com horário de leitura anterior ou igual (`ST_Distance` em `geography`): até **20 m**, com a mesma qualidade e o mesmo estado do lacre, só atualiza `last_seen_at`, bateria e sinal (RF-009, RN-009). A "última posição" do cilindro é a de maior `read_at`, nunca a última que chegou (RF-010).
- **Motivo**: MS-002 (1 posição em 24 h parado, e não 1.440); a comparação com a última guardada evita a deriva lenta descrita nos casos de borda.
- **Alternativas**: comparar com a última recebida (a oscilação acumularia sem criar ponto); agrupar por célula de grade (bordas arbitrárias).

## 5. Leituras atrasadas (lote da fila do lacre)

- **Decisão**: o lote vem ordenado pelo lacre, mas o banco reordena por `read_at`. Cada leitura é gravada e, se for mais antiga que a última avaliada (`seal_devices.last_read_at`), entra no histórico **sem** reavaliar a saúde nem a geocerca. A violação só é avaliada para leituras novas, e o comando de travar por violação só sai se a leitura mais nova do lote ainda estiver fora (caso de borda).
- **Motivo**: dado velho não decide nada, como pede a spec.
- **Alternativas**: descartar leituras antigas (perderia o histórico da viagem).

## 6. Verificação automática (saúde e prazos)

- **Decisão**: `pg_cron` agenda `private.run_seal_watchdog()` **a cada minuto**, em SQL puro (sem chamada HTTP e sem custo de invocação). Ela: marca "sem comunicação" depois de um intervalo mais 30 s sem contato (90 s no padrão, RF-014); marca "sem GPS" depois de três intervalos só sem GPS (RF-015); expira comandos entregues e não confirmados em 10 min; abre o alerta de comando de trava não entregue em 30 min e expira o comando de rede não entregue em 30 min, apagando a senha (RF-028, RF-034c); suspende a vigilância quando a unidade fica sem geocerca ativa. Tudo idempotente: o alerta aberto tem índice único parcial por dispositivo e tipo. A migration cria a extensão com o mesmo `begin … exception` da `identity_retention` (se faltar `pg_cron`, avisa e a plataforma agenda).
- **Motivo**: CA-007 e RNF-003 sem ação humana e sem consumir invocações de função.
- **Alternativas**: Edge Function agendada (gastaria 43 mil invocações por mês só para isso); conferir só quando alguém abre a tela (não atende a spec); `pg_cron` a cada 30 s (possível, mas a spec fixa 1 min; fica como ajuste se a validação pedir).

## 7. Tempo real na tela (RNF-001)

- **Decisão**: **Supabase Realtime Broadcast em canal privado** por organização (`seals:<organization_id>`). Gatilhos do banco chamam `realtime.send` com um aviso mínimo (`kind`, `device_id`, `cylinder_id`, sem coordenada); a tela recebe o aviso e busca os dados pela função de consulta, como sempre. A política de leitura de `realtime.messages` só aceita o tópico da organização em que a pessoa tem `seal.read` (`private.actor_has_permission`). Sem conexão Realtime, a tela consulta a cada 30 s e mostra o horário da última atualização.
- **Motivo**: as tabelas continuam sem política de leitura para `authenticated` (padrão do projeto: toda leitura por RPC), então `postgres_changes` não serve; o aviso sem dado mantém a decisão de acesso no banco (RF-037, CA-001). O aviso só sai quando algo muda (posição nova, saúde, comando, alerta), não a cada "visto por último", o que segura a cota de mensagens; a idade em texto ("há 2 minutos") é calculada na tela.
- **Alternativas**: `postgres_changes` (exigiria política de leitura direta nas tabelas); consulta a cada 5 s (gasto e atraso); Server-Sent Events numa função (as funções têm tempo máximo).

## 8. Notificações push do PWA (RF-036a a RF-036d)

- **Decisão**: **Web Push com VAPID**. A chave pública VAPID vai em `VITE_VAPID_PUBLIC_KEY` (é pública); a privada fica só nos segredos da função `seal-push`. O service worker continua gerado pelo `vite-plugin-pwa` (`generateSW`) e ganha `workbox.importScripts: ['push-sw.js']`, um arquivo em `public/` que trata `push` e `notificationclick` (abre `/alertas/<id>`). As inscrições ficam em `push_subscriptions` (por pessoa, organização e aparelho). Ao abrir um alerta que exige notificação, o banco grava uma linha em `push_outbox` por inscrição válida (só de quem tem `seal.read` naquela organização no momento). Um gatilho de comando em `push_outbox` chama a função `seal-push` por `pg_net`, com um segredo guardado no Vault; a função busca o lote, envia com a biblioteca `jsr:@negrel/webpush` (Web Crypto, feita para Deno) e marca enviado, falho ou inscrição revogada (`404`/`410`). O `run_seal_watchdog` reenvia o que ficou pendente. O texto da notificação tem tipo, código do cilindro e horário, sem coordenada nem cliente (RF-036c, CA-010).
- **Motivo**: RNF-001a (até 30 s) sem gastar invocação quando não há alerta; nenhuma credencial privada no cliente (RF-040).
- **Alternativas**: biblioteca `web-push` do npm (depende de APIs do Node; fica como plano B se a do Deno falhar no teste da tarefa de fundação); trocar o service worker para `injectManifest` (mudaria a Spec 010 sem necessidade); Firebase Cloud Messaging (outro serviço e outra conta).
- **Prova (T006, 18/10/2026)**: `jsr:@negrel/webpush@0.5.0` rodou no runtime de funções do Supabase local: assinatura VAPID (`Authorization: vapid t=…`), corpo `aes128gcm` e mensagem decifrada corretamente por um receptor de teste (RFC 8291). Versão fixada em `0.5.0`; o plano B `npm:web-push` não foi necessário. A entrega num navegador real é conferida na validação.
- **iPhone**: Web Push só com o app instalado na tela de início (iOS 16.4+); a tela explica (caso de borda da spec).

## 9. Comandos do lacre

- **Decisão**: uma tabela `seal_commands` para trava (`lock`, `unlock`) e rede (`wifi_add`, `wifi_remove`, `wifi_reset`), com estados `pending`, `delivered`, `confirmed`, `failed`, `cancelled`, `expired` e o histórico em `seal_command_events`. A resposta leva **no máximo um comando**, o mais antigo pendente, e o de trava tem prioridade sobre o de rede. Um comando novo de trava cancela o de trava ainda pendente (RF-029); um de rede para a mesma rede cancela o anterior. O comando entregue volta na resposta até ser confirmado (o lacre pode não ter recebido a resposta), sempre com o mesmo `id`, e a confirmação repetida é idempotente. Prazos e alertas como no item 6.
- **Motivo**: estados explícitos (princípio IV, RF-026); só `executed` muda a trava (RN-001, CA-002).
- **Alternativas**: comandos em lista na resposta (mais complexo no firmware e na ordem da troca de rede); fila separada por tipo (duas fontes de verdade).

## 10. Senha da rede Wi-Fi

- **Decisão**: a senha vai do navegador para `manage-seals` por HTTPS, a RPC a guarda no **Supabase Vault** (`vault.create_secret`) e o comando guarda só o `secret_id`. Ela sai do Vault apenas para montar a resposta ao próprio lacre e é apagada (`delete from vault.secrets`) quando o comando termina de qualquer jeito. A borda e os manipuladores nunca registram corpo nem resposta, e um teste de contrato procura a senha em logs, auditoria e eventos (CA-008).
- **Motivo**: RF-034c e RF-040; o Vault cifra em repouso e já vem no Supabase local e em nuvem.
- **Alternativas**: coluna cifrada com `pgcrypto` e chave em segredo da função (mais código para o mesmo resultado); mandar a senha sem guardar (o lacre só a recebe no próximo envio).

## 11. Integração com as viagens da Spec 008

- **Decisão**: **gatilhos `after`** nas tabelas da Spec 008, sem reescrever as RPCs dela, que já foram substituídas várias vezes:
  - `trips` → `in_progress`: um comando `lock` com origem `trip_start` por item em trânsito cujo cilindro tem vínculo ativo; `trip_items.seal_command_id` guarda a referência (RF-023). Os cilindros sem lacre ficam "sem lacre". A repetição do início não chega aqui (a RPC já é idempotente) e há índice único por item e origem.
  - `trip_deliveries` (inserção, inclusive correção): para cada cilindro entregue com lacre, procura a prova de posição (a do lacre com GPS lida nos 2 minutos anteriores à entrega; senão a do celular com origem `gps`) e usa `private.point_inside_site_geofence` da Spec 008. Dentro: comando `unlock` com origem `delivery`, cancela o `lock` pendente e registra o desbloqueio lógico da Spec 008 na mesma transação. Fora ou sem prova: nada, e o motivo fica gravado para a tela (RF-024). Começa a vigilância da geocerca (RN-004). Correção para "não entregue": `lock` com origem `delivery_correction`.
  - `trips` → `cancelled` e itens `returned`: `unlock` com origem `trip_cancel` para os cilindros que voltam ao estoque.
  - `cylinders` inativado: encerra o vínculo.
  - Nova viagem com o cilindro, ou entrada no estoque: encerra a vigilância (RN-004).
- **Motivo**: o mesmo commit da Spec 008 continua valendo; a trava fica numa transação com o fato que a causou e não depende da tela.
- **Alternativas**: alterar `start_trip` e `register_delivery` (risco de regressão em funções com quatro versões); fazer na Edge Function (perderia a atomicidade).

## 12. Vigilância da geocerca e trava pelo próprio lacre (RN-011)

- **Decisão**: `seal_watches` registra a vigilância (cilindro, unidade, início, fim, motivo). Toda resposta ao lacre leva `watch: { active, version }` e, quando a versão mudou desde a que o lacre informou (`watch_version` no pedido), também as geocercas ativas da unidade: círculos (centro e raio) e polígonos (até 100 vértices, o limite da Spec 007). O firmware guarda isso na memória flash. Sem resposta por 3 envios seguidos, ele compara as próprias posições com GPS com essas geocercas e só trava com duas posições seguidas fora, além de 50 m; ao voltar, envia `auto_lock` com o horário. O FluxID registra `locked_comm_loss`, abre o alerta alto e processa as leituras guardadas pela regra de violação, sem criar outro comando.
- **Motivo**: Clarifications de 17/10 (a queda do Wi-Fi do cliente não trava nada).
- **Alternativas**: o lacre travar só pelo tempo (descartado no esclarecimento); mandar a geocerca em toda resposta (gasta dados à toa).

## 13. Estado da trava física

- **Decisão**: `seal_devices.lock_state` (`none`, `locked`, `unlocked`, `unconfirmed`, `locked_violation`, `locked_comm_loss`), independente do `trip_items.lock_status` lógico da Spec 008 e da situação do cilindro (RF-030). Só a confirmação `executed` ou o aviso `auto_lock` mudam o valor; erro e expiração levam a `unconfirmed`. O valor do cilindro na tela vem do dispositivo do vínculo ativo; sem vínculo, "sem lacre".
- **Motivo**: a trava é do equipamento preso ao cilindro; o vínculo liga os dois.
- **Alternativas**: coluna em `cylinders` (o estado ficaria errado ao trocar o lacre).

## 14. Permissões e papéis (RF-038)

- **Decisão**: três permissões novas, `seal.read` (ver lacres, posições, comandos e alertas, e receber notificações), `seal.operate` (vincular e desvincular, pedir comando, reconhecer e encerrar alerta) e `seal.admin` (cadastrar, editar, desativar e trocar a chave do dispositivo e alterar as redes). Papéis padrão: `tenant_admin` todas; `logistics_manager` `seal.read` e `seal.operate`; `stock_operator` `seal.read` e `seal.operate` (vincula o lacre antes da carga); `tenant_auditor` `seal.read`. O destravamento fora da regra de entrega ou depois de violação exige `seal.operate`, justificativa de 5 a 500 caracteres e sessão `aal2` (RN-005), como o desbloqueio excepcional da Spec 008. `seal.admin` é crítica.
- **Motivo**: segue a spec sem inventar outra permissão; o segundo fator protege a exceção.
- **Alternativas**: uma permissão `seal.bind` só para o operador (mais fina, mas fora do que a spec pede; fica anotada como possível ajuste da validação).

## 15. Biblioteca de domínio no cliente

- **Decisão**: `src/domain/seals/` com regras puras e testadas: vocabulário de saúde, trava, comando e alerta (texto e ícone, nunca só cor, RF-042); idade da posição em texto; o que cada pessoa pode fazer na tela; motivo de comando desabilitado offline (RF-043). As regras de negócio que decidem (20 m, geocerca, prazos) ficam no banco; o cliente só apresenta.
- **Motivo**: AGENTS.md (domínio fora dos componentes); uma fonte de verdade para regra que muda dado.
- **Alternativas**: repetir a regra dos 20 m no cliente (duas fontes de verdade).

## 16. Firmware do ESP32-C3

- **Decisão**: pasta `firmware/` com PlatformIO, a partir de `simaoBastos/fluxid-firmware`, sem o SIM800L e sem TinyGSM:
  - ambientes `esp32c3` (placa `esp32-c3-devkitm-1`, compatível com a Super Mini) e `native` (testes no computador com Unity);
  - **HTTPS** com `WiFiClientSecure` e o pacote de certificados raiz embutido (`setCACertBundle`), sem `setInsecure`; hora por SNTP antes da primeira chamada (a conferência do certificado precisa de relógio);
  - redes: a padrão em `include/secrets.h` (fora do git, com `secrets.example.h` versionado) e a lista de até 5 na NVS (`Preferences`); escolha pela de sinal mais forte entre as conhecidas, com volta à padrão (RF-034e); a troca testa a rede nova antes de guardar (RF-034d);
  - fila de leituras no LittleFS, reenviada em lotes de até 50 com os mesmos `message_id`;
  - trava por solenoide atrás de uma interface `Trava`, com acionador por pulso (solenoide biestável, sem gastar energia para segurar) e confirmação só depois do acionamento;
  - vigilância local (círculo e polígono, distância por haversine) e regra da trava por perda de comunicação;
  - módulos puros (fila, escolha de rede, vigilância, protocolo JSON com ArduinoJson) testados em `native`; o CI roda `pio test -e native` e `pio run -e esp32c3`.
- **Motivo**: Clarifications de 17/10 (firmware nesta spec, Wi-Fi, segredos fora do git, testes nativos e build no CI, CA-012).
- **Alternativas**: ESP-IDF puro (reescrita maior que o projeto atual); TLS sem conferir o certificado (inseguro).
- **Limite conhecido**: sem a cifragem da flash do ESP32, as senhas das redes ficam legíveis por quem tiver o lacre em mãos e um gravador. Fica registrado como risco de protótipo; a cifragem da flash é da Fase 8 (hardware homologado).

## 17. Contrato único das mensagens

- **Decisão**: exemplos canônicos de cada pedido e resposta em `tests/fixtures/seal-protocol/*.json`, usados pelos testes de contrato da borda, pelo simulador e pelos testes nativos do firmware (CA-011). O esquema da borda (`_shared/seal-protocol.ts`) valida os mesmos exemplos.
- **Motivo**: o firmware, o simulador e o FluxID não podem divergir sem um teste quebrar.
- **Alternativas**: documentação só em texto (diverge sem aviso).

## 18. Simulador de lacre

- **Decisão**: `tests/support/seal-simulator.ts` (biblioteca usada pela suíte `.live` e pelo E2E) e `scripts/lacre/simulador.mjs` (linha de comando para demonstração e validação manual), com cenários prontos: parado, em movimento, saída da geocerca, sem GPS, sem rede, desligamento, lote atrasado, erro de trava e troca de rede com falha. Inspirado no simulador da API do lacre, que não é publicada.
- **Motivo**: CA-011, Histórias 1 a 7 testáveis sem o lacre físico.
- **Alternativas**: depender do lacre físico para os testes automatizados (frágil e lento).

## 19. Custo no plano gratuito (RNF-004)

- **Decisão**: uma invocação por lacre por minuto (43.200 por mês). A verificação automática roda no banco, e o `seal-push` só é chamado quando há notificação, então 10 lacres ficam em torno de 432 mil das 500 mil invocações mensais do plano gratuito. Os avisos Realtime saem só quando algo muda. A validação registra o consumo real no painel.
- **Alternativas**: intervalo maior (decisão do produto é 1 minuto).

## 20. Padrão visual e mapa

- **Decisão**: reaproveitar `src/components/maps` (Leaflet com OpenStreetMap, carregado sob demanda), com a lista de posições como alternativa em texto (RF-042); telas novas com a skill `ui-ux-pro-max` e o padrão da Spec 005; a página de alertas troca a fonte de exemplo pela real, mantendo os componentes `SeverityBadge` e `NewBadge` da Visão geral.
- **Motivo**: RNF-005 e RNF-006; nenhuma dependência nova no cliente.
