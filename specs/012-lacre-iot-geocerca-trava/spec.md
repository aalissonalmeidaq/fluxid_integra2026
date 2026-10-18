# Especificação da funcionalidade: Lacre IoT — posição em tempo real, geocerca e trava do cilindro

**Branch da funcionalidade**: `feat/012-lacre-iot-geocerca-trava` (a criar depois que o trabalho da Spec 011 for integrado)

**Criada em**: 16/10/2026

**Status**: Rascunho

**Entrada**: Fase 6 do plano de implementação do PRD (`docs/prd.md`, seção 15): "IoT simulado, comandos e telemetria". Pedido do responsável pelo produto em 16/10/2026, revisto em 17/10/2026 (o projeto físico mudou: sai o módulo GSM e o lacre passa a se conectar por **Wi-Fi**, com uma rede padrão gravada no firmware e a troca da rede feita pelo sistema): o lacre (ESP32) preso ao cilindro se conecta pelo Wi-Fi a um endpoint fornecido pelo FluxID, envia a posição e recebe por ele o comando de travar a válvula; o sistema guarda as posições sem gerar registros repetidos, mostra em tempo real onde o cilindro está e se o lacre está funcionando, avisa sozinho quando o lacre para de comunicar, trava o lacre quando o cilindro entra em viagem, destrava depois da entrega correta dentro da geocerca do cliente e trava de novo, com alerta de violação, se o cilindro sair da geocerca. Tudo roda no ambiente de teste que o FluxID já usa, sem contratar outro serviço. As regras já testadas na API do lacre de Natã da Silva Baracho (repositório `NatBaracho/APIEsp32`) servem de referência e são trazidas para o FluxID; aquela API não é publicada.

## Contexto

Até a Spec 010 o FluxID controla o cilindro pelo que as pessoas registram: conferência, chegada, entrega e a posição lida no celular **no momento de um registro**. O bloqueio da viagem é **lógico** (Spec 008): ao iniciar a viagem, os cilindros ficam "bloqueados" no sistema, e o desbloqueio é um registro com justificativa, sem acionar trava nenhuma. A Spec 008 deixou dito que a trava física é da Fase 6.

O lacre inteligente muda isso. Preso ao cilindro, ele envia pelo Wi-Fi a própria posição, a bateria, o estado do lacre (fechado, aberto, rompido) e alertas, e obedece a comandos de travar e destravar a válvula. A API do lacre de Natã da Silva Baracho já resolveu boa parte do problema, num servidor próprio: chave por dispositivo, mensagem que não duplica, posição parada que só atualiza o horário, alertas automáticos e comandos buscados e confirmados pelo lacre. Para não contratar um servidor a mais, essas regras passam a morar no FluxID, no mesmo ambiente de teste, e o lacre fala direto com ele. O firmware do lacre, num repositório do responsável pelo produto, será ajustado depois a esta spec.

Cinco pontos tornam a spec delicada:

- **Comando físico não é fato.** O sistema pede a trava; só a confirmação do lacre prova que ela aconteceu. Até lá, o comando fica "pendente" (Constituição, princípio IV; PRD: "nenhuma confirmação física otimista").
- **A posição do lacre é imperfeita.** O GPS oscila mesmo com o cilindro parado, às vezes falta (o lacre repete a última posição conhecida) e às vezes a mensagem atrasa. Perder o sinal deixa o cilindro em estado "degradado", nunca "extraviado" por conta própria (PRD, seção 14).
- **Silêncio também é informação.** Um lacre desligado, sem bateria ou destruído não avisa nada. Só o próprio sistema, verificando sozinho de tempos em tempos, percebe que ele parou de comunicar.
- **O lacre não sabe de que organização é.** A organização vem do cadastro do dispositivo no FluxID, e todo dispositivo, posição, comando e alerta fica isolado por organização.
- **O Wi-Fi só existe onde há rede.** Na viagem, a rede vem de um ponto de acesso no caminhão; no cliente, da rede do cliente. Fora delas o lacre não fala com o FluxID, e um cilindro que sai da geocerca do cliente tende a perder a rede justamente quando precisaria receber o comando de travar. Por isso, nesse caso, o lacre trava sozinho quando o próprio GPS mostra que ele saiu da geocerca, sem travar por uma simples queda da rede do cliente (RN-011). E a troca da rede pelo sistema nunca pode deixar o lacre inalcançável: a rede padrão do firmware fica sempre como reserva.

## Clarifications

### Session 2026-10-16

- Q: Onde fica o endpoint que o ESP32 acessa (na época, pelo GSM) para enviar a posição e receber o comando de trava? → A: **No próprio FluxID, no ambiente de teste que ele já usa** (decidido pelo responsável pelo produto em 16/10/2026, revendo a escolha anterior pela API do lacre): não se contrata nem se publica outro serviço. As regras da API do lacre são trazidas para o FluxID e ela não é publicada.
- Q: Quem decide a violação de geocerca, o lacre ou o FluxID? → A: **O FluxID**, porque é ele que conhece as geocercas e as viagens. O lacre executa o comando de travar e confirma.
- Q: Quando sair da geocerca conta como violação? → A: **Só depois da entrega** (decidido em 16/10/2026): o cilindro entregue passa a ser vigiado pela geocerca da unidade do cliente onde foi entregue, enquanto estiver sob custódia do cliente; a vigilância termina quando ele entra numa nova viagem ou volta ao estoque. Em trânsito e em estoque não há vigilância por geocerca nesta spec.
- Q: Que posição comprova a entrega dentro da geocerca para destravar? → A: **A do lacre ou, na falta dela, a do celular na entrega** (decidido em 16/10/2026): vale primeiro a posição recente e com GPS do lacre; sem ela, vale a posição do celular registrada na entrega com origem "GPS" (Spec 009). Coordenadas digitadas e "no endereço da unidade" não comprovam.
- Q: A viagem pode começar sem a trava física confirmada? → A: **Pode** (decidido em 16/10/2026): a viagem começa, o comando de travar fica pendente e, se não for confirmado no prazo, expira e abre alerta.
- Q: O que acontece quando o lacre envia a posição e ela não mudou? → A: **Não cria registro novo** (decidido em 16/10/2026): a posição que já existe permanece e só o horário de "visto por último" é atualizado. Como o GPS nunca tem precisão total, "não mudou" é estar a até **20 metros** da última posição guardada (decidido em 16/10/2026).
- Q: Quando o lacre é desligado ou para de comunicar, o sistema percebe e avisa sozinho? → A: **Sim, automaticamente** (decidido em 16/10/2026): o sistema verifica sozinho, de tempos em tempos, há quanto tempo cada lacre não se comunica e mostra se ele está funcionando e se a posição está boa. O lacre desligado de propósito avisa antes de desligar; o que some sem avisar é percebido pela falta de comunicação. Os dois casos abrem alerta.

### Session 2026-10-17

- Q: Por qual rede o lacre fala com o FluxID? → A: **Wi-Fi** (o projeto físico mudou, decidido pelo responsável pelo produto em 17/10/2026): sai o módulo GSM (SIM800L). O ESP32 se conecta a uma rede Wi-Fi e por ela envia a posição e recebe os comandos; o resto da estratégia continua igual.
- Q: Como o lacre recebe a primeira rede e como ela é trocada? → A: **Rede padrão no firmware e troca pelo sistema** (17/10/2026): o nome e a senha de uma rede padrão são gravados no firmware. Ligado, o lacre entra nessa rede e alcança o FluxID; pelo sistema, a pessoa autorizada informa a nova rede, que chega ao lacre como um comando, na resposta de um envio.
- Q: A rede padrão também pode ser trocada pelo sistema? → A: **Não; ela é fixa e sempre fica como reserva** (17/10/2026): o sistema altera só as redes de uso (até 5, ver abaixo). Se elas falharem ou sumirem, o lacre volta para a padrão e continua alcançável; mudar a padrão exige regravar o firmware.
- Q: Como o lacre tem Wi-Fi durante a viagem? → A: **Por um ponto de acesso no caminhão** (17/10/2026): um roteador móvel ou o celular do motorista compartilhando a internet, que pode ser a própria rede padrão. O lacre segue comunicando na estrada.
- Q: O cilindro entregue que sai da geocerca do cliente perde o Wi-Fi do cliente. Como ele é travado? → A: **O lacre trava sozinho** (17/10/2026): enquanto o FluxID disser que o cilindro está sob vigilância de geocerca, o lacre que ficar sem falar com o FluxID além do prazo trava por conta própria e avisa quando voltar a se comunicar. É a única exceção à regra de que o FluxID decide os comandos (RN-007, RN-011).
- Q: Com o Wi-Fi, de quanto em quanto tempo o lacre chama o FluxID? → A: **A cada 1 minuto**, no lugar de 5 (decidido pelo responsável pelo produto em 17/10/2026), tanto no envio normal quanto nas novas tentativas. Assim, se o lacre for desligado ou destruído, o sistema percebe em cerca de 1 minuto e envia o alerta de cilindro possivelmente perdido ou extraviado com a última posição lida do lacre.
- Q: Com o envio a cada minuto, os prazos da trava automática e da posição na entrega mudam? → A: **Sim, ficam menores** (decidido em 17/10/2026): a trava automática sob vigilância de geocerca passa de 15 para **3 minutos** sem resposta do FluxID (três envios seguidos perdidos, para não travar por uma falha curta do Wi-Fi), e a posição do lacre que comprova a entrega passa a valer por **2 minutos**, no lugar de 5.
- Q: Quantas redes Wi-Fi configuradas pelo sistema o lacre guarda, além da padrão? → A: **Uma lista de até 5** (17/10/2026): o lacre tenta, entre as redes conhecidas ao alcance, a de sinal mais forte e, se nenhuma funcionar, a padrão. O sistema adiciona e remove redes da lista, cobrindo o depósito, os caminhões e os clientes sem exigir o mesmo nome de rede em todos os lugares.
- Q: O alerta de cilindro possivelmente perdido ou extraviado é enviado para fora do sistema? → A: **Sim, como notificação do aplicativo instalado** (push do PWA, 17/10/2026): além da lista de alertas, chega ao celular ou computador de quem tem permissão e ativou as notificações, mesmo com o FluxID fechado. E-mail continua fora desta spec.
- Q: O firmware do ESP32 é escrito e entregue dentro desta spec? → A: **Sim** (decidido pelo responsável pelo produto em 17/10/2026, revendo a resposta anterior, que deixava o firmware para uma Spec 013): ao final desta spec existe, na pasta `firmware/` do repositório, um firmware de ESP32 que se conecta pelo Wi-Fi, envia a posição do lacre ao FluxID a cada minuto, executa e confirma os comandos de trava e de rede e avisa o desligamento. No sistema, a posição aparece em tempo real; o lacre desligado vira, em cerca de 1 minuto, o aviso de cilindro possivelmente extraviado com a última localização; a saída da geocerca gera a violação; e a trava e os demais alertas seguem as regras desta spec. O contrato das mensagens continua documentado e testado com o simulador, e a validação humana usa o lacre físico.
- Q: Se o lacre fica sem Wi-Fi por mais de 30 minutos na viagem, o que acontece com o comando de travar que ele ainda não recebeu? → A: **Continua pendente enquanto o motivo valer** (17/10/2026): o comando de travar ou destravar não entregue não expira enquanto a viagem estiver em andamento, a violação aberta ou a entrega válida; depois de 30 minutos sem entrega ele abre um alerta, e o lacre o recebe quando voltar a comunicar. Só expira o comando entregue e não confirmado em 10 minutos. Os comandos de rede continuam expirando em 30 minutos, para a senha ser apagada.
- Q: Na entrega dentro da geocerca, o sistema manda destravar mesmo quando a trava nunca foi confirmada pelo lacre? → A: **Sim** (17/10/2026): na entrega comprovada dentro da geocerca, o comando de destravar é criado sempre que a trava não estiver confirmada como "destravada" (travada, não confirmada ou com travar pendente); o travar pendente é cancelado e o evento registra que a trava anterior não tinha confirmação.
- Q: O alerta de possível extravio, com notificação push, vale para qualquer lacre que fique 90 segundos sem comunicar, inclusive no estoque? → A: **Não, só em viagem ou sob vigilância de geocerca** (17/10/2026): o alerta de possível extravio, com push, vale só para o cilindro em viagem em andamento ou sob vigilância de geocerca. Nos demais casos (estoque, sem vínculo), o lacre passa a "sem comunicação" ou "desligado" na saúde e abre um alerta de severidade média só na lista, sem push, para que uma queda do Wi-Fi do depósito não dispare notificações em massa.
- Q: Se o Wi-Fi do cliente cair, todos os lacres dos cilindros entregues ali travam sozinhos depois de 3 minutos? → A: **Não; o lacre só trava sozinho se o próprio GPS mostrar que ele saiu da geocerca** (17/10/2026): quando a vigilância começa, o FluxID envia ao lacre a geocerca da unidade. Sem comunicação por mais de 3 minutos, o lacre compara as próprias posições com GPS com essa geocerca e só trava com duas posições seguidas fora dela, além da tolerância de 50 metros. Parado dentro da área, ou sem GPS, ele não trava, e o FluxID registra "sem comunicação" normalmente.

