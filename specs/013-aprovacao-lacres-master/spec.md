# Especificação da funcionalidade: Aprovação e destinação de lacres pelo Master, com a rede configurada pelo próprio lacre

**Branch da funcionalidade**: `feat/013-aprovacao-lacres-master`

**Criada em**: 18/10/2026

**Status**: Em implementação (desde 19/10/2026)

**Entrada**: Pedido do responsável pelo produto em 18/10/2026, durante a validação em bancada da Spec 012: o cadastro de um lacre novo não pode depender de ligar o lacre ao computador nem de gravar dados dele no firmware. Ligado pela primeira vez, o lacre abre a própria rede Wi-Fi de configuração, com uma senha padrão igual para todos os lacres, que o usuário Master consulta no sistema. Pelo celular ou computador, a pessoa entra nessa rede e informa ao lacre qual Wi-Fi ele deve usar. Com internet, o lacre pede ao FluxID a aprovação. O Master aprova e destina o lacre a um tenant, onde ele passa a funcionar sem cilindro, até o administrador do tenant fazer a vinculação. Só Wi-Fi, sem Bluetooth.

## Contexto

Na Spec 012, cada lacre novo dá trabalho manual e exige o computador. O administrador do tenant cadastra o dispositivo, copia o código e a chave mostrados uma única vez, grava os dois e a rede padrão no firmware, compila e grava a placa pelo cabo USB. Na validação em bancada de 18/10/2026, isso também mostrou que o lacre fica preso à rede gravada no firmware: se ela não estiver ao alcance, ele não fala com ninguém.

Esta spec troca esse caminho por um fluxo sem cabo, com um único firmware para todos os lacres:

- **O lacre se apresenta sozinho.** O código dele vem do identificador de fábrica do chip, e a chave é gerada pelo próprio lacre na primeira vez e fica guardada nele. Ninguém copia chave nenhuma.
- **A rede é escolhida no local.** O próprio lacre abre uma rede de configuração e mostra uma página onde a pessoa escolhe o Wi-Fi que ele vai usar.
- **Nenhum lacre opera sem aprovação.** O pedido de um lacre novo entra numa fila da plataforma. Só o Master aprova e decide a que tenant o lacre pertence. O lacre continua sem informar organização nenhuma (Spec 012, RN-006): quem define é o Master.
- **O tenant recebe o lacre pronto.** Aprovado, o lacre aparece em funcionamento na tela Lacres do tenant, sem cilindro. A vinculação ao cilindro segue a Spec 012.

## Clarifications

### Session 2026-10-18

- Q: A senha padrão da rede de configuração é fixa no firmware ou o Master pode trocá-la pelo sistema? → A: **Fixa no firmware**; o Master só a consulta no sistema. Para trocá-la, grava-se um firmware novo.
- Q: Depois da destinação, quem tira o lacre de operação? → A: **O tenant devolve o lacre à plataforma** com justificativa, e ele volta à fila do Master como "devolvido"; só o Master desativa ou destina de novo. "Gerar chave nova" sai da tela, porque a chave é criada pelo próprio lacre.

## Objetivos

- Colocar um lacre novo em funcionamento sem cabo, sem editar o firmware e sem copiar chave.
- Deixar a escolha da rede Wi-Fi do lacre para quem está no local, pelo celular ou computador, sem internet.
- Garantir que só o Master decide quais lacres entram em operação e em qual tenant.
- Mostrar ao administrador do tenant só os lacres destinados ao tenant dele, prontos para vincular.

Fora do escopo: Bluetooth; cifragem da flash do ESP32 (Fase 8); venda, cobrança ou estoque de lacres entre a plataforma e os tenants; transferência de cilindros entre tenants.

## Atores

- **Master (usuário da plataforma)**: vê os pedidos de todos os lacres, aprova, recusa, destina a um tenant e retira um lacre de operação. Consulta a senha padrão da rede de configuração (fixa no firmware).
- **Pessoa no local (técnico)**: liga o lacre, entra na rede de configuração pelo celular ou computador e escolhe o Wi-Fi. Não precisa ter conta no FluxID.
- **Administrador do tenant**: vê os lacres destinados ao tenant, vincula-os a cilindros (Spec 012) e pode devolver um lacre à plataforma, com justificativa. Não desativa nem gera chave.
- **Lacre**: abre a rede de configuração, testa e guarda a rede escolhida, pede aprovação e passa a operar quando aprovado.

