# Pesquisa: Aprovação e destinação de lacres pelo Master

Decisões técnicas da Spec 013, tomadas sobre a base da Spec 012 já em produção (migrations `20261018*_seals_*`, funções `seal-gateway`, `query-seals` e `manage-seals`, firmware em `firmware/`). Cada item traz a decisão, o motivo e o que foi descartado.

## 1. Código do lacre a partir do chip

- **Decisão**: código = `DSP-` mais 8 caracteres em base32 Crockford (sem I, L, O e U), tirados dos primeiros 40 bits do SHA-256 de `fluxid-lacre:` mais o MAC de fábrica do ESP32 em hexadecimal maiúsculo. A conta fica numa função pura do núcleo do firmware, com vetores de teste. O mesmo cálculo existe numa função SQL de teste, para conferir que os dois lados batem.
- **Motivo**: mantém a regra atual do banco (`^DSP-[0-9A-Z]{8}$`) e as telas, que já mostram esse formato. Os 40 bits deixam a chance de colisão desprezível para uma frota de protótipo, e a colisão que acontecer cai no fluxo de conflito da spec (RF-010). O MAC sai de fábrica e não muda com regravações.
- **Alternativas**: o MAC inteiro em hexadecimal (12 caracteres) mudaria a regra do banco e as telas; um número sorteado no primeiro uso mudaria a cada memória apagada.

## 2. Chave criada pelo próprio lacre

- **Decisão**: no primeiro uso, o lacre sorteia 32 bytes com o gerador de hardware (`esp_fill_random`) e forma a chave `fxk_` mais base64url, do mesmo jeito que as chaves da Spec 012. A chave fica na NVS e vai no cabeçalho `X-Device-Key` de toda chamada. O FluxID guarda só o SHA-256 dela, como hoje.
- **Motivo**: ninguém copia nem vê a chave. A borda e o banco já sabem lidar com esse formato e com o resumo.
- **Alternativas**: uma chave derivada do MAC seria previsível por quem sabe a regra; um certificado por lacre exigiria uma infraestrutura de chaves fora do escopo do protótipo.

## 3. Pedido de aprovação pelo mesmo endpoint

- **Decisão**: o `seal-gateway` continua sendo o único endereço do lacre.
  - **Código desconhecido:** o `seal_ingest` registra ou atualiza o pedido em `seal_enrollments` e responde **202** `{"status":"pending_approval"}`. Nenhuma mensagem é gravada.
  - **Código conhecido e chave certa:** segue como na Spec 012.
  - **Código conhecido e chave diferente:** responde 401, sem dizer o motivo (CA-006 da 012), e marca o pedido como **conflito** para o Master ver.
  - **Pedido recusado:** responde 403 `{"status":"refused"}`. O lacre passa a tentar de hora em hora.
- **Motivo**: o lacre não precisa de outra rota nem saber em que situação está antes de chamar. A resposta 202 não revela organização nem cilindro, então a regra da Spec 012 de não revelar nada continua valendo.
- **Alternativas**: uma função `seal-enroll` separada duplicaria a autenticação, os limites e a normalização do corpo; responder 401 para o código desconhecido deixaria o lacre sem saber se a chave dele estava errada ou se só faltava a aprovação.

## 4. Lacre aguardando não forma fila

- **Decisão**: enquanto não recebe um 200, o lacre manda por intervalo só o `event` `boot`, o `network_change` (rede em uso, sinal e nomes das redes guardadas) e, quando houver, o `event` `networks_forgotten`, sem posições na fila. As leituras começam no primeiro 200. O banco usa dessas mensagens só o resumo do pedido (sinal, rede e versão) e não grava nenhuma delas em tenant.
- **Motivo**: RN-003 (nada antes da aprovação vira dado de tenant). Um lacre esperando aprovação por dias não pode encher a flash com leituras que nunca serão gravadas.
- **Alternativas**: guardar as leituras e mandá-las depois da aprovação levaria ao tenant posições anteriores à destinação, o que contraria a RN-003.

## 5. Uma linha de dispositivo por destinação