## Objetivos

- O lacre envia a posição pelo Wi-Fi a um endpoint do FluxID e recebe, na mesma conversa, o comando de trava que estiver pendente.
- Cada posição é guardada uma vez, por organização, e posições repetidas (a até 20 metros da anterior) só atualizam o horário de "visto por último".
- Quem acompanha a operação vê, em tempo real, onde está cada cilindro com lacre e se o lacre está funcionando, com posição boa, sem GPS, sem comunicação ou desligado.
- O sistema percebe sozinho o lacre que parou de comunicar e abre alerta, sem depender de ninguém olhar a tela.
- Ao iniciar a viagem, o lacre de cada cilindro recebe o comando de travar; depois da entrega correta, dentro da geocerca do cliente, recebe o de destravar; se o cilindro entregue sair da geocerca, recebe o de travar e o sistema abre alerta de violação.
- Todo comando tem estado explícito e só a confirmação do lacre muda o estado da trava.
- A rede Wi-Fi do lacre é trocada pelo próprio sistema, sem regravar o firmware e sem risco de perder o lacre, porque a rede padrão continua de reserva.
- O cilindro entregue que sai do alcance do FluxID sob vigilância de geocerca é travado pelo próprio lacre.
- Ao final da spec, um lacre físico com ESP32 e o firmware desta spec funciona de ponta a ponta com o FluxID: posição em tempo real, aviso de possível extravio em cerca de 1 minuto quando é desligado, violação de geocerca, trava e alertas.
- Toda ação sensível exige permissão e gera auditoria, e nada de uma organização aparece para outra.

## Atores

- **Gestor logístico**: acompanha as viagens no mapa, vê alertas e aciona travar ou destravar em caso excepcional.
- **Operador de estoque**: vincula o lacre ao cilindro e confere se o lacre está funcionando antes da carga.
- **Administrador do tenant**: cadastra e desativa dispositivos, gera a chave de cada um, troca a rede Wi-Fi dos lacres e tem todas as permissões de lacre.
- **Auditor do tenant**: só consulta posições, comandos, violações, alertas e a saúde dos lacres.
- **Lacre (dispositivo ESP32)**: envia posição, bateria, estado, a rede em uso e alertas pelo Wi-Fi; recebe, executa e confirma os comandos, inclusive a troca de rede; avisa quando é ligado e quando vai ser desligado; trava sozinho quando, sob vigilância de geocerca, perde o FluxID e o próprio GPS mostra que saiu da geocerca.
- **Ponto de acesso do caminhão**: roteador móvel ou celular do motorista que dá Wi-Fi ao lacre durante a viagem.
- **Verificação automática do sistema**: rotina do FluxID que roda sozinha de tempos em tempos para conferir a comunicação dos lacres e os prazos dos comandos.
- **Responsável pelo produto**: fornece o lacre físico (ESP32-C3, GPS e solenoide) e a rede padrão, e acompanha o firmware, que é entregue nesta spec na pasta `firmware/`.
- **Natã da Silva Baracho**: autor da API do lacre usada como referência e validador oficial da validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — O lacre envia a posição e o sistema mostra onde o cilindro está (Prioridade: P1)

O lacre preso a um cilindro acessa pelo Wi-Fi o endpoint do FluxID, se identifica com a chave do dispositivo e envia a posição. O FluxID identifica o dispositivo, a organização e o cilindro vinculado e guarda a posição. Se o cilindro não se moveu (a até 20 metros da última posição guardada), nenhuma posição nova é criada: só o horário de "visto por último" é atualizado. Na resposta, o lacre recebe o comando pendente, se houver. No detalhe do cilindro e no da viagem, a pessoa vê a última posição no mapa, há quanto tempo foi recebida, se veio com GPS, a bateria e o estado do lacre, e a tela se atualiza sozinha.

**Por que esta prioridade**: é a base de todo o resto. Sem posição guardada, não há geocerca nem trava automática.

**Teste independente**: com um simulador de lacre enviando posições de dois lacres de organizações diferentes, inclusive posições repetidas, confirmar que cada posição foi guardada uma vez só, na organização certa, que as repetidas só atualizaram o horário e que a outra organização não vê nada.

**Cenários de aceitação**:

1. **Dado** um lacre ativo vinculado a um cilindro, **quando** ele envia uma posição com a chave certa, **então** ela é guardada com o cilindro, a organização, o horário da leitura, o horário de recebimento, a qualidade (com GPS ou última conhecida), a bateria e o estado do lacre, e a resposta confirma o recebimento.
2. **Dado** o lacre parado no mesmo lugar, **quando** chega uma posição a até 20 metros da última guardada, com a mesma qualidade e o mesmo estado do lacre, **então** nenhuma posição nova é criada e a existente só tem o horário de "visto por último" atualizado.
3. **Dado** o lacre parado há horas, enviando a posição a cada poucos minutos, **quando** a pessoa consulta o histórico de posições, **então** vê um único registro para aquele ponto, com o horário da primeira leitura e o de "visto por último".
4. **Dado** o cilindro que se moveu mais de 20 metros, ou o lacre que mudou de estado ou perdeu o GPS, **quando** chega a posição, **então** uma posição nova é guardada.
5. **Dado** a mesma mensagem enviada duas vezes (o lacre não recebeu a resposta e reenviou), **quando** ela chega de novo, **então** nenhuma posição nova é criada e a resposta é "já recebida".
6. **Dado** uma pessoa com a permissão de ver lacres, **quando** ela abre o detalhe do cilindro, **então** vê a última posição no mapa, a idade dela em texto ("há 2 minutos"), a qualidade, a bateria, o estado do lacre e a saúde do lacre (História 6).
7. **Dado** a pessoa com o detalhe aberto, **quando** chega posição nova, **então** a tela se atualiza sozinha e anuncia a mudança a leitores de tela sem roubar o foco.
8. **Dado** um envio sem chave, com chave errada ou de dispositivo inativo, **quando** ele chega, **então** é recusado sem revelar o motivo exato; o envio de um lacre ativo sem vínculo com cilindro é guardado só no dispositivo.
9. **Dado** uma pessoa do Tenant B, **quando** ela tenta ver as posições de um cilindro do Tenant A, por tela ou pedido direto, **então** recebe a mesma resposta de cilindro inexistente.

---

### História 2 — Travar o lacre quando o cilindro entra em viagem (Prioridade: P1)

Quando a viagem é iniciada (Spec 008), cada cilindro "em trânsito" com lacre vinculado recebe um comando de travar. O comando fica "pendente", passa a "entregue ao lacre" quando o lacre o recebe na resposta de um envio e a "confirmado" quando o lacre avisa que travou. Só então a trava física aparece como "travada". A viagem e o gestor veem, cilindro por cilindro, o estado do comando e da trava.

**Por que esta prioridade**: é a razão de existir do lacre: impedir que o gás seja usado ou desviado no caminho.

**Teste independente**: iniciar uma viagem com três cilindros com lacre e um sem lacre; confirmar que saem três comandos de travar, que cada lacre simulado recebe o seu na próxima comunicação, que o cilindro sem lacre fica só com o bloqueio lógico e marcado "sem lacre" e que a trava só aparece como "travada" depois da confirmação simulada.

**Cenários de aceitação**:

1. **Dado** uma viagem iniciada com cilindros que têm lacre ativo, **quando** a viagem passa a "em andamento", **então** é criado um comando de travar por lacre, com origem "início da viagem", e o evento da viagem registra isso.
2. **Dado** um comando de travar pendente, **quando** o lacre se comunica, **então** recebe o comando na resposta e o comando passa a "entregue ao lacre".
3. **Dado** um comando entregue, **quando** o lacre confirma "executado", **então** a trava física do cilindro passa a "travada" e o evento guarda o horário da confirmação.
4. **Dado** um comando de travar, **quando** o lacre responde "erro", **então** a trava fica "não confirmada", abre um alerta com o motivo e o gestor pode pedir de novo.
5. **Dado** um comando entregue ao lacre e sem confirmação, **quando** passam 10 minutos, **então** a verificação automática o marca "expirado", a trava fica "não confirmada" e abre um alerta; a viagem segue em andamento, porque o início não espera a confirmação da trava.
6. **Dado** um cilindro da viagem sem lacre vinculado, **quando** a viagem começa, **então** ele segue só com o bloqueio lógico da Spec 008 e aparece como "sem lacre".
7. **Dado** o mesmo pedido de início repetido (duplo clique ou reenvio), **quando** ele chega de novo, **então** nenhum comando é duplicado.
8. **Dado** um comando de travar que o lacre sem Wi-Fi ainda não recebeu, **quando** passam 30 minutos com a viagem em andamento, **então** o comando continua pendente, sem expirar, a trava aparece "não confirmada" e abre um alerta; quando o lacre volta a comunicar, recebe o comando na resposta e o alerta registra a entrega.

---

### História 3 — Destravar depois da entrega correta dentro da geocerca do cliente (Prioridade: P1)

Na entrega (Spec 008), quando o cilindro é registrado como "entregue" numa parada e a posição confirma que ele está dentro da geocerca da unidade do cliente, o sistema cria o comando de destravar, que o lacre recebe na próxima comunicação. A trava passa a "destravada" só depois da confirmação do lacre. Se a posição não confirmar que o cilindro está dentro da geocerca, o destravamento não é automático: a tela explica o motivo e oferece o destravamento excepcional da Spec 008, com justificativa e verificação em duas etapas.

**Por que esta prioridade**: fecha o ciclo da entrega. Sem o destravamento, o cliente recebe um cilindro que não consegue usar.

**Teste independente**: registrar a entrega de dois cilindros, um com o lacre dentro da geocerca da unidade e outro fora; confirmar que só o primeiro recebe o comando de destravar automaticamente e que o segundo exige o destravamento excepcional.

**Cenários de aceitação**:

1. **Dado** um cilindro com trava "travada" ou "não confirmada", entregue numa parada cuja unidade tem geocerca ativa, **quando** a entrega é salva e a posição do lacre, recente e com GPS, está dentro da geocerca, **então** é criado um comando de destravar com origem "entrega", e o desbloqueio lógico da Spec 008 é registrado junto.
2. **Dado** o lacre sem posição recente com GPS e a entrega registrada com a posição do celular por GPS dentro da geocerca, **quando** a entrega é salva, **então** o comando de destravar é criado e o evento registra que a comprovação veio do celular.
3. **Dado** o comando de destravar confirmado pelo lacre, **quando** a confirmação chega, **então** a trava física passa a "destravada" e o histórico do cilindro registra a entrega e o destravamento.
4. **Dado** a posição fora da geocerca, sem posição que comprove ou sem geocerca ativa na unidade, **quando** a entrega é salva, **então** a entrega continua aceita e destacada (Spec 008, RF-016), mas nenhum comando de destravar é criado e a tela explica o motivo.
5. **Dado** um caso sem destravamento automático, **quando** o gestor usa o destravamento excepcional, **então** ele exige justificativa e verificação em duas etapas (Spec 008), cria o comando de destravar com origem "excepcional" e gera auditoria.
6. **Dado** um cilindro marcado "não entregue", **quando** a entrega é salva, **então** nenhum comando de destravar é criado e o lacre continua travado.
7. **Dado** a correção de uma entrega (Spec 008) que muda o cilindro para "não entregue" depois do destravamento, **quando** a correção é salva, **então** é criado um comando de travar com origem "correção da entrega".
8. **Dado** um cilindro cujo comando de travar ainda está pendente ou cuja trava ficou "não confirmada", **quando** a entrega dentro da geocerca é salva, **então** o travar pendente é cancelado com o motivo, é criado o comando de destravar com origem "entrega" e o evento registra que a trava anterior não tinha confirmação.

---

### História 4 — Violação de geocerca: travar, registrar e alertar (Prioridade: P1)

Depois de entregue, o cilindro passa a ser vigiado pela geocerca da unidade do cliente onde foi entregue, enquanto estiver sob custódia do cliente. Cada posição recebida nesse período é comparada com essa geocerca. Se o cilindro sair dela, o sistema registra a violação, cria o comando de travar com origem "violação de geocerca", que o lacre recebe na resposta da mesma comunicação ou da seguinte, e abre um alerta para o gestor. Quando o lacre confirma, o cilindro aparece como "travado por violação de geocerca".

Em trânsito e em estoque não há vigilância por geocerca nesta spec: na viagem, a proteção é a trava aplicada no início (História 2).

**Por que esta prioridade**: é a proteção contra desvio e uso indevido pedida pelo responsável pelo produto.

**Teste independente**: com um cilindro entregue e destravado dentro da geocerca de um cliente, enviar duas posições com GPS fora da geocerca e confirmar a violação, o comando de travar entregue ao lacre, o alerta e, após a confirmação simulada, o estado "travado por violação".

**Cenários de aceitação**:

1. **Dado** um cilindro entregue, sob custódia do cliente, **quando** chegam duas posições com GPS seguidas fora da geocerca, além da tolerância, **então** é registrada uma violação com o horário, a posição, a geocerca e a distância até ela.
2. **Dado** a violação registrada, **quando** o cilindro tem lacre ativo e não está travado, **então** é criado um comando de travar com origem "violação de geocerca", entregue ao lacre na resposta, e é aberto um alerta de severidade alta.
3. **Dado** o comando confirmado pelo lacre, **quando** a confirmação chega, **então** o cilindro aparece "travado por violação de geocerca" e o alerta mostra a confirmação.
4. **Dado** uma posição sem GPS (última posição conhecida), **quando** ela está fora da geocerca, **então** nenhuma violação é aberta por ela sozinha.
5. **Dado** uma única posição com GPS fora da geocerca, logo seguida de posições dentro, **quando** o desvio é menor que a tolerância, **então** não há violação (oscilação do GPS na borda).
6. **Dado** um cilindro com violação aberta, **quando** chegam mais posições fora da geocerca, **então** nenhuma violação nova nem comando novo é criado, e a violação existente guarda a última posição.
7. **Dado** um cilindro travado por violação, **quando** ele volta para dentro da geocerca, **então** a violação fica "retornou à área", o alerta continua aberto até o gestor encerrar e o lacre **não** é destravado sozinho.
8. **Dado** o gestor que encerra o alerta, **quando** ele decide destravar, **então** o destravamento exige justificativa e verificação em duas etapas e gera auditoria.
9. **Dado** um cilindro sob vigilância de geocerca cujo lacre perdeu a rede, **quando** ele passa do prazo sem falar com o FluxID e duas posições seguidas do próprio GPS ficam fora da geocerca recebida, além da tolerância, **então** o próprio lacre trava a válvula; ao voltar a se comunicar, ele informa a trava com o horário e as leituras guardadas, o cilindro aparece "travado por perda de comunicação" e é aberto um alerta de severidade alta.
10. **Dado** o Wi-Fi do cliente fora do ar com os cilindros parados dentro da geocerca, **quando** passam mais de 3 minutos sem comunicação, **então** nenhum lacre trava sozinho; o FluxID mostra "sem comunicação" e abre o alerta de possível extravio (RF-014), e, quando a rede volta, a saúde volta a "funcionando" sem nenhum destravamento a fazer.
10. **Dado** um lacre que travou sozinho e cujas leituras guardadas mostram a saída da geocerca, **quando** elas chegam, **então** o FluxID registra também a violação (RF-019 a RF-021), sem criar um segundo comando de travar.
11. **Dado** um lacre que travou sozinho, **quando** ele volta a se comunicar dentro da geocerca, **então** ele **não** é destravado automaticamente: o destravamento é manual, com justificativa e verificação em duas etapas (RN-005).

---

### História 5 — Cadastrar o dispositivo e vincular o lacre ao cilindro (Prioridade: P2)

O administrador cadastra o dispositivo do lacre na organização. O sistema gera a chave do dispositivo, mostra-a uma única vez para gravar no firmware e guarda só a forma protegida dela. Quando o lacre é ligado e avisa que está ativo, ele aparece na lista de lacres ativos da organização, pronto para vínculo. O operador vincula o lacre ao cilindro, lendo o identificador do cilindro (Spec 009) ou escolhendo da lista. O vínculo passa a valer para toda mensagem daquele lacre e é desfeito ao trocar o lacre ou desativá-lo.

**Por que esta prioridade**: é pré-requisito operacional das histórias 1 a 4, mas, nos testes, pode ser preparado por dados de exemplo.

**Teste independente**: cadastrar um dispositivo, simular a ativação do lacre, vincular a um cilindro e confirmar que a próxima posição aparece naquele cilindro; desvincular e confirmar que a seguinte não aparece mais.

**Cenários de aceitação**:

1. **Dado** um administrador, **quando** ele cadastra um dispositivo, **então** a chave aparece uma única vez, com a ação de copiar, e nunca mais pode ser lida; o cadastro gera auditoria sem a chave.
2. **Dado** um lacre que avisou a ativação, **quando** o operador abre a lista de lacres ativos sem cilindro, **então** ele aparece com o horário da ativação, a bateria e a última posição.
3. **Dado** um lacre ativo e um cilindro ativo da mesma organização, **quando** o operador os vincula, **então** o vínculo é registrado com quem e quando, e as próximas mensagens do lacre passam a valer para aquele cilindro.
4. **Dado** um cilindro que já tem lacre ou um lacre que já tem cilindro, **quando** alguém tenta um segundo vínculo, **então** o pedido é recusado com o motivo; para trocar, é preciso encerrar o vínculo atual.
5. **Dado** um cilindro em viagem em andamento, **quando** alguém tenta encerrar o vínculo, **então** o pedido é recusado enquanto a viagem estiver em andamento.
6. **Dado** o administrador que desativa o dispositivo, **quando** ele informa a justificativa e salva, **então** os envios seguintes daquele lacre são recusados.
7. **Dado** o administrador que gera uma chave nova para o dispositivo, **quando** ele informa a justificativa e salva, **então** a chave antiga deixa de valer na hora e a nova aparece uma única vez.