## Cenários de usuário e testes

### História 1 — Configurar a rede do lacre pelo celular, sem internet (Prioridade: P1)

A pessoa no local liga um lacre novo. Ele não tem rede salva e abre a rede de configuração `FluxID-Lacre-` mais o final do código do chip. Ela entra nessa rede pelo celular com a senha padrão, e uma página do próprio lacre abre sozinha. A página mostra o código do lacre e as redes Wi-Fi ao alcance, com o sinal. A pessoa escolhe uma rede e informa a senha. O lacre testa antes de guardar e mostra o resultado.

**Por que esta prioridade**: sem rede, o lacre não chega ao FluxID, e nada do resto acontece.

**Teste independente**: com um lacre sem rede salva, um celular sem internet e uma rede Wi-Fi com internet ao alcance, a rede é configurada pela página e o lacre passa a alcançar o FluxID.

**Cenários de aceitação**:

1. **Dado** um lacre sem rede salva, **quando** ele liga, **então** abre a rede de configuração com o nome `FluxID-Lacre-` mais o final do código, protegida pela senha padrão.
2. **Dado** o celular conectado à rede de configuração, **quando** a pessoa abre qualquer endereço ou a página aparece sozinha, **então** ela vê o código do lacre e a lista das redes ao alcance, com o sinal em texto (forte, médio, fraco) e não só por ícone.
3. **Dado** a rede escolhida e a senha certa, **quando** a pessoa confirma, **então** o lacre testa a conexão e a chegada ao FluxID e, se der certo, guarda a rede, mostra "Conectado à internet e ao FluxID. O lacre aguarda a vinculação a um tenant pelo Master" e fecha a rede de configuração.
4. **Dado** a senha errada, a rede fora do alcance ou a rede sem internet, **quando** o teste falha, **então** a página mostra o motivo em linguagem simples, nada é guardado e a pessoa pode tentar de novo.
5. **Dado** uma rede que não aparece na lista (oculta), **quando** a pessoa digita o nome e a senha, **então** o lacre testa do mesmo jeito.
6. **Dado** um lacre já configurado e em operação, **quando** a pessoa segura o botão da placa por 5 segundos, **então** ele reabre a rede de configuração, sem apagar a rede atual até uma nova ser testada com sucesso.

---

### História 2 — O lacre pede aprovação e o Master aprova e destina a um tenant (Prioridade: P1)

Com internet, o lacre se apresenta ao FluxID pelo código e pela chave dele e pede aprovação. O pedido aparece para o Master em "Lacres aguardando aprovação". O Master confere o código com o lacre em mãos, escolhe o tenant e aprova. Ou então recusa.

**Por que esta prioridade**: é o controle de quem entra em operação, e é o que tira a chave manual da Spec 012.

**Teste independente**: um lacre novo pede aprovação, o Master aprova para o Tenant A, e o lacre passa a enviar posições gravadas no Tenant A. O Tenant B não vê nada.

**Cenários de aceitação**:

1. **Dado** um lacre novo com internet, **quando** ele chama o FluxID, **então** o pedido entra em "aguardando aprovação" com o código, a primeira e a última chamada, o sinal e a rede. O lacre recebe "aguardando aprovação" e repete o pedido no intervalo normal.
2. **Dado** um lacre aguardando aprovação, **quando** ele envia posições ou outras mensagens, **então** nada é gravado em tenant nenhum, nenhum alerta de tenant é aberto e ele não recebe comandos.
3. **Dado** o Master na tela de pedidos, **quando** aprova um lacre escolhendo o Tenant A, **então** o lacre passa a pertencer ao Tenant A, fica ativo e sem cilindro, e na resposta seguinte fica sabendo que foi aprovado. A aprovação fica na auditoria da plataforma, com o Master e o tenant.
4. **Dado** um pedido, **quando** o Master recusa com uma justificativa de 5 a 500 caracteres, **então** o lacre recebe "recusado", para de pedir com frequência (passa a tentar de hora em hora) e o pedido sai da fila de aguardando. O pedido continua recusado até o Master reconsiderar e aprová-lo, também com justificativa. Tudo fica auditado.
5. **Dado** um lacre aprovado, **quando** o Master o retira de operação com justificativa, **então** o vínculo com o cilindro é encerrado, os comandos pendentes são cancelados, a vigilância é encerrada, os alertas abertos são fechados, o tenant deixa de recebê-lo, o lacre esquece as redes extras do tenant (ou todas, se o Master escolher "Esquecer todas as redes") e volta a "aguardando aprovação". Lacre num cilindro em viagem em andamento não pode ser retirado.
6. **Dado** um segundo aparelho com o mesmo código de um lacre já conhecido, mas com outra chave, **quando** ele pede aprovação, **então** o pedido recebe a marca de **conflito** e não pode ser aprovado. O lacre conhecido não é afetado. O Master resolve o conflito aceitando a chave nova ou mantendo a atual, com justificativa.
7. **Dado** um usuário que não é Master, **quando** tenta ver ou aprovar pedidos, **então** recebe "sem permissão" e a tentativa fica auditada como negada.