- **Decisão**:
  - **Destinação:** cada destinação cria uma linha nova em `seal_devices`, no tenant de destino, com o mesmo `device_code` e a mesma `key_hash`.
  - **Devolução e retirada:** marcam a linha como `inactive` (com `inactive_reason` `returned` ou `withdrawn`). Todo o histórico fica ligado a ela, no tenant antigo.
  - **Código único:** a unicidade de `device_code` passa a valer só entre as linhas ativas (índice único parcial).
  - **Busca pelo código:** o `seal_ingest` procura só a linha ativa.
  - **Ao inativar:** na mesma transação da devolução ou da retirada, o auxiliar `private.seal_deactivate_line` encerra o vínculo, cancela os comandos pendentes (apagando do Vault a senha dos comandos de rede, como na Spec 012), encerra a vigilância ativa e fecha os alertas abertos com o motivo `device_inactive`. O estado da trava fica como o último confirmado, sem presumir nada (princípio IV). O vigia ignora linhas inativas.
  - **Redes do tenant anterior (RN-006):** as senhas de Wi-Fi de um tenant não podem seguir com o lacre para outro tenant.
    - **Pedido:** a devolução marca `forget_networks = 'all'` no pedido. A retirada marca `extras` (padrão) ou `all` (escolha do Master). O `202` leva a marca até o lacre confirmar.
    - **`all` no firmware:** o lacre esquece todas as redes, **exceto a configurada pelo portal depois do último `200`**. Assim, um lacre ainda no local antigo apaga tudo e abre o portal, e um lacre que chegou desligado ao novo local, onde a rede nova foi configurada pelo botão BOOT, mantém só a rede nova.
    - **`extras` no firmware:** apaga as redes da lista do sistema e mantém a principal.
    - **Confirmação:** depois de apagar, o lacre guarda na NVS o evento `networks_forgotten` (`detail`: `all` ou `extras`) e o envia na chamada seguinte. Isso limpa a marca e, com `all`, anula `last_organization_id`.
    - **Trava na aprovação:** enquanto `last_organization_id` estiver preenchido, `approve_enrollment` para um tenant diferente responde `NETWORKS_NOT_CLEARED`. Para liberar um lacre pendente que ainda tem a rede principal do tenant anterior, o Master pede `all` por `request_forget_networks`.
  - **Por que um evento, e não a lista de redes guardadas:** comparar nomes falharia quando os dois tenants têm redes com o mesmo nome.
- **Motivo**: RN-005 (o histórico pertence ao tenant em que foi gerado), sem mover nem copiar posições, alertas ou vínculos entre organizações, e sem mexer nas políticas de RLS da Spec 012.
- **Alternativas**: trocar o `organization_id` da linha existente levaria o histórico para o tenant novo; apagar o histórico contraria a regra de nunca excluir.

## 6. Fila do Master como tabela da plataforma

- **Decisão**: tabela `public.seal_enrollments`, sem `organization_id` (o pedido ainda não tem tenant), com RLS ligada e sem nenhuma política. Toda leitura e escrita passa por RPC `security definer` que exige `platform.manage`. A auditoria é a da plataforma (`audit_logs` com `organization_id` nulo). A devolução também gera auditoria no tenant.
- **Motivo**: é o mesmo padrão das organizações (Spec 002/004), que já funciona para dados globais.
- **Alternativas**: um "tenant da plataforma" para guardar os pedidos misturaria dados globais com dados de tenant.

## 7. Funções e telas do Master

- **Decisão**:
  - **Borda:** função nova `platform-seals`, no molde de `manage-organizations`: identidade global, `platform.manage` (sem segundo fator, RF-021) e auditoria das negações. Operações: `list_enrollments`, `approve_enrollment` (com o tenant), `refuse_enrollment`, `replace_enrollment_key`, `withdraw_device`, `request_forget_networks`, `reveal_portal_password` e `list_tenants_for_seals`.
  - **Justificativa:** toda operação que muda estado ou revela a senha exige justificativa de 5 a 500 caracteres (constituição, princípio III), a mesma faixa das ações de lacre da Spec 012.
  - **Conflito:** `replace_enrollment_key` aceita a chave da última chamada em conflito (`conflict_key_hash`) ou, com `keep_current: true`, mantém a atual e só limpa a marca. Não vale para pedido `approved`: o Master retira antes. É o caminho do lacre reinstalado, que gera uma chave nova.
  - **Tela:** `/admin/lacres`, "Lacres da plataforma", no menu do Master, ao lado de "Organizações".
  - **Tempo real:** aprovar, retirar e devolver chamam `private.seal_broadcast(<tenant>, 'device', <linha>, null)` (Spec 012, canal `seals:<organização>`). O aviso vai ao tenant de destino na aprovação e ao antigo na retirada e na devolução, e a tela `/lacres` recarrega sozinha (MS-003). A consulta a cada 30 s continua como reserva.
- **Motivo**: as ações do Master são da plataforma e não cabem no `manage-seals`, que exige um tenant em toda chamada.
- **Alternativas**: estender o `manage-seals` com um modo sem tenant enfraqueceria a validação da organização, que hoje é obrigatória nele.

## 8. Devolução pelo tenant

- **Decisão**: operação nova `return_device` no `manage-seals` (`seal.admin`, justificativa de 5 a 500 caracteres, recusa `CYLINDER_IN_TRIP`). Ela encerra o vínculo, inativa a linha do dispositivo com o motivo `returned` e põe o pedido do código de volta na fila como `returned`. Saem do catálogo do `manage-seals` e das telas: `create_device`, `rotate_device_key` e `deactivate_device`. As funções do banco ficam, porque os testes da Spec 012 e os lacres antigos ainda as usam, mas sem acesso pela borda.
- **Motivo**: segunda decisão do esclarecimento de 18/10/2026.
- **Alternativas**: apagar as funções do banco quebraria o histórico das migrations e os testes da Spec 012.

## 9. Senha padrão da rede de configuração