---

### História 6 — Saber se o lacre está funcionando, mesmo quando ele para de comunicar (Prioridade: P1)

O sistema verifica sozinho, a cada minuto, há quanto tempo cada lacre não se comunica e se a posição dele está boa. O gestor vê, numa tela de lacres e no detalhe do cilindro, a saúde de cada lacre: **funcionando** (comunicando, com posição por GPS), **sem GPS** (comunicando, mas só com a última posição conhecida), **bateria baixa**, **sem comunicação** (deixou de enviar sem avisar) ou **desligado** (avisou que ia desligar). Se o lacre for desligado de propósito, ele avisa antes, e o sistema abre o alerta na hora. Em viagem ou sob vigilância de geocerca, o alerta é de possível extravio, com notificação; no estoque, é um alerta de severidade média só na lista. Se ele parar sem avisar (bateria acabou, foi destruído, perdeu o sinal), a verificação automática percebe a falta de comunicação e abre o alerta. Quando o lacre volta a comunicar, a saúde volta a "funcionando" e o alerta mostra a volta.

**Por que esta prioridade**: o responsável pelo produto quer ser avisado automaticamente quando um lacre deixa de funcionar; é a proteção contra o lacre desligado para burlar a trava e a geocerca.

**Teste independente**: com o simulador, fazer um lacre avisar que vai desligar, outro parar de enviar sem avisar e um terceiro enviar só posições sem GPS; confirmar, sem nenhuma ação humana, os estados "desligado", "sem comunicação" e "sem GPS", os alertas correspondentes e a volta a "funcionando" quando o lacre volta a enviar.

**Cenários de aceitação**:

1. **Dado** um lacre que avisa que vai ser desligado, **quando** o aviso chega, **então** a saúde passa a "desligado" na hora; se o cilindro estiver em viagem ou sob vigilância de geocerca, abre o alerta de cilindro possivelmente extraviado, de severidade alta e com notificação; nos demais casos, abre um alerta de severidade média só na lista, sem notificação.
2. **Dado** um lacre que parou de enviar sem avisar, **quando** ele deixa de fazer o envio esperado (mais de um intervalo de envio e 30 segundos de folga sem comunicação, ou seja, 90 segundos no padrão de 1 minuto), **então** a primeira verificação automática seguinte marca "sem comunicação" e, se o cilindro estiver em viagem ou sob vigilância de geocerca, abre o alerta de cilindro possivelmente perdido ou extraviado, com a última posição lida do lacre (no mapa e em texto), o horário e a qualidade dela, sem que ninguém precise abrir a tela.
3. **Dado** um lacre "sem comunicação", **quando** o cilindro está em viagem ou sob vigilância de geocerca, **então** o alerta de possível extravio tem severidade alta e gera notificação; nos demais casos (estoque, lacre sem vínculo), abre um alerta de "sem comunicação" de severidade média só na lista, sem notificação.
4. **Dado** um lacre comunicando, **quando** as posições chegam sem GPS por mais de três intervalos seguidos (3 minutos no padrão), **então** a saúde passa a "sem GPS" e abre um alerta de severidade média.
5. **Dado** um lacre "sem comunicação", "desligado" ou "sem GPS", **quando** ele volta a enviar posição com GPS, **então** a saúde volta a "funcionando", o alerta registra a volta e continua aberto até o gestor encerrar.
6. **Dado** qualquer estado de saúde, **quando** ele muda, **então** a situação do cilindro **nunca** passa a "extraviado" sozinha: o alerta avisa o possível extravio com a última posição, e só uma pessoa, depois de conferir, muda a situação; a trava continua no último estado confirmado.
7. **Dado** a tela de lacres aberta, **quando** a saúde de um lacre muda, **então** a tela se atualiza sozinha e anuncia a mudança a leitores de tela.
8. **Dado** um alerta recebido do lacre (bateria baixa, sinal fraco, lacre aberto ou rompido), **quando** ele chega, **então** aparece na lista com tipo, severidade, cilindro, lacre e horário, sem duplicar se chegar de novo.
9. **Dado** um alerta aberto, **quando** o gestor o encerra, **então** o encerramento exige observação, registra quem e quando e gera auditoria.

---

### História 7 — Configurar as redes Wi-Fi do lacre pelo sistema (Prioridade: P2)

O firmware sai com o nome e a senha de uma **rede padrão**. Ao ser ligado, o lacre entra nela e alcança o FluxID. Além dela, o lacre guarda uma **lista de até 5 redes configuradas** pelo sistema (por exemplo, a do depósito, a dos caminhões e a do cliente). No detalhe do dispositivo, o administrador vê a rede que o lacre está usando, se é a padrão ou uma da lista, a força do sinal e a lista de redes guardadas (só os nomes). Para adicionar uma rede, ele informa o nome e a senha. O sistema cria um comando de adicionar rede, que o lacre recebe na resposta do próximo envio. O lacre testa a nova rede e só confirma depois de falar com o FluxID por ela; se não conseguir no prazo, volta para a rede em que estava, não guarda a nova e informa o erro. Em uso normal, o lacre escolhe, entre as redes conhecidas ao alcance, a de sinal mais forte e, se nenhuma der acesso ao FluxID, usa a padrão, que nunca é apagada. O administrador também pode remover uma rede da lista ou pedir "voltar só para a rede padrão", que esvazia a lista.

**Por que esta prioridade**: sem a troca pelo sistema, mudar de rede exigiria regravar o firmware de cada lacre. Nos testes, o lacre simulado pode já começar na rede padrão.

**Teste independente**: com o simulador, adicionar uma rede que funciona e confirmar que ela entra na lista e o lacre passa a usá-la; adicionar uma rede com senha errada e confirmar o erro, que ela não entra na lista e que o lacre continua comunicando; tentar uma sexta rede e confirmar a recusa; conferir que a senha não aparece em nenhuma tela, resposta de consulta, log ou auditoria.

**Cenários de aceitação**:

1. **Dado** um lacre comunicando, **quando** o administrador abre o detalhe do dispositivo, **então** vê o nome da rede em uso, se é a padrão ou uma da lista, a força do sinal, o horário da última comunicação e os nomes das redes guardadas no lacre; nenhuma senha aparece.
2. **Dado** o administrador que informa o nome e a senha de uma nova rede, **quando** ele salva, **então** é criado um comando de adicionar rede pendente, com auditoria que registra o nome da rede, mas nunca a senha; se o nome já está na lista, o comando substitui a senha guardada daquela rede.
3. **Dado** o comando de adicionar rede pendente, **quando** o lacre se comunica, **então** recebe a nova rede na resposta e o comando passa a "entregue ao lacre".
4. **Dado** o lacre que conseguiu falar com o FluxID pela nova rede, **quando** ele confirma, **então** o comando fica "confirmado", a rede aparece na lista do dispositivo e a senha é apagada do FluxID.
5. **Dado** o lacre que não conseguiu entrar na nova rede ou, nela, não alcançou o FluxID no prazo, **quando** ele volta para a rede em que estava, **então** não guarda a nova rede, confirma com "erro" e o motivo (rede não encontrada, senha recusada ou sem internet), o comando fica "com erro", a senha é apagada do FluxID e é aberto um alerta de severidade média.
6. **Dado** o lacre usando uma rede da lista, **quando** ela some ou deixa de dar acesso ao FluxID, **então** o lacre passa sozinho para outra rede conhecida ao alcance, a de sinal mais forte, ou, sem nenhuma, para a rede padrão e, ao se comunicar, informa a mudança, que aparece no detalhe do dispositivo.
7. **Dado** o administrador que remove uma rede da lista ou pede "voltar só para a rede padrão", **quando** o lacre confirma, **então** a rede (ou a lista inteira) é apagada do lacre; se era a rede em uso, ele passa para outra conhecida ou para a padrão.
8. **Dado** a lista com 5 redes, **quando** o administrador tenta adicionar outra, **então** o pedido é recusado com o motivo, e ele precisa remover uma antes.
9. **Dado** um comando de adicionar rede não entregue no prazo (RF-028), **quando** ele expira, **então** a senha é apagada do FluxID, sem que ela tenha saído para o lacre.
10. **Dado** um cilindro numa viagem em andamento ou sob vigilância de geocerca, **quando** alguém pede para adicionar ou remover uma rede do lacre dele, **então** o sistema avisa que o lacre pode ficar sem comunicar durante a troca e pede confirmação.
11. **Dado** uma pessoa sem a permissão de administrar dispositivos ou de outra organização, **quando** ela tenta ver ou alterar as redes de um lacre, **então** o pedido é recusado, e o lacre de outra organização recebe a mesma resposta de inexistente.

---

### História 8 — Lacre físico de ponta a ponta com o firmware desta spec (Prioridade: P1)

Ao final desta spec, o lacre físico (ESP32-C3 com GPS e solenoide) roda o firmware da pasta `firmware/`. Ligado, ele entra na rede padrão, alcança o FluxID por conexão segura e, a cada minuto, envia a posição, a bateria, o estado e a rede em uso. Quem acompanha vê o cilindro se mover no mapa em tempo real. Se o lacre de um cilindro em viagem ou sob vigilância de geocerca for desligado, o FluxID mostra em cerca de 1 minuto que o cilindro está possivelmente extraviado, com a última localização lida. Se o cilindro entregue sair da geocerca do cliente, o sistema registra a violação, manda travar e alerta. Os comandos de trava, a troca de rede e os demais alertas funcionam como nas histórias 2 a 7.

**Por que esta prioridade**: é a prova, pedida pelo responsável pelo produto, de que o lacre real funciona com o sistema, e não só o simulador.

**Teste independente**: na bancada e numa volta curta a pé ou de carro, com um lacre físico vinculado a um cilindro de teste e uma geocerca de cliente desenhada perto do ponto de partida, conferir cada cenário abaixo no sistema, cronometrando os tempos.

**Cenários de aceitação**:

1. **Dado** o lacre gravado com o firmware desta spec e a rede padrão ao alcance, **quando** ele é ligado, **então** avisa a ativação, aparece na lista de lacres ativos da organização e, depois de vinculado, envia a posição a cada minuto pela conexão segura.
2. **Dado** o lacre vinculado e em movimento, **quando** ele envia uma posição, **então** ela aparece no mapa do detalhe do cilindro e da viagem em até 10 segundos, sem recarregar a tela.
3. **Dado** o lacre parado, **quando** passam 10 minutos, **então** o histórico mostra uma única posição, com o horário de "visto por último" atualizado a cada minuto.
4. **Dado** o lacre de um cilindro em viagem ou sob vigilância de geocerca, desligado pelo botão ou chave de energia, **quando** ele consegue avisar o desligamento, **então** o aviso de cilindro possivelmente extraviado, com a última localização, aparece no sistema e como notificação na hora.
5. **Dado** o lacre de um cilindro em viagem ou sob vigilância de geocerca que perde a energia de repente (bateria retirada), **quando** passa o envio esperado sem comunicação, **então** o mesmo aviso aparece no sistema e como notificação em até 1 minuto depois do envio que não chegou.
6. **Dado** o lacre vinculado a um cilindro numa viagem iniciada, **quando** ele se comunica, **então** recebe o comando de travar, aciona a solenoide e confirma, e o sistema mostra "travada" só depois da confirmação.
7. **Dado** o cilindro entregue dentro da geocerca e destravado, **quando** o lacre é levado para fora dela, **então** o sistema registra a violação, o lacre recebe o comando de travar, trava e confirma, e o alerta e a notificação aparecem.
8. **Dado** o cilindro sob vigilância de geocerca levado para fora da geocerca, **quando** o lacre fica sem nenhuma rede conhecida por mais de 3 minutos e o próprio GPS mostra duas posições seguidas fora da área, **então** ele trava sozinho e, ao voltar a uma rede, informa a trava e envia as leituras guardadas, que aparecem no histórico na ordem certa.
9. **Dado** o administrador que adiciona uma rede pelo sistema, **quando** o lacre a recebe, **então** ele entra nela, confirma e o sistema mostra a rede nova em uso; com senha errada, ele volta para a rede anterior e informa o erro.
10. **Dado** o firmware no repositório, **quando** alguém procura a chave do dispositivo ou a senha de rede, **então** não as encontra: elas ficam num arquivo local fora do controle de versão, com um modelo de exemplo sem valores reais.

---

### Casos de borda

- Lacre sem Wi-Fi por um tempo (fora do alcance da rede, ponto de acesso do caminhão desligado ou sem internet): guarda as leituras e as envia juntas quando o sinal volta. As posições são ordenadas pelo horário da leitura; a mais antiga não substitui a mais nova nem dispara violação com dado velho, e o comando de travar por violação só sai se a última posição ainda estiver fora.
- Comando de trava para lacre sem comunicação: fica pendente enquanto o motivo valer (viagem em andamento, violação aberta ou entrega válida) e abre alerta depois de 30 minutos; deixa de valer quando a viagem termina ou é cancelada, o vínculo é encerrado, o dispositivo é desativado ou um comando mais novo o cancela (RF-029); nunca é dado como executado.
- Comandos opostos em sequência (travar e destravar): vale o mais recente; o anterior ainda pendente é cancelado com o motivo, e a confirmação de um comando cancelado é registrada sem mudar o estado da trava.
- Confirmação de comando desconhecido, de outro lacre ou de outra organização: é recusada e registrada, sem efeito.
- Lacre informa "aberto" ou "rompido" estando travado pelo sistema: alerta de severidade crítica, sem mudar a situação da viagem.
- Lacre que envia muito mais do que o intervalo combinado (defeito ou ataque): os envios acima do limite por minuto são recusados e geram um alerta; a recusa não perde mensagens que o lacre reenviar depois.
- Queda do Wi-Fi do depósito ou roteador desligado à noite: os lacres dos cilindros em estoque passam a "sem comunicação" com alerta de severidade média só na lista, sem notificação e sem alerta de possível extravio; ao voltar a rede, a saúde volta a "funcionando".
- Muitas chaves erradas vindas do mesmo endereço: os pedidos são barrados por um tempo, sem revelar se o dispositivo existe.
- Posição de um lacre parado oscilando perto do limite de 20 metros: cada vez que passa do limite, nasce uma posição nova; a comparação é sempre com a última posição guardada, não com a última recebida.
- Geocerca editada ou inativada enquanto o cilindro está no cliente (Spec 007): vale a geocerca ativa no momento de cada posição; se a unidade ficar sem geocerca ativa, a vigilância é suspensa e abre um alerta de severidade média.
- Cilindro entregue em unidade sem geocerca ativa: não há destravamento automático nem vigilância; a tela explica o motivo.
- Cilindro recolhido no cliente por uma nova viagem: ao iniciar essa viagem, a vigilância da geocerca do cliente termina e não gera violação.
- Unidade de cliente com mais de uma geocerca: dentro de qualquer uma conta como dentro (mesma regra da Spec 008); a borda conta como dentro.
- Cilindro inativado (Spec 006) com lacre vinculado: o vínculo é encerrado junto.
- Viagem cancelada com cilindros travados: os cilindros devolvidos ao estoque recebem o comando de destravar com origem "cancelamento da viagem".
- Notificação a um aparelho desligado ou sem internet: o serviço de notificação do navegador entrega quando o aparelho volta; se ela chegar depois de o alerta ser encerrado, ao tocar nela o FluxID mostra o alerta já encerrado.
- Pessoa com notificações ativadas em vários aparelhos: cada aparelho recebe uma vez; desativar em um não desativa nos outros.
- No iPhone, as notificações só funcionam com o FluxID instalado na tela de início; a tela explica isso quando o navegador não oferece notificações.
- O FluxID fora do ar: o lacre não recebe resposta, guarda as leituras e reenvia depois; como cada mensagem tem identificador único, o reenvio não duplica nada. Sob vigilância de geocerca, o FluxID fora do ar também conta para a trava automática, que só acontece se o próprio GPS do lacre mostrar que ele saiu da geocerca (RN-011); ela é informada quando a comunicação volta.
- Wi-Fi do cliente fora do ar (roteador desligado à noite, internet caída): os lacres parados dentro da geocerca não travam sozinhos; ficam "sem comunicação" até a rede voltar.
- Geocerca da unidade editada ou inativada durante a vigilância: o FluxID envia a versão nova ao lacre na resposta seguinte; até recebê-la, o lacre usa a última que recebeu.
- Ponto de acesso do caminhão desligado no meio da viagem: o lacre já está travado desde o início da viagem; ele tenta a rede configurada e a padrão, guarda as leituras e, passado o limite, aparece "sem comunicação" com alerta de severidade alta.
- Duas alterações de rede pedidas em sequência para o mesmo lacre: são entregues uma de cada vez, na ordem; um novo pedido para a mesma rede cancela o anterior ainda pendente, e a senha dele é apagada.
- Duas redes da lista ao alcance com sinal parecido: o lacre fica na que está usando enquanto ela der acesso ao FluxID, para não alternar a cada envio.
- Nome de rede com acento, espaço ou símbolo, ou rede aberta sem senha: são aceitos; o tamanho máximo segue o padrão Wi-Fi (32 caracteres no nome e de 8 a 63 na senha, quando houver).
- Rede padrão que deixou de existir e nenhuma rede configurada funcionando: o lacre fica sem comunicação até alguém levá-lo a uma rede conhecida ou regravar o firmware; o sistema mostra "sem comunicação" e a última rede usada.
- Lacre que travou sozinho e não foi destravado: continua travado até um comando de destravar confirmado, mesmo que volte a comunicar.

## Requisitos

### Requisitos funcionais

**Endpoint do lacre (comunicação pelo Wi-Fi)**

- **RF-001**: O FluxID deve oferecer ao lacre um endpoint, no ambiente que já usa, sem outro serviço publicado, para: enviar posições, eventos e alertas; avisar a ativação e o desligamento; confirmar comandos. Em toda resposta, o lacre recebe o comando pendente, se houver, e se o cilindro está sob vigilância de geocerca, com a geocerca da unidade quando ela é nova ou mudou (RN-011), para não precisar de uma chamada só para buscá-los.
- **RF-002**: Todo pedido do lacre deve vir identificado pelo código do dispositivo e pela chave dele; o FluxID compara a chave com a forma protegida guardada no cadastro e recusa, sem revelar o motivo, chave ausente, errada, de outro dispositivo ou de dispositivo inativo.
- **RF-003**: Cada mensagem deve trazer um identificador único gerado pelo lacre; a mesma mensagem recebida de novo responde "já recebida", sem criar nada e devolvendo de novo o comando pendente.
- **RF-004**: Um envio pode trazer várias leituras guardadas pelo lacre enquanto estava sem sinal, até 50 por envio, com resultado individual para cada uma (gravada, repetida ou recusada com motivo).
- **RF-005**: Cada mensagem deve ser associada ao dispositivo, à organização do cadastro dele e ao cilindro do vínculo válido no horário da leitura; mensagem de lacre ativo sem vínculo fica só no dispositivo.
- **RF-006**: O endpoint deve limitar o número de envios por dispositivo por minuto e o número de chaves erradas por endereço, recusando o excesso sem perder o que o lacre reenviar depois.
- **RF-007**: O endpoint deve tratar os tipos de mensagem: posição, evento, alerta do lacre, confirmação de comando, ativação, aviso de desligamento, mudança de rede e trava automática por perda de comunicação.
- **RF-007a**: O formato de cada mensagem do lacre e de cada resposta do FluxID (campos, tipos, limites, códigos de resultado e versão do contrato) deve ficar documentado nesta spec e coberto por testes de contrato com o simulador de lacre; mudanças no formato exigem nova versão do contrato, aceita pelo FluxID junto com a anterior durante a transição.

**Posição e acompanhamento**

- **RF-008**: Toda posição guardada deve ter latitude, longitude, qualidade (com GPS ou última conhecida), precisão quando houver, horário da leitura, horário de recebimento, horário de "visto por último", bateria, força do sinal Wi-Fi e estado do lacre.
- **RF-009**: Uma posição a até **20 metros** da última posição guardada daquele lacre, com a mesma qualidade e o mesmo estado do lacre, não cria registro novo: atualiza só o horário de "visto por último", a bateria e o sinal da posição existente.
- **RF-010**: A última posição de cada cilindro deve ser a mais recente pelo horário da leitura, nunca a última que chegou.
- **RF-011**: O detalhe do cilindro e o detalhe da viagem devem mostrar a última posição de cada cilindro com lacre num mapa, com a idade da posição em texto, a qualidade, a bateria, o estado da trava e a saúde do lacre, e atualizar-se sozinhos quando chega informação nova.