---

### História 3 — O administrador do tenant vê os lacres destinados e vincula (Prioridade: P1)

Na tela Lacres, o administrador do tenant vê os lacres que o Master destinou ao tenant dele, em funcionamento. Os que estão sem cilindro aparecem marcados como "prontos para vincular". A vinculação acontece pelo detalhe do cilindro, como na Spec 012.

**Por que esta prioridade**: fecha o fluxo, porque o lacre aprovado só tem utilidade depois de vinculado.

**Teste independente**: depois da aprovação para o Tenant A, o administrador do A vê o lacre como "pronto para vincular" e o vincula a um cilindro. O administrador do B não vê o lacre.

**Cenários de aceitação**:

1. **Dado** um lacre aprovado para o Tenant A, **quando** o administrador do A abre Lacres, **então** o lacre aparece em funcionamento, sem cilindro, com a marca "pronto para vincular" e a data da aprovação.
2. **Dado** o mesmo lacre, **quando** o administrador do Tenant B abre Lacres ou o endereço direto do lacre, **então** não o vê ("não encontrado").
3. **Dado** um lacre aguardando aprovação, **quando** qualquer usuário de tenant abre Lacres, **então** ele não aparece.
4. **Dado** um lacre pronto para vincular, **quando** o administrador abre "Vincular lacre" no detalhe do cilindro, **então** o lacre está na lista e a vinculação segue a Spec 012.
5. **Dado** um lacre do tenant, **quando** o administrador o devolve com uma justificativa de 5 a 500 caracteres, **então** o vínculo com o cilindro é encerrado, os comandos pendentes são cancelados, a vigilância é encerrada, os alertas abertos são fechados, o lacre sai da lista do tenant, esquece todas as redes Wi-Fi guardadas e volta à fila do Master como "devolvido", com a justificativa. Lacre num cilindro em viagem em andamento não pode ser devolvido. Tudo fica auditado.
6. **Dado** o detalhe do lacre no tenant, **quando** o administrador o abre, **então** não há as ações "Gerar chave nova" nem "Desativar"; há "Devolver à plataforma".

---

### História 4 — O Master consulta a senha padrão da rede de configuração (Prioridade: P2)

Na área do Master, a senha padrão da rede de configuração dos lacres fica disponível para consulta, com o nome da rede e as instruções do primeiro contato.

**Por que esta prioridade**: sem a senha, ninguém entra na rede de configuração. Ela não muda o fluxo, mas precisa estar à mão de quem instala.

**Teste independente**: o Master abre a área de lacres da plataforma, revela a senha e entra com ela na rede de configuração de um lacre novo.

**Cenários de aceitação**:

1. **Dado** o Master, **quando** abre a área de lacres da plataforma, **então** vê o padrão do nome da rede de configuração, as instruções e o botão "Mostrar a senha", que pede o motivo da consulta (5 a 500 caracteres). Cada vez que a senha é revelada, isso fica auditado com o motivo.
2. **Dado** um usuário que não é Master, **quando** tenta ver a senha, **então** recebe "sem permissão".
3. **Dado** o Master, **quando** procura como trocar a senha, **então** a tela explica que ela é fixa no firmware e só muda com uma nova gravação do firmware. Não há botão de troca.

---

### Casos de borda

