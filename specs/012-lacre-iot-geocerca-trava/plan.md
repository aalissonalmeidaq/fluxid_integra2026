# Plano de implementação: Lacre IoT — posição em tempo real, geocerca e trava do cilindro

**Feature**: `012-lacre-iot-geocerca-trava` | **Data**: 17/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/012-lacre-iot-geocerca-trava/spec.md` (sessões de 16 e 17/10/2026: endpoint no próprio FluxID, Wi-Fi no lugar do GSM, envio a cada minuto, vigilância só depois da entrega, trava pelo próprio lacre só fora da geocerca, push do PWA, firmware dentro desta spec)

## Resumo

Ligar o **lacre físico** ao FluxID (Fase 6 do PRD). O lacre ESP32-C3 chama, a cada minuto e por Wi-Fi, um endpoint do próprio FluxID, envia posição, bateria, estado e rede, e recebe na mesma resposta o comando pendente (travar, destravar ou trocar rede) e a geocerca a vigiar. O FluxID guarda cada posição uma vez (repetição a até 20 m só atualiza o horário), calcula sozinho a saúde de cada lacre, trava no início da viagem, destrava na entrega comprovada dentro da geocerca, trava e alerta na saída da geocerca e avisa por notificação do PWA o possível extravio. Ao fim, existe na pasta `firmware/` o firmware que faz isso no lacre real.

A abordagem repete o que as Specs 006 a 010 provaram e acrescenta seis peças novas:

- **Servidor (padrão herdado)**: tabelas com `organization_id`, RLS sem política para `authenticated`, toda leitura e escrita por RPC `security definer` com evento e auditoria na mesma transação, `request_id` nos comandos da tela, versão otimista, sem exclusão. Duas Edge Functions no molde de `query-trips` e `manage-trips`: `query-seals` e `manage-seals`.
- **Peça nova 1, endpoint do dispositivo**: `seal-gateway`, sem JWT, com chave por dispositivo (SHA-256 de 32 bytes aleatórios), resposta de autenticação única, limite por dispositivo e por endereço, e **uma RPC transacional** (`seal_ingest`) que deduplica, grava, avalia saúde e geocerca e devolve o comando na mesma resposta ([research.md](./research.md), itens 1 a 5).
- **Peça nova 2, verificação automática**: `pg_cron` a cada minuto rodando `private.run_seal_watchdog()` em SQL puro: saúde, prazos de comando, alerta de comando não entregue e senha apagada (item 6).
- **Peça nova 3, tempo real**: aviso Realtime Broadcast sem dado, em canal privado por organização, autorizado por `seal.read`; a tela busca pelo `query-seals`; consulta a cada 30 s se o canal cair (item 7).
- **Peça nova 4, notificação push**: Web Push com VAPID, inscrições por aparelho, fila `push_outbox` e função `seal-push` acionada por `pg_net` só quando há alerta; `push-sw.js` importado pelo service worker gerado (item 8).
- **Peça nova 5, integração com as viagens por gatilho**: início da viagem, entrega, correção, cancelamento, retorno ao estoque e inativação do cilindro disparam comandos e vigilância na mesma transação, sem reescrever as RPCs da Spec 008 (item 11).
- **Peça nova 6, firmware**: PlatformIO com ambientes `esp32c3` e `native`, HTTPS com conferência de certificado, redes Wi-Fi com reserva fixa, fila de leituras, solenoide, vigilância local; contrato JSON único compartilhado com o simulador e os testes da borda (itens 16 a 18).
- **Cliente (padrão herdado)**: `domain/seals` (regras puras de apresentação), `application/seals` (serviço, tempo real, inscrição push), `pages/seals` (`React.lazy`), blocos novos no detalhe do cilindro e da viagem e a página de alertas com dados reais; padrão visual da Spec 005 com a skill `ui-ux-pro-max`.

Fica de fora, por decisão da spec: proximidade lacre × celular, rastreamento do veículo, relatórios e e-mail (Fase 7); homologação do hardware e cifragem da flash (Fase 8); retenção das posições (spec de privacidade); publicação da API do lacre.

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; Tailwind CSS 4.3.3; SQL (PostgreSQL 17 do Supabase, PostGIS já habilitado) e Edge Functions em Deno; firmware em C++ (Arduino-ESP32 sobre PlatformIO, ESP32-C3)

**Dependências principais**: no cliente, **nenhuma nova** (`@supabase/supabase-js` já traz o Realtime; Leaflet já existe). No servidor, `jsr:@negrel/webpush` na função `seal-push` (plano B: `npm:web-push`, item 8). No banco, as extensões `pg_cron`, `pg_net` e `supabase_vault`, disponíveis no Supabase local e em nuvem. No firmware, `TinyGPSPlus` e `ArduinoJson` (já usadas), `WiFiClientSecure`, `Preferences` e `LittleFS` (do núcleo); saem `TinyGSM` e `ArduinoHttpClient`

**Armazenamento**: 12 tabelas novas em `public` (`seal_devices`, `seal_device_events`, `seal_bindings`, `seal_messages`, `seal_positions`, `seal_commands`, `seal_command_events`, `seal_watches`, `seal_violations`, `seal_alerts`, `push_subscriptions`, `push_outbox`) e 3 em `private` (`seal_rate_windows`, `seal_auth_failures`, `seal_requests`); 1 coluna nova em `trip_items`; senha de rede temporária no Vault. Detalhe em [data-model.md](./data-model.md)

**Testes**: pgTAP em `supabase/tests/012_*.test.sql` (RLS com dois tenants, autenticação do dispositivo, deduplicação, comandos, geocerca, verificação automática, push, auditoria); Vitest para domínio, serviço, bordas e telas; testes de contrato com os exemplos de `tests/fixtures/seal-protocol/`; suíte `.live` com o simulador; E2E em 360, 768 e 1920 px com backend simulado; capturas visuais no Linux; `pio test -e native` e `pio run -e esp32c3` no firmware. Lista completa em [contracts/verificacoes-automaticas.md](./contracts/verificacoes-automaticas.md)

**Plataforma alvo**: navegadores modernos, PWA de 360 px a desktop amplo; Supabase de teste em nuvem e local; lacre ESP32-C3 Super Mini com GPS, solenoide e Wi-Fi 2,4 GHz

**Tipo de projeto**: aplicação web cliente única + migrations e Edge Functions do Supabase + firmware embarcado

**Metas de desempenho**: posição na tela em até 10 s (RNF-001); notificação em até 30 s (RNF-001a); resposta ao lacre em até 3 s (RNF-002); falta de comunicação alertada em até 1 min depois do envio perdido (RNF-003)

**Restrições**: plano gratuito do Supabase (cerca de 10 lacres a 1 envio por minuto, RNF-004); WCAG 2.2 AA e só tokens (RNF-005); pacote de entrada até +5 % (RNF-006); nenhuma chave, senha ou credencial privilegiada no cliente, no repositório ou em log (RF-040); comandos de lacre nunca entram na fila offline (RF-043); nenhum comando físico presumido (princípio IV)

**Escala/escopo**: 15 tabelas, 3 permissões, 4 Edge Functions (`seal-gateway`, `seal-push`, `query-seals`, `manage-seals`), 8 tipos de mensagem do lacre, 25 operações de tela (10 de consulta e 15 de comando), 2 itens de menu, 4 rotas, 4 blocos em telas existentes, 14 migrations, 1 firmware com 2 ambientes

## Verificação da constituição

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | spec com duas sessões de esclarecimento, plano, pesquisa, contratos e tarefas antes do código | Aprovado |
| II TDD obrigatório | cada tarefa começa pelo teste: pgTAP para regras e RLS, Vitest para bordas e telas, contrato JSON compartilhado e testes nativos do firmware; comandos, multitenancy e autorização nascem testados | Aprovado |
| III Multitenancy e segurança | `organization_id` e RLS em toda tabela, organização do dispositivo pelo cadastro (RN-006), testes com dois tenants em tabelas, RPCs, Realtime e push; chave e senha só como hash ou no Vault; VAPID e `service_role` só no servidor; exceção com `aal2`, justificativa e auditoria; desativar dispositivo, gerar chave nova, desvincular e voltar à rede padrão também exigem justificativa | Aprovado |
| IV Estados explícitos | trava física, bloqueio lógico, saúde, comando, vigilância, violação e alerta são colunas independentes; só `executed` ou `auto_lock` mudam a trava; nenhum estado de saúde muda a situação do cilindro | Aprovado |
| V Experiência e acessibilidade | padrão da Spec 005, `ui-ux-pro-max`, WCAG 2.2 AA, 360 px a desktop, mapa com alternativa em texto, saúde com ícone e texto, estados de carregamento, vazio, erro, offline e tempo real | Aprovado |
| VI Rastreabilidade | branch `feat/012-lacre-iot-geocerca-trava`, issue #42 e PR, RIA ao fim do ciclo | Aprovado |
| VII Qualidade verificável | lint, tipagem, testes, cobertura, RLS, integração, E2E, acessibilidade, build PWA e build do firmware no CI | Aprovado |
| VIII Documentação viva | contratos desta pasta, `docs/publicacao-em-nuvem.md` (segredos VAPID e `pg_cron`), README do firmware e roteiro de validação | Aprovado |

Sem violações a justificar. Reavaliação depois do desenho (data-model e contratos): **mantida**. A única exceção à regra "o FluxID decide os comandos" (o lacre trava sozinho fora da geocerca sem comunicação) vem da spec (RN-011) e não fere o princípio IV, porque o FluxID só registra a trava quando o lacre a informa.

## Rastreabilidade

| Item | Valor |
|---|---|
| Issue | [#42 — Spec 012: lacre IoT, geocerca e trava](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/42) (constar na descrição do pull request e no RIA, princípio VI) |
| Branch | `feat/012-lacre-iot-geocerca-trava` |
| Pull request | a abrir ao fim do ciclo |
| RIA | gerado no gate de encerramento, depois da validação humana com Natã da Silva Baracho |

## Estrutura do projeto

### Documentação (esta feature)

```text
specs/012-lacre-iot-geocerca-trava/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── contracts/
    ├── mensagens-do-lacre.md
    ├── operacoes-servidor.md
    ├── permissoes-e-papeis.md
    ├── telas-e-rotas.md
    └── verificacoes-automaticas.md