- **Decisão**:
  - **No firmware:** a senha fica em `include/secrets.h` (`FLUXID_PORTAL_SENHA`, fora do git), igual para toda a frota (primeira decisão do esclarecimento).
  - **No servidor:** o mesmo valor fica no Vault como `seal_portal_password`, gravado na publicação por SQL documentado, nunca por migration.
  - **Consulta:** `reveal_portal_password` devolve o valor ao Master e grava a auditoria. Se o segredo não existir, responde `NOT_CONFIGURED` e a tela explica como configurar.
  - **Testes:** gravam o segredo dentro da própria transação.
- **Motivo**: nenhuma senha em arquivo versionado (AGENTS.md); o Master consulta sem ter acesso ao firmware.
- **Alternativas**: uma migration com a senha a deixaria no git; uma variável de ambiente da função não serviria para o banco auditar a consulta.

## 10. Portal cativo no firmware

- **Decisão**: portal por Wi-Fi (`WiFi.softAP` com WPA2), `DNSServer` respondendo a todos os nomes e `WebServer` na porta 80, tudo da biblioteca do arduino-esp32 e sem dependência nova.
  - **Quando abre:** sem rede salva, ou com o botão BOOT (GPIO9) segurado por 5 s.
  - **Página:** uma só, escrita em `firmware/portal/index.html` (HTML, CSS e JS inline, sem rede externa) e embutida por `firmware/ferramentas/embutir_portal.py` (`extra_scripts` do PlatformIO, sem dependência nova), que gera `src/PortalPagina.h` fora do git. Assim a página é testada no navegador (`tests/e2e/portal-lacre.spec.ts`, com axe, teclado e larguras) sem o lacre. Tem HTML semântico, CSS próprio pequeno e as cores da marca. Mostra o código, a lista de redes (com o sinal em texto e ordenada pelo sinal) e o formulário, e faz uma consulta de situação a cada 2 s durante o teste.
  - **Núcleo testado no computador** (`nucleo/Portal`): validação do nome (1 a 32 bytes) e da senha (8 a 63, ou rede aberta), escape de HTML dos nomes de rede (um nome malicioso não injeta código), lista em JSON, motivos de falha e os tempos (15 min aberto e 5 min fechado sem rede salva).
  - **Teste da rede:** reaproveita a `TrocaDeRede` da Spec 012, com o motivo da falha.
  - **Memória:** medido em 18/10/2026, com servidor e DNS o firmware ocupa 86,2% da flash (era 83,1%) e 12,9% da RAM. Cabe na partição atual, que fica, porque trocar a partição apagaria a fila dos lacres já gravados. Se passar de 95% com a página final, a troca para `huge_app.csv` será registrada aqui.
- **Motivo**: funciona em qualquer celular e computador sem instalar nada. Bluetooth está fora do escopo.
- **Alternativas**: a biblioteca WiFiManager traz páginas próprias fora do padrão de acessibilidade e de linguagem do projeto; Web Bluetooth não funciona no iPhone.

## 11. Limites contra pedidos falsos

- **Decisão**:
  - **Tabela:** `private.seal_enroll_rate_windows (bucket, window_start, count)`. A `private.seal_rate_windows` da Spec 012 é indexada por `device_id`, com chave estrangeira para `seal_devices`, e não serve para pedidos que ainda não têm linha.
  - **Por endereço:** no máximo 20 pedidos **novos** por resumo de endereço de origem por hora (`bucket` = `enroll:` mais o resumo). Os pedidos acima do limite são contados para o Master.
  - **Por pedido:** cada pedido pendente tem o mesmo valor do limite por dispositivo da Spec 012, 6 chamadas por minuto (`bucket` = `pending:` mais o id do pedido).
  - **Expiração:** o vigia (`private.run_seal_watchdog()`) expira pedidos pendentes sem chamada há 7 dias.
- **Motivo**: RF-017. Usa a mesma estrutura de limites da Spec 012.
- **Alternativas**: um CAPTCHA não se aplica a um aparelho.

## 12. Lacres da Spec 012 cadastrados à mão

- **Decisão**: continuam funcionando com a chave que têm. Uma migration cria um pedido `approved` para cada `seal_devices` ativo, com `organization_id`, `device_id` e `last_organization_id` iguais ao tenant da linha, para eles aparecerem para o Master como "em operação" e seguirem a RN-006. O firmware novo, num lacre que já tem `secrets.h` com código e chave, usa os dois e não pede aprovação.
  - **Rede compilada:** o firmware novo ignora `FLUXID_WIFI_SSID` e `FLUXID_WIFI_SENHA`, mesmo que ainda estejam num `secrets.h` antigo, para nenhuma rede ficar compilada e fora do alcance do esquecimento (RF-019, RN-006). A rede principal vem só do portal. Um lacre regravado com o firmware novo e sem rede na NVS abre o portal.
  - **Firmware da Spec 012:** não conhece `forget_networks` e nunca confirma o esquecimento, então só muda de tenant depois de regravado. É um bloqueio seguro. Esse firmware também não conhece a resposta `202`; por isso, antes de retirar ou devolver um desses lacres, ele deve ser regravado com o firmware novo, para não ficar reenviando a fila sem uma resposta que entenda.
- **Motivo**: RF-018 sem quebrar a bancada nem os lacres gravados na Spec 012.