- **Lacre sem nenhuma rede ao alcance:** a rede de configuração fica aberta. Se ninguém se conectar em 15 minutos, ela fecha e reabre de tempos em tempos (5 minutos fechada, 15 aberta), para não gastar energia sem fim nem ficar sempre exposta.
- **A rede configurada cai depois:** o lacre segue as regras da Spec 012 (lista de redes, rede salva, fila de leituras). Ele **não** reabre sozinho a rede de configuração, só pelo botão.
- **Muitos pedidos de lacres falsos:** há um limite de pedidos novos por endereço de origem e por hora, e pedidos sem resposta expiram em 7 dias. A fila do Master mostra quantos foram descartados pelo limite.
- **Pedido aprovado, mas o lacre ainda não recebeu a resposta:** ele passa a operar na resposta seguinte. Mensagens enviadas antes da aprovação não são gravadas no tenant.
- **Lacre aprovado reinstalado (memória apagada):** ele gera uma chave nova e o pedido recebe a marca de **conflito** com o mesmo código. O Master retira o antigo, aceita a chave nova e aprova de novo.
- **Lacre devolvido e destinado a outro tenant:** posições, comandos, alertas e vínculos anteriores continuam só no tenant antigo, e o novo tenant começa sem histórico desse lacre. O lacre esquece as redes Wi-Fi do tenant antigo antes da nova destinação (RN-006). Nenhum dado de um tenant aparece para o outro.
- **Lacre devolvido que chega desligado ao novo local:** ele ainda tem as redes antigas e não recebeu a ordem de esquecê-las. A pessoa abre o portal pelo botão BOOT e configura a rede local. Na chamada seguinte, o lacre esquece as redes antigas, mantém a nova e confirma, e só então o Master pode destiná-lo ao novo tenant.
- **Lacre da Spec 012 cadastrado à mão:** continua funcionando com a chave que já tem. Novos lacres seguem esta spec. Com o firmware da Spec 012, ele não conhece o pedido de esquecimento das redes e nunca o confirma. Por isso só muda de tenant depois de regravado com o firmware novo. É um bloqueio seguro: as redes do tenant antigo nunca seguem para outro.
- **Página de configuração aberta por duas pessoas ao mesmo tempo:** só um teste de rede por vez. A segunda pessoa vê "teste em andamento".
- **Nome de rede com acentos ou caracteres especiais:** aparece como o lacre recebeu e é aceito até 32 bytes.

### Session 2026-10-19

- Q: O segundo fator (TOTP) continua obrigatório para o Master e para as ações críticas? → A: **Não.** Por decisão da pessoa responsável, o acesso passa a ser só com e-mail e senha para todos os perfis, e nenhuma tela ou ação exige mais o segundo fator (telas de administração, aprovação de lacres, anonimização, desbloqueio excepcional e destravar o lacre). Em 20/10/2026 a pessoa responsável pediu a remoção completa: o TOTP também deixa de existir como opção, e nenhuma tela pede ou oferece o segundo fator (RF-021).
- Q: Qual o tamanho da senha da rede de configuração do lacre? → A: **No máximo 8 caracteres**, para ser digitada no celular. Como o WPA2 exige no mínimo 8, a senha tem exatamente 8 (RF-022). As senhas das redes Wi-Fi do local, digitadas no portal, continuam de 8 a 63.
- Q: O lacre pode ter uma rede padrão quando ninguém escolhe outra? → A: **Sim, a rede `FluxID`**, como rede da plataforma, usada só enquanto nenhuma rede for escolhida no portal (RF-023). E a página do lacre mostra, ao abrir, se ele já está conectado (RF-024).

## Requisitos

### Requisitos funcionais