```

### Código-fonte (raiz do repositório)

```text
supabase/
├── migrations/20261018xxxxxx_seals_*.sql   # 14 migrations: schema, permissões, ingestão, tempo real, leituras, verificação,
│                                           # alertas, push, comandos, trava na viagem, destravamento na entrega, vigilância,
│                                           # dispositivos e vínculo, redes Wi-Fi
├── functions/seal-gateway/                 # endpoint do lacre (verify_jwt = false)
├── functions/seal-push/                    # envio Web Push (verify_jwt = false, segredo do Vault)
├── functions/query-seals/                  # leitura da tela
├── functions/manage-seals/                 # comandos da tela
├── functions/_shared/seal-protocol.ts      # esquema das mensagens do lacre
├── config.toml                             # verify_jwt das duas funções internas
└── tests/012_*.test.sql                    # pgTAP
src/
├── domain/seals/                           # vocabulário, idade, habilidades, limites, motivos offline
├── application/seals/                      # serviço, tempo real, inscrição push
├── infrastructure/supabase/seal-adapter.ts # transporte das funções
├── infrastructure/push/                    # inscrição no navegador (PushManager)
├── domain/navigation/screens.ts            # itens "Lacres" e "Alertas"
├── pages/seals/                            # seals-area (React.lazy), lista, detalhe, modais
├── pages/alerts/                           # lista e detalhe reais (troca da fonte de exemplo)
├── pages/cylinders/, pages/trips/          # blocos "Lacre" e "Trava física"
└── pages/profile/                          # "Notificações deste aparelho"
public/push-sw.js                           # push e notificationclick, importado pelo service worker
tests/
├── fixtures/seal-protocol/                 # exemplos canônicos de pedido e resposta (contrato único)
├── support/seal-simulator.ts               # simulador usado pelas suítes
├── contract/                               # protocolo, bordas, permissões, sem segredo em log
├── integration/seals-*.live.test.ts        # simulador + dois tenants
└── e2e/lacres-*.spec.ts                    # três larguras, teclado, axe, visual
scripts/lacre/simulador.mjs                 # simulador de linha de comando
firmware/
├── platformio.ini                          # ambientes esp32c3 e native
├── include/secrets.example.h               # modelo sem valores reais (secrets.h fora do git)
├── src/                                    # Rede, Transporte, Protocolo, FilaOffline, Trava, Vigilancia, Relogio, GPS, Bateria, LED
├── test/                                   # Unity no ambiente native
└── README.md                               # montagem, gravação e roteiro de bancada
.github/workflows/                          # job novo do firmware (testes nativos e build)
```

**Decisão de estrutura**: o lacre ganha módulos próprios (`domain/seals`, `application/seals`, `pages/seals`, `functions/*-seals`) porque tem ciclo de vida, permissões e histórico próprios; a integração com a Spec 008 é feita por gatilho, sem mexer nos módulos de viagem além dos blocos de tela. O firmware fica em `firmware/` no mesmo repositório, por decisão da spec, com build e testes próprios.

## Ordem de entrega

1. **Fundação**: issue, linha de base (suítes, pacote de entrada), schema, permissões, limites, contrato JSON e prova de que `pg_cron`, `pg_net`, Vault e a biblioteca Web Push funcionam no Supabase local.
2. **História 1 e 5 (P1/P2)**: dispositivo, chave, vínculo, `seal-gateway`, ingestão com deduplicação e simulador; leitura e bloco "Lacre" no cilindro com tempo real.
3. **História 6 (P1)**: verificação automática, saúde, alertas e a página de alertas real.
4. **História 2 (P1)**: comandos e trava no início da viagem.
5. **História 3 (P1)**: destravamento na entrega e exceção com `aal2`.
6. **História 4 (P1)**: vigilância, violação e `auto_lock`.
7. **Notificações push**: inscrição, `seal-push` e `push-sw.js`.
8. **História 7 (P2)**: redes Wi-Fi com o Vault.
9. **História 8 (P1)**: firmware, CI e roteiro do lacre físico.
10. **Polimento**: acessibilidade, capturas visuais, E2E, documentação, publicação no Supabase de teste e validação humana.

## Riscos e tratamento

| Risco | Tratamento |
|---|---|
| `pg_cron`, `pg_net` ou Vault indisponíveis no plano gratuito ou no local | prova na fundação; `pg_cron` com o mesmo `begin … exception` da Spec 002; sem `pg_net`, o `run_seal_watchdog` chama o envio pelo próprio `pg_cron` |
| Biblioteca Web Push não funcionar no Deno da plataforma | teste de fumaça na fundação; plano B `npm:web-push` |
| Cota de invocações (500 mil por mês) com 10 lacres a 1 por minuto | só o gateway por minuto; verificação no banco; push só com alerta; consumo registrado na validação (RNF-004) |
| Chave do dispositivo ou senha de rede em log | manipuladores nunca registram corpo nem resposta; teste de contrato varre logs, auditoria, eventos e notificações |
| Ataque de força bruta na chave | 32 bytes aleatórios, resposta única e bloqueio por endereço |
| Relógio errado no lacre | SNTP antes da primeira chamada (o TLS exige); `server_time` na resposta; leitura até 5 min no futuro aceita e a mais antiga não decide nada |
| Certificado do Supabase trocar de autoridade | pacote de raízes completo do Arduino-ESP32, sem fixar um único certificado |
| Falso alarme de extravio por queda do Wi-Fi | alerta com push só em viagem ou vigilância; no estoque, alerta médio sem push (Clarifications 17/10) |
| Cliente sem gás por queda do Wi-Fi dele | o lacre só trava sozinho com duas posições com GPS fora da geocerca (Clarifications 17/10) |
| Gatilho na Spec 008 quebrar uma RPC existente | gatilhos `after`, sem mudar as funções; as suítes `008_*` e `010_*` rodam inteiras em toda tarefa de integração |
| Senhas de rede legíveis na flash do lacre | registrado como limite do protótipo; cifragem da flash na Fase 8 |
| Modelo da solenoide ainda não confirmado | interface `Trava` com acionador por pulso configurável; a bancada confirma antes da validação |
| Ponto de acesso do caminhão sem cobertura | o lacre guarda as leituras e reenvia; a cobertura é conferida na validação em campo |
| Teste visual gerar capturas `*-win32.png` | regenerar só no Linux (`npm run test:visual:atualizar`) e nunca versionar win32 |