**Saúde do lacre e verificação automática**

- **RF-012**: Cada dispositivo deve ter um intervalo de envio esperado, definido no cadastro (padrão de **1 minuto**, decidido em 17/10/2026 com a troca para o Wi-Fi), que o firmware segue: a cada intervalo o lacre chama o endpoint do FluxID, envia as informações e recebe o comando pendente.
- **RF-013**: Uma verificação automática deve rodar a cada minuto, sem ação humana, e calcular a saúde de cada lacre: funcionando, sem GPS, bateria baixa, sem comunicação ou desligado.
- **RF-014**: Um lacre sem nenhuma comunicação por mais de um intervalo de envio e 30 segundos de folga (90 segundos no padrão) deve passar a "sem comunicação"; o aviso de desligamento muda a saúde para "desligado" na hora. Se o cilindro estiver em viagem em andamento ou sob vigilância de geocerca, os dois casos abrem o alerta de cilindro possivelmente perdido ou extraviado, de severidade alta, com a última posição lida do lacre, o horário e a qualidade dela (com GPS ou última conhecida) e a viagem ou o cliente em que o cilindro estava. Nos demais casos (estoque, lacre sem vínculo), abrem um alerta de "sem comunicação" ou "desligado" de severidade média, só na lista, sem notificação.
- **RF-015**: Um lacre que envia só posições sem GPS por mais de três intervalos seguidos deve passar a "sem GPS" e abrir um alerta de severidade média.
- **RF-016**: O FluxID deve abrir sozinho, na mudança e não a cada leitura, os alertas do próprio lacre: bateria abaixo de 15%, sinal Wi-Fi abaixo de -85 dBm, lacre rompido e lacre aberto sem autorização.
- **RF-017**: A volta da comunicação ou do GPS deve devolver a saúde a "funcionando" e registrar a volta no alerta, que continua aberto até o gestor encerrar; nenhum estado de saúde muda sozinho a situação do cilindro para "extraviado"; o alerta de possível extravio só informa, e a mudança é decisão de uma pessoa.

**Geocerca e violação**

- **RF-018**: Cada posição com GPS de um cilindro entregue e sob custódia do cliente deve ser comparada com a geocerca ativa da unidade onde ele foi entregue (RN-004), usando a regra de "dentro" da Spec 008 (a borda conta como dentro; dentro de qualquer geocerca ativa da unidade conta como dentro).
- **RF-019**: A saída da geocerca só vira violação depois de duas posições com GPS seguidas fora dela, com distância maior que a tolerância de 50 metros até a borda; posições sem GPS nunca abrem violação sozinhas.
- **RF-020**: A violação deve registrar o cilindro, o lacre, a geocerca, o horário da primeira posição fora, a posição, a distância até a geocerca e, depois, o retorno à área, se houver.
- **RF-021**: Uma violação nova deve abrir um alerta de severidade alta e, se o lacre estiver ativo e não travado, criar um comando de travar com origem "violação de geocerca", devolvido já na resposta do envio que causou a violação; enquanto a violação estiver aberta, novas posições fora da área não criam outra violação nem outro comando.
- **RF-022**: O retorno à área não destrava o lacre nem encerra o alerta; o destravamento depois de uma violação é sempre manual, com justificativa e verificação em duas etapas.
- **RF-022a**: Toda resposta ao lacre deve informar se o cilindro dele está sob vigilância de geocerca (RN-004) e, quando a vigilância começa ou a geocerca ativa da unidade muda, enviar o contorno dela, que o lacre guarda. Sob vigilância, o lacre que passar de **3 minutos** sem resposta do FluxID (três envios seguidos sem resposta) compara as próprias posições com GPS com a geocerca guardada e só trava a válvula sozinho com duas posições seguidas fora dela, além da tolerância de 50 metros (a mesma regra da RF-019); dentro da área ou sem GPS, não trava (RN-011) e, ao voltar a se comunicar, informa a trava com o horário em que aconteceu; o FluxID registra a trava física "travada por perda de comunicação", abre alerta de severidade alta e processa as leituras guardadas pela regra de violação, sem criar outro comando de travar.

**Comandos de trava**

- **RF-023**: Ao iniciar a viagem (Spec 008), o sistema deve criar um comando de travar para cada cilindro em trânsito com lacre ativo vinculado, com origem "início da viagem", sem duplicar em pedidos repetidos e sem esperar a confirmação para iniciar a viagem.
- **RF-024**: Ao salvar a entrega de um cilindro como "entregue" numa parada, o sistema deve criar o comando de destravar com origem "entrega", sempre que a trava não estiver confirmada como "destravada" (inclusive "não confirmada" ou com travar pendente, que é cancelado com o motivo, e o evento registra que a trava anterior não tinha confirmação), só quando a posição comprovar que o cilindro está dentro da geocerca ativa da unidade: vale a posição do lacre com GPS lida nos 2 minutos anteriores à entrega e, sem ela, a posição do celular registrada na entrega com origem "GPS" (Spec 009); coordenadas digitadas e "no endereço da unidade" não comprovam, e o evento registra qual posição foi usada. Nos demais casos, a tela explica o motivo e oferece o destravamento excepcional.
- **RF-025**: O gestor com permissão deve poder pedir travar ou destravar manualmente, sempre com justificativa; destravar fora da regra de entrega exige verificação em duas etapas, como o desbloqueio excepcional da Spec 008.
- **RF-026**: Todo comando deve ter estado explícito — pendente, entregue ao lacre, confirmado, com erro, cancelado ou expirado — e guardar origem, quem pediu (pessoa ou regra), horários de cada mudança e a resposta do lacre.
- **RF-027**: Só a confirmação "executado" do lacre muda a trava física para travada ou destravada; erro, expiração ou comando de trava não entregue em 30 minutos deixam a trava "não confirmada" e abrem alerta.
- **RF-028**: A verificação automática deve marcar como "expirado" todo comando não confirmado em 10 minutos depois de entregue ao lacre. Comando de travar ou destravar ainda não entregue não expira enquanto o motivo dele valer (viagem em andamento, violação aberta ou entrega válida): depois de 30 minutos ele abre um alerta e continua pendente até o lacre voltar a comunicar, e é cancelado com o motivo quando o motivo deixa de valer. Comando de rede não entregue expira em 30 minutos depois de criado (RF-034c).
- **RF-029**: Um novo comando para o mesmo lacre cancela o anterior ainda pendente, com o motivo; a confirmação de um comando cancelado é registrada sem mudar a trava.
- **RF-030**: O estado da trava física (sem lacre, travada, destravada, não confirmada, travada por violação de geocerca, travada por perda de comunicação) é independente do bloqueio lógico da Spec 008 e da situação do cilindro e da viagem (Constituição, princípio IV). Enquanto um comando de trava está pendente dentro do prazo, a tela mostra o último estado confirmado com a marca "travamento pendente" ou "destravamento pendente".

**Dispositivos e vínculo**

- **RF-031**: O administrador deve poder cadastrar, editar, desativar e gerar chave nova para os dispositivos da organização; a chave é mostrada uma única vez, o sistema guarda só a forma protegida dela e a chave antiga deixa de valer na troca. Desativar o dispositivo e gerar chave nova exigem justificativa de 5 a 500 caracteres.
- **RF-032**: A mensagem de ativação deve colocar o lacre na lista de lacres ativos da organização; o aviso de desligamento muda a saúde para "desligado" sem encerrar o vínculo, que só é encerrado por uma pessoa ou pela desativação do dispositivo.
- **RF-033**: O operador deve poder vincular um lacre ativo a um cilindro ativo da mesma organização, lendo o identificador do cilindro (Spec 009) ou escolhendo da lista, e encerrar o vínculo; um lacre tem no máximo um cilindro, e um cilindro no máximo um lacre, por vez. Encerrar o vínculo exige justificativa de 5 a 500 caracteres.
- **RF-034**: O vínculo não pode ser encerrado enquanto o cilindro estiver numa viagem em andamento.

**Rede Wi-Fi do lacre**

- **RF-034a**: O detalhe do dispositivo deve mostrar a rede Wi-Fi em uso informada pelo lacre (nome, se é a padrão ou uma da lista, força do sinal e horário) e os nomes das redes guardadas no lacre, nunca as senhas.
- **RF-034b**: O lacre guarda, além da padrão, uma lista de até **5** redes configuradas pelo sistema. O administrador deve poder adicionar uma rede (nome e senha, ou rede aberta), remover uma rede e pedir "voltar só para a rede padrão" (este último com justificativa de 5 a 500 caracteres, porque apaga todas as redes de uso); cada pedido vira um comando do lacre, com os mesmos estados dos comandos de trava (RF-026) e os prazos de comando de rede (RF-028), é entregue um de cada vez, na ordem, e não muda o estado da trava. Um novo pedido para a mesma rede cancela o anterior ainda pendente; adicionar a sexta rede é recusado.
- **RF-034c**: A senha da nova rede deve ser guardada protegida só até o comando terminar (confirmado, com erro, cancelado ou expirado) e então apagada; ela só sai do FluxID na resposta ao próprio lacre, por conexão segura, e nunca aparece em tela, consulta, log, auditoria ou registro de IA.
- **RF-034d**: O lacre só guarda a nova rede e confirma depois de falar com o FluxID por ela; se não conseguir no prazo, volta para a rede em que estava, não guarda a nova e confirma com "erro" e o motivo, que abre alerta de severidade média.
- **RF-034e**: A rede padrão é gravada no firmware e não pode ser trocada nem apagada pelo sistema. Em uso, o lacre escolhe, entre as redes da lista ao alcance, a de sinal mais forte, permanece nela enquanto der acesso ao FluxID e, se nenhuma der, usa a padrão; informa a rede em uso a cada comunicação.
- **RF-034f**: Pedir para adicionar ou remover uma rede de um lacre cujo cilindro esteja numa viagem em andamento ou sob vigilância de geocerca exige confirmação, com o aviso de que o lacre pode ficar sem comunicar durante a troca.

**Alertas**