- **RF-001**: Sem rede salva, o lacre deve abrir a própria rede Wi-Fi de configuração, chamada `FluxID-Lacre-` mais os 4 últimos caracteres do código, protegida pela senha padrão.
- **RF-002**: A rede de configuração deve oferecer uma página local (portal cativo) que funcione sem internet, no celular e no computador, nas larguras de 360 px a desktop, acessível por teclado e por leitor de tela.
- **RF-003**: A página deve mostrar o código do lacre e as redes ao alcance, com o sinal em texto, permitir digitar uma rede oculta e pedir a senha.
- **RF-004**: O teste deve confirmar a conexão à rede e a chegada ao FluxID. O resultado deve dizer o motivo da falha: senha errada, rede fora do alcance ou sem internet.
- **RF-005**: O lacre só deve guardar a rede depois do teste com sucesso. Com sucesso, fecha a rede de configuração.
- **RF-006**: Segurar o botão da placa por 5 segundos deve reabrir a rede de configuração, sem apagar a rede atual até uma nova ser confirmada.
- **RF-007**: O código do lacre deve vir do identificador de fábrica do chip, ser único e estável entre reinícios.
- **RF-008**: Na primeira vez, o lacre deve gerar a própria chave e guardá-la na memória. O FluxID guarda só a forma protegida dela e a associa ao código no primeiro pedido; só o Master troca essa associação, ao resolver um conflito.
- **RF-009**: O lacre sem aprovação deve receber "aguardando aprovação" e repetir o pedido no intervalo normal. Nenhuma mensagem dele é gravada em tenant, nenhum alerta de tenant é aberto e nenhum comando é entregue.
- **RF-010**: Um pedido com código já conhecido e chave diferente deve receber a marca de conflito e não pode ser aprovado enquanto ela existir. O Master resolve o conflito aceitando a chave nova (só fora de operação) ou mantendo a atual, com justificativa de 5 a 500 caracteres.
- **RF-011**: O Master deve ver a fila de pedidos por situação (aguardando, em operação, devolvidos, recusados e expirados), com a marca de conflito e um filtro só para os pedidos em conflito, e ver o código, primeira e última chamada, sinal, rede e a quantidade de chamadas.
- **RF-012**: O Master deve aprovar um pedido (aguardando, devolvido ou recusado) escolhendo um tenant ativo e informando uma justificativa de 5 a 500 caracteres. Destinar a um tenant diferente do último exige a confirmação do esquecimento das redes (RN-006). O lacre passa a pertencer ao tenant, ativo e sem cilindro, e sabe da aprovação na resposta seguinte.
- **RF-013**: O Master deve poder recusar um pedido, retirar um lacre de operação e destinar de novo um lacre devolvido, sempre com justificativa de 5 a 500 caracteres. Retirar, exceto com o cilindro numa viagem em andamento, encerra o vínculo com o cilindro, cancela os comandos pendentes, encerra a vigilância, fecha os alertas abertos do lacre nesse tenant e devolve o lacre a "aguardando aprovação".
- **RF-013a**: O administrador do tenant deve poder devolver um lacre à plataforma, com justificativa de 5 a 500 caracteres, exceto se o cilindro dele estiver numa viagem em andamento. A devolução encerra o vínculo, cancela os comandos pendentes, encerra a vigilância, fecha os alertas abertos do lacre nesse tenant, tira o lacre do tenant e o põe na fila do Master como "devolvido". O tenant não desativa lacres nem gera chave.
- **RF-014**: Aprovar, recusar, resolver conflito, retirar de operação, pedir o esquecimento das redes, devolver à plataforma e revelar a senha padrão devem gerar auditoria (da plataforma e, na aprovação, na retirada e na devolução, também do tenant). A auditoria registra quem agiu, o código do lacre, o tenant e a justificativa, nunca a chave nem a senha.
- **RF-015**: O administrador do tenant deve ver em Lacres só os lacres destinados ao tenant dele, com a marca "pronto para vincular" nos que estão sem cilindro. A vinculação segue a Spec 012.
- **RF-016**: O Master deve consultar a senha padrão da rede de configuração, revelada sob pedido, com justificativa de 5 a 500 caracteres. A senha é fixa no firmware e igual para todos os lacres; o sistema não a troca nem a envia aos lacres. O valor mostrado ao Master é o mesmo gravado no firmware da frota, configurado na publicação, e nunca fica em arquivo versionado.
- **RF-017**: Deve haver um limite de pedidos novos por endereço de origem e por hora. Os pedidos sem resposta expiram em 7 dias.
- **RF-018**: O cadastro manual da Spec 012 (chave mostrada uma vez) deixa de ser oferecido na tela para lacres novos. Os lacres já cadastrados por ele continuam funcionando.
- **RF-019**: Um único firmware deve servir a todos os lacres, só com o endereço do FluxID e a senha de fábrica da rede de configuração, sem rede padrão nem chave por lacre gravadas.
- **RF-020**: As redes extras configuradas pelo sistema (Spec 012, História 7) continuam valendo para lacres aprovados, somadas à rede escolhida no portal.
- **RF-021**: O acesso deve ser só com e-mail e senha para todos os perfis. Não há segundo fator em tela ou ação nenhuma: a tela de verificação, o cadastro do TOTP e as checagens de `aal2` nas funções e no cliente foram removidos, o login nunca responde `MFA_REQUIRED`, o TOTP fica desligado na configuração do Auth e a migration `20261019120700_auth_sem_segundo_fator` neutraliza as checagens no banco. A auditoria segue gravando o nível da sessão. Permissão, justificativa e auditoria das ações sensíveis continuam como antes.
- **RF-023**: O firmware pode trazer, no `secrets.h` fora do git, a rede padrão da plataforma (`FluxID`). Ela é usada só enquanto nenhuma rede foi escolhida no portal e não é de tenant nenhum: o lacre nunca a esquece (RN-006 continua valendo para as redes dos tenants) e nunca a grava na memória. Enquanto não houver rede escolhida, o portal continua abrindo sozinho.
- **RF-024**: Ao entrar na rede de configuração, a página do lacre deve mostrar se ele já está conectado: por qual rede, se chega ao FluxID e, chegando, se aguarda a vinculação a um tenant ou já está em operação. A informação se atualiza sozinha enquanto a página fica aberta.
- **RF-022**: A senha padrão da rede de configuração deve ter exatamente 8 caracteres (o WPA2 exige no mínimo 8; a decisão é no máximo 8, para digitar no celular). O firmware não compila com outro tamanho. As senhas das redes do local, digitadas no portal, seguem de 8 a 63 caracteres.

