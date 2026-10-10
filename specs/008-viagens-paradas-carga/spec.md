# Especificação da funcionalidade: Viagens, paradas, carga e entrega

**Branch da funcionalidade**: `feat/008-viagens-paradas-carga` (criada depois da integração da Spec 007, PRs #22 e #23)

**Criada em**: 08/10/2026

**Status**: Rascunho

**Entrada**: Fase 4 do plano de implementação do PRD (`docs/prd.md`, seção 15): planejar viagens, paradas e cargas (RF009), planejar uma viagem para distribuir cilindros por cliente (US003) e, no que cabe ao registro feito pelo escritório, confirmar a entrega com evidência (RF014, US006). A jornada do PRD cobre os passos 5, 7, 10 e 11 (planejar a viagem e distribuir os cilindros por parada, bloquear os cilindros e iniciar a viagem, registrar entrega ou divergência e solicitar desbloqueio).

## Contexto

Com a Spec 006 o FluxID sabe **quais cilindros** cada organização possui e com a Spec 007 sabe **para quem** entregá-los, **onde** ficam os clientes, **em que veículo** e **com qual motorista**. Falta o elo entre tudo isso: a **viagem**. É nela que o gestor decide quem leva o quê, para onde e em que ordem, e é nela que a custódia de cada cilindro passa do estoque para o cliente.

Esta spec entrega o **fluxo completo da viagem pelo sistema web**, sem hardware e sem aplicativo de campo: planejar, conferir o carregamento, iniciar, registrar cada entrega ou divergência, tratar o desbloqueio como registro próprio, concluir ou cancelar. Tudo o que o PRD pede para ser **lido** (QR Code, Data Matrix, NFC), **localizado** (GPS do celular e do lacre) ou **executado no dispositivo** (travar e destravar) pertence a fases seguintes. Aqui a conferência é feita **por confirmação humana, item a item**, o bloqueio é **lógico** (o cilindro fica reservado e marcado como bloqueado para aquela viagem; o comando à trava do lacre é da Fase 6) e a posição da entrega é **informada, e não capturada**. Cada ponto foi desenhado para a Fase 5 trocar a confirmação manual pela leitura, sem mudar o modelo de dados nem as regras.

Dois pontos tornam esta spec delicada: o **estado de cada cilindro muda por causa da viagem** (sai do estoque, entra em trânsito, chega ao cliente), e a Constituição manda que estados de cilindro, viagem, parada e bloqueio sejam **independentes**; e a **entrega** e o **desbloqueio** são registros separados, porque um não implica o outro.

## Clarifications

### Session 2026-10-08

- Q: O que significa "bloquear" o cilindro ao iniciar a viagem, e quando o comando para a trava do lacre é enviado? → A: O cilindro fica **reservado e marcado como bloqueado** no sistema, e a intenção é enviar um comando a uma trava que fica no lacre do cilindro; esse **envio do comando e a confirmação pelo dispositivo são da Fase 6**. Nesta spec o bloqueio é um **bloqueio lógico, a ser confirmado pelo dispositivo quando a Fase 6 existir**; nada é enviado a dispositivo e o sistema não presume que a trava foi acionada (Constituição, princípio IV).
- Q: A entrega vale para a parada inteira de uma vez ou cada cilindro pode ser entregue em momentos diferentes? → A: **Parada inteira**: um registro de entrega por parada, em que o gestor marca o resultado de cada cilindro (entregue ou não entregue) e salva uma vez, com um recebedor e um horário únicos; o que acontecer depois (novo resultado de um cilindro não entregue, correção) é um novo registro com justificativa.
- Q: Um cilindro com teste hidrostático vencido pode entrar numa viagem? → A: **Nunca entra**: teste vencido ou reprovado impede a inclusão, sem exceção; o cilindro volta a poder entrar depois de um novo teste aprovado (Spec 006). Se o teste vencer entre o planejamento e a saída, o servidor recusa o início até o cilindro ser trocado.
- Q: Um mesmo veículo ou motorista pode estar em duas viagens abertas ao mesmo tempo? → A: **Uma aberta por vez**: veículo e motorista só podem estar em **uma viagem "carregando" ou "em andamento"** de cada vez; o planejamento pode ter várias viagens "planejadas" com o mesmo veículo ou motorista e a tela **avisa** quando a data coincide, e a verificação que bloqueia acontece ao **iniciar o carregamento** e de novo ao **iniciar a viagem**, com o banco garantindo por índice único parcial.
- Q: A data prevista da viagem pode ser anterior a hoje? → A: **Hoje ou depois**: ao planejar, a data não pode ser passada (dia de `America/Sao_Paulo`); editar uma viagem já planejada cuja data ficou para trás é permitido, e a lista a destaca como **atrasada** em texto e ícone, sem mudar a situação.
- Q: As paradas precisam ser visitadas na ordem planejada? → A: **Qualquer ordem, com aviso**: a chegada pode ser registrada em qualquer parada pendente; se não for a próxima da fila, a tela avisa e o evento de chegada guarda que foi **fora de ordem**; a ordem planejada não muda.
- Q: Depois que a viagem foi iniciada, o gestor pode acrescentar ou retirar uma parada ou um cilindro? → A: **Não, só cancelar**: viagem "em andamento" não aceita edição de paradas, de ordem nem de carga; o que mudou na rua é tratado por divergência, retorno ao estoque ou cancelamento com exceção, e a carga conferida e bloqueada fica intacta.
- Q: As quatro decisões assumidas na especificação valem como estão? → A: **Sim, confirmadas em 2026-10-09**: (a) a **conferência do carregamento** é a confirmação manual de cada cilindro previsto por uma pessoa autorizada, e a leitura por câmera ou NFC entra na Fase 5; (b) a **posição da entrega** é opcional e informada (coordenadas ou "no endereço da unidade"), pois o GPS é da Fase 5; (c) **CNH vencida** impede iniciar a viagem e **licenciamento vencido** do veículo só avisa, sem bloquear; (d) o **recebedor** é registrado só pelo nome e pela função, nunca por documento. A confirmação formal dessas premissas pela pessoa responsável continua prevista na validação humana (T106).

## Objetivos

- O gestor planeja uma viagem completa (veículo, motorista, paradas em ordem e cilindros por parada) e vê tudo antes de iniciar.
- Um cilindro nunca está em duas viagens abertas ao mesmo tempo.
- A viagem só inicia depois que todos os cilindros previstos foram conferidos e bloqueados, ou que as exceções foram justificadas por quem pode.
- Cada parada termina em **entrega completa** ou em **divergência** registrada, com os cilindros, o horário, o recebedor e a posição quando houver.
- A entrega e o desbloqueio são registros independentes, e o desbloqueio fora do fluxo normal exige verificação em duas etapas e justificativa.
- A custódia de cada cilindro muda com a viagem e fica no histórico imutável do cilindro (Spec 006).
- Nada é apagado: viagem cancelada continua visível, com o motivo.
- Toda ação sensível gera evento de histórico imutável e registro de auditoria.

## Atores

- **Gestor logístico**: planeja, inicia, acompanha, conclui e cancela viagens.
- **Operador de estoque**: separa e confere o carregamento dos cilindros da viagem.
- **Motorista (cadastro da Spec 007)**: é designado à viagem; nesta spec não opera telas próprias (o aplicativo de campo é da Fase 5).
- **Administrador do tenant**: tem todas as permissões de viagem e aprova exceções.
- **Auditor do tenant**: só consulta viagens e histórico.
- **Administrador FluxID (perfil global)**: só vê dados de uma organização quando atua com ela como organização ativa.
- **Natã Baracho**: validador oficial da validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Planejar uma viagem com paradas e cilindros (Prioridade: P1)

O gestor cria uma viagem escolhendo a data prevista, um veículo disponível e um motorista ativo; acrescenta paradas em unidades de clientes, na ordem de visita; e distribui, em cada parada, os cilindros que serão entregues. Antes de salvar ele vê o resumo: quantos cilindros, quantas paradas, a capacidade do veículo e os avisos.

**Por que esta prioridade**: sem a viagem planejada não há carregamento, transporte nem entrega. É a base de tudo.

**Teste independente**: criar uma viagem com duas paradas e quatro cilindros, ver o resumo, salvar, reabrir e conferir que a ordem, os cilindros por parada e o veículo e o motorista escolhidos estão guardados; tentar usar um cilindro já reservado em outra viagem e ser recusado.

**Cenários de aceitação**:

1. **Dado** um veículo disponível, um motorista ativo e uma unidade ativa de cliente ativo, **quando** o gestor salva a viagem com uma parada e dois cilindros em estoque, **então** a viagem nasce "planejada", os dois cilindros ficam reservados para ela, um evento de histórico e um registro de auditoria são gravados e a tela mostra o resumo.
2. **Dado** um cilindro já reservado em outra viagem aberta, **quando** o gestor tenta incluí-lo, **então** o servidor recusa, a tela diz em qual viagem ele está e nada é gravado.
3. **Dado** mais cilindros do que a capacidade do veículo, **quando** a viagem é salva, **então** ela é recusada com a capacidade e a quantidade, sem gravar.
4. **Dado** um veículo em manutenção ou inativo, um motorista inativo, ou um cliente ou unidade inativos, **quando** o gestor os escolhe, **então** eles nem aparecem na escolha e o servidor recusa se o pedido insistir.
5. **Dado** um cilindro inativo, fora do estoque ou com teste hidrostático reprovado ou vencido, **quando** o gestor tenta incluí-lo, **então** é recusado com o motivo, sem exceção possível.
6. **Dado** uma viagem planejada, **quando** o gestor reordena, acrescenta ou remove paradas e cilindros, **então** as reservas acompanham a mudança, cada edição gera evento com valores anteriores e novos e a segunda gravação concorrente é recusada pela versão.
7. **Dado** que o veículo tem licenciamento vencido ou o motorista tem a CNH a vencer ou vencida, **quando** o gestor os escolhe, **então** a tela avisa com destaque (a CNH vencida impede iniciar, na história 2).
8. **Dado** a data prevista anterior a hoje, **quando** o gestor salva uma viagem nova, **então** é recusada com a mensagem junto do campo; **quando** edita uma viagem planejada cuja data ficou para trás, **então** a edição é aceita e a lista mostra "atrasada".

### História 2 — Conferir o carregamento e iniciar a viagem (Prioridade: P1)

No dia da saída, o operador abre a viagem planejada, confere cada cilindro previsto (um a um) e confirma o carregamento. Quando todos estão conferidos e bloqueados, o gestor inicia a viagem.

**Por que esta prioridade**: é a regra mais forte do PRD: "viagem só inicia com bloqueios confirmados" e "todos os cilindros previstos devem ser lidos no carregamento".

**Teste independente**: abrir uma viagem com três cilindros, conferir dois, tentar iniciar e ser recusado com o cilindro faltando; conferir o terceiro, iniciar, e ver os três em trânsito e a viagem "em andamento".

**Cenários de aceitação**:

1. **Dado** uma viagem planejada, **quando** o operador começa o carregamento, **então** a viagem passa para "carregando" e a lista de conferência mostra cada cilindro previsto como "pendente"; se o veículo ou o motorista já estiverem em outra viagem "carregando" ou "em andamento", **então** é recusado e a tela diz em qual viagem.
2. **Dado** a conferência, **quando** o operador confirma um cilindro, **então** ele fica "conferido", com quem confirmou e quando; **quando** desfaz a confirmação antes de iniciar, **então** volta a "pendente", com evento.
3. **Dado** que falta conferir algum cilindro, **quando** o gestor tenta iniciar, **então** o servidor recusa e a tela lista o que falta.
4. **Dado** que um cilindro previsto não pode ser carregado (avaria, não encontrado), **quando** o operador o retira da viagem com justificativa e permissão de exceção, **então** a reserva é liberada, o item vira divergência de carregamento no histórico e a viagem pode seguir com os demais.
5. **Dado** todos os cilindros conferidos, o motorista com CNH em dia e o veículo ainda disponível, **quando** o gestor inicia, **então** a viagem passa para "em andamento", cada cilindro passa a "em trânsito" e fora do estoque com um evento de custódia no histórico do cilindro, e a auditoria registra o início.
6. **Dado** o motorista com a CNH vencida, **quando** o gestor tenta iniciar, **então** é recusado com o motivo.
7. **Dado** que o veículo ou o motorista foram inativados depois do planejamento, **quando** o gestor tenta iniciar, **então** é recusado e a tela explica o que trocar.
8. **Dado** uma viagem "em andamento", **quando** alguém tenta editar paradas, ordem, veículo, motorista ou cilindros, **então** o servidor recusa (`INVALID_TRANSITION`) e a tela não oferece a ação de editar; o que mudou na rua é tratado por divergência, retorno ao estoque ou cancelamento.

### História 3 — Registrar a entrega ou a divergência em cada parada (Prioridade: P1)

Com a viagem em andamento, o gestor (ou o operador) registra, parada por parada, a chegada e o resultado: quais cilindros foram entregues, quem recebeu, quando e, se souber, onde. Se algo não bate, registra a divergência.

**Por que esta prioridade**: sem entrega registrada não há custódia no cliente nem encerramento da responsabilidade do motorista (US006).

**Teste independente**: numa viagem com duas paradas, registrar a primeira como entregue por completo (recebedor, horário, posição) e a segunda com um cilindro não entregue e justificativa; conferir o estado de cada cilindro e de cada parada.

**Cenários de aceitação**:

1. **Dado** uma viagem em andamento, **quando** o gestor registra a chegada à parada, **então** a parada passa para "no local", com horário e quem registrou; **quando** ela não é a próxima parada pendente da ordem planejada, **então** a chegada é aceita, a tela avisa "fora da ordem planejada" e o evento guarda essa marca, sem alterar a ordem.
2. **Dado** uma parada no local, **quando** o gestor marca todos os cilindros previstos como entregues e informa o nome e a função do recebedor, o horário e (opcional) a posição, **então** a parada passa para "entregue", cada cilindro passa a "no cliente" com um evento de custódia no histórico do cilindro e a auditoria registra a entrega.
3. **Dado** que um cilindro previsto não foi entregue, **quando** o gestor registra o resultado, **então** a parada passa para "com divergência", a justificativa é obrigatória por cilindro, e o cilindro não entregue continua "em trânsito" até nova decisão. **Dado** um cilindro que não estava previsto na parada, **quando** o gestor tenta incluí-lo no resultado, **então** o servidor recusa e a tela orienta a tratá-lo em outra viagem.
4. **Dado** uma parada concluída, **quando** o gestor tenta alterá-la, **então** é recusado: a correção é um novo registro com justificativa, e o original permanece no histórico.
5. **Dado** a posição informada, **quando** ela está fora da geocerca da unidade, **então** o registro é aceito, mas a tela e o evento destacam que a posição está fora da geocerca (a consulta espacial é a da Spec 007).
6. **Dado** o recebedor, **quando** o registro é salvo, **então** só o nome e a função são guardados, sem documento, e o nome não aparece em log nem em auditoria em texto aberto.
7. **Dado** que a viagem ainda não foi iniciada ou já foi encerrada, **quando** alguém tenta registrar entrega, **então** o servidor recusa.

### História 4 — Registrar o desbloqueio como ato independente (Prioridade: P2)

Depois da entrega, o gestor registra o desbloqueio dos cilindros entregues. O desbloqueio **não** é consequência automática da entrega: é um registro próprio, com quem fez e quando. Fora do fluxo normal (antes da entrega, ou cilindro não entregue), exige verificação em duas etapas e justificativa.

**Por que esta prioridade**: o PRD manda que entrega e desbloqueio sejam independentes e que o desbloqueio excepcional tenha MFA e auditoria.

**Teste independente**: entregar dois cilindros, registrar o desbloqueio de um deles e conferir que o outro continua "bloqueado"; tentar desbloquear um cilindro ainda em trânsito sem o segundo fator e ser recusado.

**Cenários de aceitação**:

1. **Dado** um cilindro entregue e ainda bloqueado, **quando** o gestor com permissão registra o desbloqueio, **então** o bloqueio passa para "desbloqueado", com autor e horário, e um evento entra no histórico, sem alterar a situação da entrega.
2. **Dado** um cilindro ainda em trânsito, **quando** alguém pede o desbloqueio excepcional, **então** o servidor exige a verificação em duas etapas (aal2), a permissão de exceção e a justificativa; sem qualquer um deles, recusa.
3. **Dado** um desbloqueio registrado, **quando** a pessoa quer desfazê-lo, **então** não pode: um novo bloqueio é um novo registro.
4. **Dado** que esta fase não comanda a trava do lacre, **quando** o desbloqueio é registrado, **então** a tela deixa claro que é um registro lógico e que o comando à trava virá com a integração da Fase 6.

### História 5 — Concluir ou cancelar uma viagem (Prioridade: P2)

Quando todas as paradas estão encerradas, o gestor conclui a viagem. Antes de iniciar, ou com justificativa depois, ele pode cancelá-la, liberando as reservas.

**Teste independente**: concluir uma viagem com todas as paradas encerradas; cancelar outra planejada e ver os cilindros voltarem a "disponíveis para viagem"; tentar concluir com uma parada aberta e ser recusado.

**Cenários de aceitação**:

1. **Dado** todas as paradas "entregue" ou "com divergência" tratada, **quando** o gestor conclui, **então** a viagem passa para "concluída" e a auditoria registra.
2. **Dado** uma parada ainda aberta, **quando** o gestor tenta concluir, **então** é recusado e a tela mostra a parada.
3. **Dado** uma viagem planejada ou carregando, **quando** o gestor cancela com justificativa, **então** ela passa para "cancelada", as reservas são liberadas e os cilindros seguem em estoque.
4. **Dado** uma viagem em andamento, **quando** o gestor cancela, **então** exige a permissão de exceção e a justificativa, e os cilindros já em trânsito continuam "em trânsito" até a decisão de cada um (retorno ao estoque é registro próprio).
5. **Dado** uma viagem concluída ou cancelada, **quando** alguém tenta editá-la, **então** é recusado.

### História 6 — Consultar viagens e o histórico (Prioridade: P2)

A pessoa vê a lista de viagens, filtra por situação, data, veículo, motorista e cliente, abre o detalhe com paradas, cilindros, conferência, entregas, desbloqueios e o histórico completo.

**Teste independente**: com viagens em todas as situações, filtrar por cada uma, abrir o detalhe de uma concluída e reconstruir quem fez o quê e quando, sem editar nada.

**Cenários de aceitação**:

1. **Dado** a lista, **quando** a pessoa filtra e ordena, **então** o resultado respeita os filtros combinados, o total é anunciado e o Tenant B nunca aparece para o Tenant A.
2. **Dado** o detalhe, **quando** o auditor o abre, **então** vê tudo e nenhuma ação de escrita.
3. **Dado** o histórico, **quando** é aberto, **então** os eventos são imutáveis, ordenados e sem dado pessoal além do nome do recebedor mostrado a quem tem permissão.
4. **Dado** o cilindro e a unidade, **quando** o detalhe de cada um é aberto, **então** mostra as viagens em que apareceu (Specs 006 e 007), com link.

### História 7 — Usar tudo em celular, tablet e desktop, só com teclado (Prioridade: P3)

Todas as telas funcionam de 360 px a desktop amplo, só com teclado, com leitor de tela, com estados de carregamento, vazio, erro e offline, no padrão visual da Spec 005.

**Cenários de aceitação**:

1. **Dado** qualquer tela de viagem em 360, 768 e 1920 px, **quando** aberta, **então** não há rolagem horizontal e o conteúdo ocupa toda a largura.
2. **Dado** a conferência e o registro de entrega, **quando** feitos só com teclado, **então** todos os controles são alcançáveis, o foco é visível e os resultados são anunciados.
3. **Dado** o aparelho sem conexão, **quando** a pessoa abre uma tela de viagem, **então** a estrutura aparece, as ações de escrita ficam desabilitadas com o motivo e nada é enfileirado (a fila offline é da Fase 5).

## Requisitos funcionais

### Viagem

- **RF-001**: A organização deve poder planejar uma viagem com data prevista, um veículo disponível, um motorista ativo e observações opcionais; a viagem nasce "planejada" e recebe um número sequencial por organização.
- **RF-001a**: A data prevista de uma viagem nova não pode ser anterior ao dia de hoje em `America/Sao_Paulo`; viagem "planejada" ou "carregando" cuja data já passou continua editável e é mostrada como "atrasada" na lista e no detalhe, sem mudança de situação.
- **RF-002**: Uma viagem deve ter de 1 a 30 paradas, ordenadas, cada uma numa unidade ativa de cliente ativo; a mesma unidade pode aparecer em mais de uma parada.
- **RF-003**: Cada parada deve ter de 1 a 200 cilindros previstos, e a viagem não pode passar da capacidade em cilindros do veículo.
- **RF-004**: Um cilindro só pode estar em uma viagem aberta (planejada, carregando ou em andamento) por vez; a reserva é feita no servidor, de forma atômica, de modo que duas gravações concorrentes não reservem o mesmo cilindro.
- **RF-005**: Só podem entrar numa viagem cilindros ativos, em estoque e com teste hidrostático em dia ou a vencer; cilindro com teste vencido ou reprovado é recusado, sem exceção.
- **RF-006a**: Um veículo e um motorista só podem estar em uma viagem "carregando" ou "em andamento" por vez. Várias viagens "planejadas" podem usar o mesmo veículo ou motorista, com aviso na tela quando a data coincide; iniciar o carregamento (e, por segurança, iniciar a viagem) é recusado quando o veículo ou o motorista já estão em outra viagem aberta, e a recusa diz qual é a viagem.
- **RF-006**: Só a viagem planejada ou carregando pode ser editada; viagem em andamento não aceita edição de paradas, ordem, veículo, motorista nem cilindros. A viagem planejada ou carregando pode ser editada (veículo, motorista, data, paradas, ordem, cilindros) com controle de versão otimista, e cada edição gera evento com valores anteriores e novos; reservas acompanham a edição.

### Situações

- **RF-007**: A viagem tem as situações "planejada", "carregando", "em andamento", "concluída" e "cancelada", e só as transições definidas nas regras de negócio são aceitas, sempre pelo servidor.
- **RF-008**: A parada tem as situações "pendente", "no local", "entregue" e "com divergência". O item de carga (cilindro numa parada) tem uma situação própria: "previsto", "conferido", "em trânsito", "entregue", "não entregue" ou "retirado".
- **RF-009**: O bloqueio do cilindro na viagem tem situação própria e independente: "sem bloqueio", "bloqueado (lógico)" e "desbloqueado". O bloqueio lógico é a reserva do cilindro mais a marca de bloqueado; a confirmação pela trava do lacre ("bloqueado pelo dispositivo") só existirá na Fase 6, e o modelo já deixa a situação preparada para ela. Nenhuma dessas situações é derivada de outra, e todas são mostradas separadamente.

### Carregamento e início

- **RF-010**: O carregamento deve permitir confirmar e desfazer a confirmação de cada cilindro previsto, registrando quem e quando, enquanto a viagem não foi iniciada.
- **RF-011**: A viagem só pode iniciar quando todos os cilindros previstos estiverem conferidos e bloqueados, nenhum cilindro estiver com teste vencido ou reprovado, o veículo ainda estiver disponível, o motorista ativo e com CNH válida; ao iniciar, os cilindros saem do estoque e passam a "em trânsito", com evento de custódia no histórico de cada um.
- **RF-012**: Retirar da viagem um cilindro previsto que não pôde ser carregado exige justificativa e permissão de exceção, libera a reserva e fica como divergência de carregamento.

### Entrega

- **RF-013**: A entrega é registrada **uma vez por parada**, com o resultado de cada cilindro previsto (entregue ou não entregue); a chegada pode ser registrada em qualquer parada pendente, com aviso e marca "fora de ordem" no evento quando não for a próxima da ordem planejada; o registro da chegada e da entrega em cada parada deve guardar quem registrou, o horário, os cilindros entregues, o nome e a função do recebedor e, opcionalmente, a posição (latitude e longitude) ou a marca "no endereço da unidade".
- **RF-014**: Quando algum cilindro previsto não é entregue, a parada fica "com divergência" e a justificativa é obrigatória para cada cilindro; a divergência permanece visível até ser tratada. Cilindro que não estava previsto na parada não pode ser registrado na entrega.
- **RF-015**: A entrega registrada não pode ser editada nem apagada; a correção é um novo registro com justificativa, e o original permanece no histórico.
- **RF-016**: A posição informada fora da geocerca da unidade deve ser aceita e destacada na tela e no evento, usando a consulta espacial da Spec 007; sem geocerca ativa, nenhuma comparação é feita e a tela informa isso.
- **RF-017**: O recebedor é registrado só por nome e função; nenhum documento do recebedor é coletado.

### Desbloqueio

- **RF-018**: O desbloqueio deve ser um registro próprio por cilindro, com autor, horário e justificativa quando exigida, independente da entrega e sem desfazer.
- **RF-019**: O desbloqueio de cilindro entregue exige a permissão de desbloqueio; o desbloqueio excepcional (cilindro ainda em trânsito ou não entregue) exige, além disso, a permissão de exceção, a verificação em duas etapas (aal2) conferida no servidor e a justificativa.
- **RF-020**: Esta spec não envia comando a nenhuma trava de lacre: o bloqueio e o desbloqueio são registros lógicos, e a tela diz que a trava física será comandada e confirmada pela integração da Fase 6.

### Encerramento

- **RF-021**: A viagem só pode ser concluída quando todas as paradas estiverem "entregue" ou "com divergência" com decisão registrada para cada cilindro não entregue. A decisão é uma correção que entrega o cilindro (enquanto a viagem está em andamento) ou o retorno ao estoque (RF-023).
- **RF-022**: A viagem planejada ou carregando pode ser cancelada com justificativa, liberando as reservas; a viagem em andamento só pode ser cancelada com a permissão de exceção e a justificativa; viagem concluída ou cancelada não aceita edição. Em viagem cancelada em andamento só o retorno ao estoque resolve um cilindro em trânsito, pois não se registra mais entrega nela.
- **RF-023**: O retorno ao estoque de um cilindro que ficou em trânsito é um registro próprio, com justificativa, e gera evento de custódia.

### Custódia e histórico

- **RF-024**: Cada mudança de situação do cilindro causada pela viagem (reserva, saída do estoque, entrega, retorno) deve gerar um evento de custódia imutável no histórico do cilindro (Spec 006), apontando a viagem.
- **RF-024a**: Enquanto um cilindro tiver item de carga aberto (planejado, conferido, em trânsito ou não entregue), a **entrada no estoque** (`stock_in_cylinder`) e a **inativação** (`inactivate_cylinder`) da Spec 006 são recusadas com o código `CYLINDER_IN_TRIP`, que informa a viagem; o caminho para voltar ao estoque é o retorno registrado na viagem (RF-023). A reativação não é afetada.
- **RF-025**: Cada viagem deve ter um histórico imutável e ordenado de eventos (criação, edições, conferências, início, chegadas, entregas, divergências, desbloqueios, conclusão, cancelamento), com autor, horário, justificativa quando houver e sem dado pessoal além do nome do recebedor, mostrado só a quem tem permissão.

### Consulta e telas

- **RF-026**: A lista de viagens deve ter busca (número, veículo, motorista, cliente), filtros (situação, data, veículo, motorista, cliente), ordenação e paginação, com o total anunciado; o filtro padrão mostra as viagens abertas.
- **RF-027**: O detalhe da viagem deve mostrar paradas, cilindros, situações, conferência, entregas, desbloqueios, avisos e o histórico, e levar às telas do veículo, do motorista, do cliente, da unidade e do cilindro.
- **RF-028**: O menu deve ganhar a entrada "Viagens", visível só a quem tem permissão de ver viagens, e as telas de cadastro e de operação abrem em modal ou página conforme o padrão da Spec 007.

### Segurança, multitenancy e auditoria

- **RF-029**: Toda tabela nova deve ter `organization_id` e RLS, testada com pelo menos dois tenants, confirmando o acesso permitido e o bloqueado; veículo, motorista, unidade e cilindros de uma viagem devem pertencer à mesma organização dela.
- **RF-030**: Toda leitura e escrita passa pelo servidor com permissão conferida no banco; nenhuma credencial privilegiada existe no cliente.
- **RF-031**: As permissões novas devem existir no catálogo e ser atribuídas aos papéis: ver viagens, planejar e editar, operar (conferir, iniciar e registrar entrega), cancelar, desbloquear, aprovar exceções (crítica) e ver o histórico.
- **RF-032**: Toda ação sensível (planejar, editar, conferir, iniciar, entregar, divergir, desbloquear, retornar ao estoque, concluir, cancelar) gera registro de auditoria sem o nome do recebedor em texto aberto.
- **RF-033**: Nenhum dado é excluído fisicamente.

## Requisitos não funcionais

- **RNF-001**: Com o volume de referência (10 000 viagens e 200 000 itens de carga) e em conexão 4G, a lista de viagens responde em até 2 segundos e o detalhe em até 1,5 segundo, no p95.
- **RNF-002**: A reserva de cilindros suporta gravações concorrentes sem reserva duplicada (verificado por teste de concorrência no banco).
- **RNF-003**: As telas atendem WCAG 2.2 AA, de 360 px a desktop amplo, sem rolagem horizontal, no padrão visual da Spec 005 (tokens, componentes, ícones e Montserrat da Spec 003).
- **RNF-004**: Nenhum segredo, token ou dado pessoal desnecessário entra em log, auditoria em texto aberto ou repositório.

## Regras de negócio

- Transições da viagem: planejada → carregando → em andamento → concluída; planejada ou carregando → cancelada; em andamento → cancelada (com exceção). Nenhuma outra é aceita, e carregando pode voltar a planejada enquanto nada foi conferido.
- Um cilindro está em no máximo uma viagem aberta; ao fechar a viagem (concluída ou cancelada), as reservas acabam.
- Viagem só inicia com todos os cilindros previstos conferidos e bloqueados.
- Entrega e desbloqueio são registros independentes; um não dispara o outro.
- Exceções exigem justificativa e permissão; desbloqueio excepcional exige também MFA.
- Situação da viagem, da parada, do item de carga, do bloqueio, do estoque e do cilindro (ativo ou inativo) são estados independentes (Constituição, princípio IV).
- Eventos de custódia e de auditoria são imutáveis.
- Uma operação repetida com o mesmo identificador de pedido não duplica registro (idempotência), para a Fase 5 poder reenviar sem risco.

## Critérios de aceitação transversais

- **CA-001**: O Tenant B nunca lê nem escreve viagem, parada, item de carga, conferência, entrega ou desbloqueio do Tenant A, nem por pedido direto com identificadores trocados.
- **CA-002**: Duas pessoas planejando ao mesmo tempo o mesmo cilindro resultam em uma só reserva; a outra recebe a recusa com a viagem que o reservou.
- **CA-003**: Nenhuma transição de situação fora da tabela de regras é aceita, nem por pedido direto ao servidor.
- **CA-004**: Iniciar sem todos os cilindros conferidos e bloqueados é recusado pelo servidor, e nada muda.
- **CA-005**: Desbloqueio excepcional sem aal2, sem permissão de exceção ou sem justificativa é recusado.
- **CA-006**: Toda ação sensível gera evento e auditoria, e eventos de custódia aparecem no histórico do cilindro.
- **CA-007**: O nome do recebedor não aparece em log, em auditoria em texto aberto nem em quem não tem permissão.
- **CA-008**: As telas passam na verificação de acessibilidade automatizada (axe) em 360, 768 e 1920 px, sem violação crítica ou grave, e são operáveis só com teclado.

## Cenários de exceção e casos de borda

- Cilindro desativado (Spec 006) ou unidade, cliente, veículo ou motorista inativados **depois** do planejamento: a viagem planejada mostra o aviso e o servidor recusa o início até a troca; viagem em andamento não é afetada.
- Cliente anonimizado (Spec 007) numa viagem aberta: o nome continua o fixo "anonimizado" e a entrega segue registrável.
- Pedido de planejamento repetido (duplo clique): a idempotência devolve a mesma viagem.
- Conexão perdida no meio de um registro: a tela diz que o resultado é desconhecido e a repetição não duplica.
- Capacidade do veículo trocada por outro veículo menor com a viagem já carregada: recusado enquanto houver mais cilindros que a capacidade.
- Mesmo cilindro em duas paradas da mesma viagem: recusado.
- Parada sem geocerca ativa: a posição é aceita e a tela informa que não há comparação.
- Sessão expirada no meio da operação: nada é gravado e a pessoa é levada a entrar de novo.

## Entidades principais

- **Viagem**: número por organização, data prevista, veículo, motorista, situação, observações, versão.
- **Parada**: viagem, unidade, ordem, situação, horário de chegada, recebedor (nome e função), posição opcional, resultado.
- **Item de carga**: parada, cilindro, situação do item, conferência (quem e quando), situação do bloqueio, divergência e justificativa.
- **Registro de desbloqueio**: item de carga, autor, horário, justificativa, indicador de exceção.
- **Evento de viagem**: histórico imutável com autor, horário, tipo, justificativa e dados sem informação pessoal.
- **Evento de custódia do cilindro**: já existente (Spec 006), passa a apontar a viagem.

## Dependências

- Spec 006: cilindros, estoque, teste hidrostático e histórico de custódia.
- Spec 007: clientes, unidades, geocercas (consulta de ponto), veículos e motoristas, com situação, histórico e anonimização.
- Specs 002, 004 e 005: autenticação, MFA (aal2), RBAC, RLS, menu por permissão e padrão visual.
- PRD, seções 4, 10 e 15.

## Premissas e decisões assumidas

1. O bloqueio desta spec é lógico (cilindro reservado e marcado como bloqueado, decisão de 08/10/2026); o comando à trava do lacre, a confirmação do dispositivo e os estados da trava são da Fase 6 (Constituição, princípio IV: o sistema não presume que um comando físico foi executado).
2. A conferência é humana, por confirmação item a item; a leitura por QR Code, Data Matrix e NFC (RF010) é da Fase 5 e deve poder substituir a confirmação sem mudar o modelo.
3. A posição da entrega é informada, não capturada; o GPS do celular e do lacre é da Fase 5, e a proximidade, da Fase 7.
4. O motorista não opera telas nesta spec; quem registra conferência e entrega é a equipe do escritório e do estoque. O vínculo motorista-usuário da Spec 007 serve à Fase 5.
5. Teste hidrostático vencido ou reprovado impede a inclusão e o início (decisão de 08/10/2026); licenciamento vencido do veículo só avisa; CNH vencida impede iniciar.
6. O recebedor é só nome e função, sem documento, para minimizar dados pessoais.
7. Limites iniciais: 30 paradas por viagem, 200 cilindros por parada e capacidade do veículo como teto; ajustáveis por spec futura.
8. O retorno ao estoque e o recolhimento de cilindros do cliente (passos 13 e 14 da jornada) ficam para spec futura; aqui existe apenas o retorno de cilindro que não foi entregue.
9. A numeração sequencial da viagem é por organização e não é reaproveitada.
10. A operação em lote (importação de viagens) e a otimização de rota não fazem parte desta spec.

## Fora do escopo

- Aplicativo de campo, leitura por câmera ou NFC, GPS, fotos e assinatura de entrega, fila offline e sincronização (Fase 5).
- Comandos e telemetria IoT, estados de trava, desbloqueio físico (Fase 6).
- Proximidade, geocerca do cliente após a entrega, alertas e relatórios (Fase 7).
- Recolhimento e retorno de cilindros vazios do cliente (passos 13 e 14 da jornada).
- Otimização de rota, cálculo de distância e tempo, mapa interativo com camadas.
- Importação em massa e exportação de relatórios.

## Métricas de sucesso

- **MS-001**: Um gestor planeja uma viagem com duas paradas e quatro cilindros em até 4 minutos.
- **MS-002**: O operador confere o carregamento de dez cilindros e o gestor inicia a viagem em até 5 minutos.
- **MS-003**: O registro de uma entrega completa numa parada leva até 2 minutos.
- **MS-004**: 0 cilindro reservado em duas viagens abertas, em todos os testes, inclusive nos de concorrência.
- **MS-005**: 0 vazamento de dados entre organizações nos testes de RLS.
- **MS-006**: 100% das ações sensíveis com evento e auditoria, e 0 ocorrência do nome do recebedor em log.
- **MS-007**: Um auditor reconstrói o histórico de uma viagem concluída em até 3 minutos, sem editar nada.
- **MS-008**: 0 violação crítica ou grave de acessibilidade e 0 rolagem horizontal em 360, 768 e 1920 px.