- **RF-035**: Os alertas do lacre e os do FluxID (violação, comando com erro, expirado ou não entregue em 30 minutos, sem comunicação, desligado, sem GPS) devem ficar numa única lista da organização, com tipo, severidade, cilindro, lacre, horário e situação (aberto, reconhecido, encerrado), sem duplicar o mesmo alerta.
- **RF-036**: O gestor deve poder reconhecer e encerrar alertas; o encerramento exige observação e gera auditoria.
- **RF-036a**: O alerta de cilindro possivelmente perdido ou extraviado (só em viagem ou sob vigilância de geocerca, RF-014) e todo alerta de severidade alta ou crítica (violação de geocerca, trava por perda de comunicação, lacre aberto ou rompido estando travado) devem ser enviados também como **notificação do aplicativo instalado** a quem tem a permissão de ver lacres na organização e ativou as notificações naquele aparelho, mesmo com o FluxID fechado.
- **RF-036b**: A pessoa ativa e desativa as notificações por aparelho, numa ação explícita (o navegador pede a permissão só depois dela); sem notificações ativadas, ou com a permissão negada no navegador, o alerta continua na lista e a tela explica como ativar.
- **RF-036c**: A notificação traz o tipo do alerta, o cilindro e o horário, sem coordenadas, nome de cliente ou dado pessoal no texto, porque passa pelo serviço de notificação do navegador; ao tocar nela, o FluxID abre o alerta com a última posição no mapa, depois do login e respeitando a permissão.
- **RF-036d**: Cada alerta gera no máximo uma notificação por aparelho, sem repetir quando ele chega de novo; a volta à normalidade (lacre que voltou a comunicar) gera uma notificação de retorno. Quem perde a permissão ou sai da organização deixa de receber na hora.

**Segurança, auditoria e privacidade**

- **RF-037**: Todo dado de dispositivo, posição, comando, violação, saúde e alerta pertence a uma organização e só é visível nela, inclusive por pedido direto; dispositivo, lacre ou cilindro de outra organização recebe a mesma resposta de inexistente.
- **RF-038**: Novas permissões: ver lacres e posições, operar lacres (vincular, pedir comando, encerrar alerta) e administrar dispositivos; o auditor só consulta.
- **RF-039**: Cadastro, desativação e troca de chave de dispositivo, vínculo e desvínculo, comando manual, alteração das redes Wi-Fi, destravamento excepcional e encerramento de alerta geram registro de auditoria, sem chave, senha de rede ou coordenada em texto aberto. A justificativa fica no histórico do dispositivo e nunca em texto aberto na auditoria, como na Spec 008.
- **RF-040**: Nenhuma chave de dispositivo, senha de rede Wi-Fi ou credencial privilegiada existe no repositório ou em log, nem fica guardada no cliente; a senha digitada pelo administrador sai do navegador direto para o FluxID e não volta. O lacre só conhece a própria chave e as próprias redes, e a senha da rede padrão fica fora do repositório (gravada no firmware a partir de um arquivo local não versionado).
- **RF-041**: Nenhum dado é excluído fisicamente; o prazo de retenção das posições fica para a spec de privacidade (ver Premissas).

**Interface**

- **RF-042**: As telas novas (lacres, alertas, cadastro de dispositivo) e os blocos no detalhe do cilindro e da viagem devem seguir o padrão visual da Spec 005, com estados de carregando, vazio, erro, offline e de saúde do lacre, de 360 px a desktop amplo, atendendo a WCAG 2.2 AA; o mapa tem alternativa em texto (lista de posições), e a saúde do lacre nunca depende só de cor.
- **RF-043**: Offline, as telas mostram a última informação conhecida com o horário e desabilitam os comandos com o motivo; comandos de lacre não entram na fila offline da Spec 010.

### Requisitos não funcionais

- **RNF-001**: Uma posição recebida do lacre aparece na tela de quem acompanha em até 10 segundos.
- **RNF-001a**: A notificação do alerta de possível extravio chega ao aparelho em até 30 segundos depois de o alerta ser aberto, quando o aparelho está conectado.
- **RNF-002**: O endpoint responde ao lacre em até 3 segundos, para não gastar bateria nem os dados do ponto de acesso do caminhão.
- **RNF-003**: Com o intervalo padrão de 1 minuto, a falta de comunicação de um lacre desligado ou destruído é percebida e alertada em até 1 minuto depois do envio esperado que não chegou (no máximo cerca de 2 minutos e meio depois da última comunicação).
- **RNF-004**: O envio e a busca do comando são uma única chamada por intervalo. Com 1 minuto, cada lacre faz cerca de 43.200 chamadas por mês; o plano gratuito do ambiente de teste comporta cerca de 10 lacres nesse ritmo, e o consumo é acompanhado na validação.
- **RNF-005**: As telas atendem WCAG 2.2 AA e o padrão visual da Spec 005, sem valor arbitrário de Tailwind nem cor literal.
- **RNF-006**: O pacote de entrada não cresce além do limite de 5% sobre a linha de base; o mapa carrega só quando a tela que o usa abre.

### Regras de negócio

- **RN-001**: O sistema nunca presume que um comando físico foi executado; só a confirmação do lacre muda a trava.
- **RN-002**: Perda de comunicação, desligamento e falta de GPS são estados de saúde do lacre (degradado), nunca extravio do cilindro.
- **RN-003**: Posição sem GPS é a última posição conhecida e não decide violação sozinha.
- **RN-004**: Só o cilindro entregue e sob custódia do cliente é vigiado por geocerca: a da unidade onde foi entregue. A vigilância começa na entrega e termina quando ele entra numa nova viagem ou volta ao estoque; em trânsito e em estoque não há vigilância por geocerca.
- **RN-005**: Destravar fora da regra de entrega, ou depois de violação, é exceção: exige permissão, justificativa e verificação em duas etapas.
- **RN-006**: A organização do dispositivo é definida no cadastro do FluxID, nunca pelo que o lacre informa.
- **RN-007**: O FluxID decide geocerca, violação, saúde e comandos; o lacre só informa o que mede e executa o que recebe. A única exceção é a trava automática por perda de comunicação (RN-011).
- **RN-008**: O início da viagem não espera a confirmação da trava física; comando entregue e não confirmado no prazo expira e abre alerta, e comando de trava não entregue continua pendente enquanto a viagem estiver em andamento, com alerta depois de 30 minutos.
- **RN-009**: "Posição não mudou" é estar a até 20 metros da última posição guardada, com a mesma qualidade e o mesmo estado do lacre; nesse caso só o horário de "visto por último" muda.
- **RN-010**: No uso normal do cilindro a válvula fica **aberta** (destravada); ela só fecha (trava) por comando, no transporte (início da viagem) ou na saída da geocerca, e só abre de novo por comando (decidido pelo responsável pelo produto em 16/10/2026).
- **RN-011**: Sob vigilância de geocerca, o lacre que fica mais de 3 minutos sem resposta do FluxID **e** cujo próprio GPS mostra duas posições seguidas fora da geocerca recebida do FluxID trava sozinho e avisa quando voltar a comunicar; a simples queda da rede com o cilindro dentro da área não trava; o destravamento depois disso é sempre manual (RN-005). Fora da vigilância, a perda de comunicação não trava nada (decidido em 17/10/2026).
- **RN-012**: A rede padrão do firmware é fixa e sempre fica como reserva; o sistema só altera a lista de até 5 redes configuradas, e o lacre usa a padrão quando nenhuma rede da lista dá acesso ao FluxID (decidido em 17/10/2026).
- **RN-013**: Uma rede nova só entra na lista do lacre quando ele fala com o FluxID por ela; a senha da rede só fica no FluxID até o comando terminar.

### Entidades principais

- **Dispositivo**: o equipamento do lacre na organização: código, forma protegida da chave, ativo ou inativo, versão do firmware, intervalo de envio esperado, última comunicação, saúde rede Wi-Fi em uso (nome, padrão ou da lista, sinal) e os nomes das até 5 redes configuradas guardadas no lacre.
- **Lacre ativo**: o identificador do lacre registrado na ativação, ligado ao dispositivo; existe enquanto o lacre estiver ativado.
- **Vínculo lacre–cilindro**: qual lacre está em qual cilindro, de quando a quando, quem vinculou e quem encerrou.
- **Posição do lacre**: cada ponto distinto lido pelo lacre, com qualidade, precisão, bateria, estado do lacre, horário da leitura e de "visto por último"; ligada ao dispositivo, ao cilindro do vínculo e à organização.
- **Mensagem recebida**: o registro de cada mensagem pelo identificador único, para não processar duas vezes a mesma.
- **Comando do lacre**: travar, destravar, adicionar rede Wi-Fi, remover rede ou voltar só para a rede padrão, com origem, estado, histórico de estados, quem pediu e a resposta do lacre; ao adicionar rede, o nome e a senha protegida, apagada quando o comando termina.
- **Violação de geocerca**: saída da área permitida, com a geocerca, as posições, a distância e o retorno.
- **Alerta**: aviso do lacre ou do FluxID (violação, comando, saúde), com severidade, volta ao normal e encerramento.
- **Item da viagem (estende a Spec 008)**: ganha a referência ao estado da trava física, separado do bloqueio lógico.

## Requisitos para o firmware do lacre

O firmware atual está no repositório `simaoBastos/fluxid-firmware` (ESP32-C3 com SIM800L, GPS, LEDs e fila offline na memória do lacre; envio só por Wi-Fi, sem HTTPS, sem comandos e sem trava). Por decisão do responsável pelo produto (16/10/2026), ele passa a ficar na pasta `firmware/` deste repositório. **O firmware é entregue nesta spec** (decidido em 17/10/2026): ele segue o contrato das mensagens (RF-007a) e os requisitos abaixo, e é validado no lacre físico (História 8). Em 17/10/2026 o projeto físico mudou: **o SIM800L sai** e o lacre usa só o Wi-Fi do ESP32-C3. A trava da válvula é acionada por uma solenoide. Para conversar com o FluxID, o firmware desta spec precisa:

1. **Conexão segura pelo Wi-Fi**: acessar o endpoint do FluxID por conexão segura (HTTPS), que o ambiente de teste exige, feita pelo próprio ESP32-C3 (versão mini); o lacre confere o certificado do servidor e acerta a hora pela rede antes disso.
2. **Identificação**: enviar em todo pedido o código do dispositivo e a chave gerada no cadastro do FluxID, gravada no lacre e nunca exibida.
3. **Envio periódico**: chamar o endpoint do FluxID e enviar a posição no intervalo combinado no cadastro (padrão de 1 minuto) mesmo parado; sem resposta, tentar de novo no intervalo seguinte, também de 1 minuto, porque é esse envio que prova que o lacre está funcionando; o FluxID cuida de não repetir registros.
4. **Identificador único e horário da leitura**: gerar um identificador único para cada mensagem e mandar o horário em que leu a posição, além da qualidade (com GPS ou última conhecida) e da precisão, quando houver.
5. **Guardar e reenviar**: sem sinal ou sem resposta, guardar as leituras e reenviá-las depois, em lotes de até 50, com os mesmos identificadores.
6. **Comando na resposta**: ler o comando pendente que vem na resposta de cada envio, executar a trava e confirmar com "executado" ou "erro".
7. **Ativação e desligamento**: avisar quando for ativado e, sempre que possível, antes de ser desligado.
8. **Redes Wi-Fi**: o nome e a senha da rede padrão são gravados no firmware a partir de um arquivo local fora do repositório. O lacre guarda na memória uma lista de até 5 redes recebidas pelo sistema, escolhe entre as ao alcance a de sinal mais forte, fica nela enquanto der acesso ao FluxID e, se nenhuma der, usa a padrão, que nunca é apagada. Ao receber uma rede nova, testa, só a guarda e confirma depois de falar com o FluxID por ela e, se não conseguir no prazo, volta para a rede em que estava e confirma com "erro" e o motivo; também remove redes da lista quando o sistema pede. Em toda comunicação informa o nome da rede em uso e a força do sinal, nunca a senha.
8a. **Trava por perda de comunicação**: guarda a última indicação de vigilância de geocerca e o contorno da geocerca recebidos; sob vigilância, depois de 3 minutos (três envios seguidos) sem resposta do FluxID, compara as próprias posições com GPS com a geocerca e só aciona a trava com duas posições seguidas fora dela, além da tolerância de 50 metros; ao voltar a comunicar, avisa a trava com o horário.
9. **Trava pela solenoide**: a válvula fica aberta no uso normal e só fecha pelo comando de travar (RN-010); o firmware aciona a solenoide pelo comando recebido, confirma só depois de acionar e mantém a válvula no último estado confirmado se a energia ou a comunicação faltar, sem gastar bateria para segurar a posição. No primeiro uso, sem estado gravado, a válvula fica aberta. Depois de um reinício, o lacre restaura o último estado confirmado gravado na memória e o informa no primeiro envio.
10. **Bateria e estado do lacre medidos**: enviar a bateria medida de verdade (hoje o valor é fixo) e o estado do lacre quando houver sensor.
11. **Segredos fora do repositório**: a chave do dispositivo, a rede padrão e o endereço do FluxID ficam num arquivo local de configuração, fora do controle de versão; o repositório traz só um modelo de exemplo, sem valores reais. As redes recebidas pelo sistema ficam na memória do lacre, nunca em log serial.
12. **Testes do firmware**: as regras do firmware que não dependem do hardware (fila de leituras, escolha de rede, trava por perda de comunicação com a comparação com a geocerca, leitura das respostas) têm testes automatizados que rodam sem o lacre, e o firmware compila no CI.

## Critérios de aceitação transversais

- **CA-001**: O Tenant B nunca vê nem altera dispositivo, posição, comando, violação, saúde ou alerta do Tenant A, por tela ou pedido direto; testado com dois tenants nas políticas de acesso, com o caso permitido e o bloqueado.
- **CA-002**: Nenhum comando aparece como "executado" sem a confirmação do lacre, em todos os testes.
- **CA-003**: Toda mensagem reenviada responde "já recebida" e não cria registro novo; toda posição a até 20 metros da anterior, com a mesma qualidade e o mesmo estado, só atualiza o horário.
- **CA-004**: Toda ação sensível (RF-039) gera auditoria, sem chave ou coordenada em texto aberto.
- **CA-005**: As telas passam na verificação de acessibilidade automatizada em 360, 768 e 1920 px, sem violação crítica ou grave, e são operáveis só com teclado.
- **CA-006**: O endpoint do lacre recusa pedidos sem chave, com chave errada ou de dispositivo inativo, sem revelar o motivo.
- **CA-007**: A falta de comunicação, o desligamento e a falta de GPS geram alerta sem nenhuma ação humana.
- **CA-008**: A senha de rede Wi-Fi nunca aparece em tela, consulta, log, auditoria ou registro de IA, e é apagada do FluxID quando o comando de troca termina, em todos os testes.
- **CA-009**: Nenhuma alteração de rede com falha deixa o lacre simulado sem comunicação: ele sempre volta para a rede em que estava, para outra da lista ou para a padrão.
- **CA-010**: Nenhuma notificação contém coordenada, nome de cliente ou dado pessoal, e só chega a quem tem a permissão de ver lacres na organização do alerta; testado com dois tenants.
- **CA-011**: O simulador de lacre usado nos testes segue exatamente o contrato das mensagens, e todo tipo de mensagem e de resposta do contrato tem pelo menos um teste de contrato.
- **CA-012**: O firmware da pasta `firmware/` compila no CI, passa nos próprios testes automatizados e não contém chave, senha nem endereço real.

## Critérios de sucesso

### Resultados mensuráveis

- **MS-001**: 100% das posições enviadas pelo simulador guardadas uma única vez, na organização certa, inclusive com reenvios e lotes de leituras guardadas.
- **MS-002**: Um lacre parado por 24 horas, enviando a cada minuto, gera 1 posição guardada, e não 1.440.
- **MS-003**: Em 100% das viagens iniciadas no teste, cada cilindro com lacre recebe exatamente um comando de travar.
- **MS-004**: Em 100% das entregas dentro da geocerca no teste, o comando de destravar é criado; e em 0% das entregas fora dela.
- **MS-005**: Toda saída real da geocerca no teste gera violação, comando de travar e alerta, com o comando entregue ao lacre já na resposta do envio que a causou; posições sem GPS geram 0 violação.
- **MS-006**: 100% dos lacres de cilindros em viagem ou sob vigilância de geocerca que são desligados ou param de comunicar no teste geram o alerta de possível extravio, com a última posição lida, em até 1 minuto depois do envio esperado que não chegou, sem ação humana, e a notificação chega aos aparelhos com notificações ativadas em até 30 segundos depois do alerta.
- **MS-007**: 0 dado de outra organização visível em todos os testes de políticas de acesso com dois tenants.
- **MS-008**: O gestor localiza no mapa o cilindro de uma viagem em andamento e entende se o lacre está funcionando e travado em até 20 segundos, sem treinamento.
- **MS-009**: 0 violação crítica ou grave de acessibilidade e 0 rolagem horizontal em 360, 768 e 1920 px.
- **MS-010**: O administrador adiciona uma rede Wi-Fi a um lacre pelo sistema em até 1 minuto de preenchimento, sem regravar o firmware; 100% das adições com falha no teste terminam com o lacre de volta à rede em que estava, sem guardar a rede com falha.
- **MS-011**: Em 100% dos testes em que o lacre sob vigilância de geocerca perde a comunicação além do prazo fora da geocerca, ele trava sozinho; em 0% dos testes com a rede caída e o lacre dentro da geocerca ele trava; e o FluxID registra a trava e o alerta assim que a comunicação volta.
- **MS-012**: Na validação com o lacre físico, 100% dos cenários da História 8 passam: posição no mapa em até 10 segundos, aviso de possível extravio em até 1 minuto depois do envio que não chegou, violação e trava ao sair da geocerca.

## Premissas e dependências

- As Specs 006 a 010 estão integradas: cilindros, identificadores, clientes, unidades, geocercas, viagens, entrega com posição, leitura e fila offline existem e são estendidos, não substituídos.
- Tudo roda no ambiente de teste que o FluxID já usa (`docs/publicacao-em-nuvem.md`); nenhum serviço novo é contratado nem publicado. A API do lacre de Natã da Silva Baracho não é publicada: suas regras e seu simulador são a referência para a implementação e os testes.
- O ambiente de teste exige conexão segura (HTTPS), feita pelo ESP32-C3 no Wi-Fi; o ajuste é do firmware, não do FluxID. O firmware será analisado e, se preciso, reescrito a partir do repositório do responsável pelo produto, dentro desta spec.
- O lacre só comunica onde há Wi-Fi com internet: na viagem, pelo ponto de acesso do caminhão (roteador móvel ou celular do motorista); no cliente, pela rede do cliente, configurada pelo sistema (História 7). O ponto de acesso do caminhão é responsabilidade da operação e pode ser a própria rede padrão do firmware. Cobertura e consumo de dados desse ponto de acesso são conferidos na validação em campo.
- O plano gratuito do ambiente de teste tem limite mensal de chamadas; por isso o envio e a busca do comando são uma única chamada. O intervalo padrão passou de 5 minutos para 1 minuto em 17/10/2026, com o Wi-Fi, para perceber em cerca de 1 minuto o lacre desligado; isso leva o teste para perto do limite do plano gratuito (cerca de 10 lacres). Mais lacres podem exigir outro plano, fora do escopo de teste.
- O lacre real ainda não envia ativação nem bateria (README da API do lacre, 10/10/2026). Os testes automatizados usam o simulador de lacre, que segue o contrato das mensagens; a validação humana usa o lacre físico com o firmware desta spec (História 8), fornecido pelo responsável pelo produto. A homologação do hardware para produção (caixa, bateria, certificação) continua na Fase 8.
- Os limites desta spec (20 metros para posição repetida, 1 minuto de intervalo padrão, 90 segundos para "sem comunicação", três intervalos para "sem GPS", 50 metros de tolerância de geocerca, duas posições seguidas, 2 minutos de validade da posição do lacre na entrega, 10 minutos para expirar comando entregue, 30 minutos para o alerta de comando de trava não entregue e para expirar comando de rede, 50 leituras por lote, 3 minutos para a trava por perda de comunicação, -85 dBm para sinal Wi-Fi fraco) são valores iniciais, a confirmar na validação em campo.
- O mapa mostra a última posição e o caminho recente da viagem; rastreamento do veículo, comparação entre GPS do lacre e do celular (proximidade), relatórios e notificações por e-mail ficam para a Fase 7 (a notificação do aplicativo instalado entra nesta spec, RF-036a).
- Prazo de retenção e anonimização das posições ficam para a spec de privacidade já prevista nas Specs 009 e 010; até lá, as posições ficam guardadas sem exclusão física e visíveis só a quem tem permissão.
- Esta spec deve ser validada por Natã da Silva Baracho antes de encerrar o ciclo, pela entrevista do AGENTS.md.