### Regras de negócio

- **RN-001**: Só o Master define a que tenant um lacre pertence. O lacre nunca informa organização.
- **RN-002**: Um lacre pertence a no máximo um tenant por vez.
- **RN-003**: Nada do que o lacre envia antes da aprovação vira dado de tenant.
- **RN-004**: A rede de configuração nunca abre sozinha com o lacre em operação, só sem rede salva ou pelo botão.
- **RN-005**: O histórico de um lacre pertence ao tenant em que foi gerado. Uma nova destinação não leva dados de um tenant para outro.
- **RN-006**: Um lacre só é destinado a um tenant diferente do último depois de confirmar que esqueceu todas as redes Wi-Fi guardadas, exceto a configurada no portal depois da última aprovação recebida. A devolução pede esse esquecimento. A retirada pede o esquecimento só das redes extras (mantém a principal, para o Master aprová-lo de novo no mesmo tenant sem visita ao local), salvo se o Master escolher "Esquecer todas as redes". Para um lacre fora de operação que ainda guarda as redes do tenant anterior, o Master pode pedir o esquecimento de todas as redes, com justificativa.

### Entidades principais

- **Pedido de aprovação do lacre**: código, forma protegida da chave, situação (aguardando, aprovado, recusado, expirado, devolvido), marca de conflito, primeira e última chamada, quantidade de chamadas, sinal e rede informados, origem resumida (sem endereço em texto aberto), decisão e quem decidiu.
- **Destinação do lacre**: lacre, tenant, Master que aprovou, quando, e o encerramento (retirada de operação) com justificativa.
- **Senha da rede de configuração**: valor único e fixo, o mesmo do firmware da frota. É guardado protegido no servidor só para consulta do Master.

## Critérios de sucesso

### Resultados mensuráveis

- **MS-001**: A pessoa no local configura a rede de um lacre novo pelo celular, sem internet, em até 3 minutos.
- **MS-002**: Um lacre novo aparece para o Master em até 1 minuto depois de alcançar o FluxID.
- **MS-003**: Depois da aprovação, o lacre aparece para o administrador do tenant em até 1 minuto, pronto para vincular.
- **MS-004**: Nos testes, 0 mensagens de lacres não aprovados são gravadas em tenant e 0 lacres de outro tenant aparecem para o administrador.
- **MS-005**: Colocar um lacre novo em operação não exige cabo, compilação nem cópia de chave, em 100% dos casos testados.
- **MS-006**: 100% das aprovações, recusas, resoluções de conflito, retiradas, pedidos de esquecimento das redes, devoluções e consultas da senha padrão ficam na auditoria, com a justificativa.

## Premissas e dependências

- A Spec 012 está integrada: endpoint do lacre, lacres, vínculo, fila de leituras, redes extras e firmware em `firmware/`.
- O papel Master da plataforma (Spec 002) é quem aprova. Não se cria papel novo.
- A senha padrão é igual para todos os lacres e fixa no firmware, por decisão do responsável pelo produto em 18/10/2026. O risco é que quem a conhece pode configurar um lacre que esteja com a rede de configuração aberta, o que só acontece sem rede salva ou com o botão pressionado no próprio lacre. Esse risco foi aceito para o protótipo.
- O ESP32-C3 tem memória suficiente para a página local na partição atual, confirmado no plano (86,2% da flash em 18/10/2026, com alerta em 95%; `research.md`, item 10).
- Os textos, a acessibilidade e o visual das telas novas seguem o padrão da Spec 005 e do design system.
