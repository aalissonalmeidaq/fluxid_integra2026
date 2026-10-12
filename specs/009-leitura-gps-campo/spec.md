# Especificação da funcionalidade: Leitura de identificadores e GPS no aplicativo de campo

**Branch da funcionalidade**: `feat/009-leitura-gps-campo` (criada depois da integração da Spec 008, PRs #28 a #30)

**Criada em**: 12/10/2026

**Status**: Rascunho

**Entrada**: Fase 5 do plano de implementação do PRD (`docs/prd.md`, seção 15), primeira parte: leitura de identificadores (QR Code, Data Matrix e etiqueta NFC) e posição por GPS no celular de quem opera. A fila offline e a sincronização (parte 2 da fase), as fotos e a assinatura de entrega (Spec 010) e a trava física do lacre (Fase 6) ficam fora.

## Contexto

Com a Spec 006 o FluxID passou a conhecer os identificadores de cada cilindro e a ler QR Code e Data Matrix pela câmera nos campos de identificador. Com a Spec 008 a viagem ganhou conferência de carga e entrega, mas de forma deliberadamente manual: o operador confirma **cilindro por cilindro, na tela**, e a posição da entrega é **digitada** (coordenadas) ou marcada como "no endereço da unidade". Aquelas duas specs deixaram dito, em mais de um lugar, que a leitura e o GPS entram na Fase 5 **sem mudar o modelo de dados nem as regras**.

Esta spec cumpre essa promessa. Na rua e no pátio, a pessoa usa o celular: aponta a câmera ou encosta o aparelho na etiqueta para conferir o cilindro, e o celular informa onde ela está ao chegar e ao entregar. O ganho é velocidade e confiança no registro (menos digitação, menos engano de cilindro, posição real em vez de posição declarada). As **regras da viagem não mudam**: o servidor continua sendo quem decide, a conferência continua podendo ser feita à mão, e a posição continua sendo opcional onde já era (ver Clarifications).

Três pontos tornam a spec delicada: a **localização é dado pessoal** de quem dirige e só pode ser lida no momento de um registro, nunca em rastreamento contínuo (o rastreamento do veículo é da Fase 7); **câmera, NFC e GPS dependem do navegador e do aparelho**, então o fluxo manual precisa continuar completo quando eles faltam; e **a leitura de um código nunca pode revelar cilindro de outra organização**.

## Clarifications

### Session 2026-10-12

- Q: A parte da Fase 5 desta spec cobre quais recursos? → A: **Leitura (QR Code, Data Matrix e NFC) e GPS**. Fila offline e sincronização, fotos e assinatura ficam para a Spec 010 (decidido pela pessoa responsável em 12/10/2026).
- Q: Se o GPS devolver uma posição com precisão ruim, a entrega fica bloqueada? → A: **Só avisa e permite salvar** (decidido em 12/10/2026): precisão pior que 100 m é destacada em texto na tela e no evento, e o registro pode ser salvo, porque sinal ruim é comum no campo; a precisão fica guardada para o auditor.
- Q: Na tela de entrega de uma parada, a pessoa pode ler o código de cada cilindro para marcá-lo como "entregue"? → A: **Sim**: ler o código marca o cilindro previsto da parada como "entregue", com o método registrado; marcar "não entregue" e a justificativa continuam manuais.
- Q: Quando a pessoa encosta o celular numa etiqueta NFC, qual informação da etiqueta é comparada com o identificador NFC cadastrado do cilindro? → A: **O número de série da etiqueta e, se houver, o texto gravado nela** (decidido em 12/10/2026, revendo a resposta anterior "só o texto gravado"): o número de série vem de fábrica, aproveita as etiquetas já cadastradas na Spec 006 e dispensa regravar etiquetas; o texto gravado, quando existe, também é aceito. O número de série é comparado sem separadores e sem diferença entre maiúsculas e minúsculas; valores cadastrados em outro formato (por exemplo decimal, ou com bytes em outra ordem) não casam e a leitura responde "não encontrado" com a dica de conferir o formato.
- Q: Quando a pessoa lê um código que não é de nenhum cilindro da viagem, a tela revela em qual viagem ele está? → A: **Só a quem tem a permissão de ver viagens** (mesma regra dos conflitos de reserva da Spec 008); aos demais a tela diz apenas "não pertence a esta viagem".
- Q: Quem tem a permissão de ver cilindros, mas não a de operar viagens, pode usar "Ler cilindro"? → A: **Sim**: a consulta por leitura é só de leitura e vale para quem pode ver cilindros (inclusive o auditor); conferir e entregar seguem exigindo as permissões da Spec 008.
- Q: Como o método de conferência é registrado quando o código chega por digitação, colagem ou leitor físico que age como teclado? → A: **Quatro métodos**: "toque" (confirmação na tela, sem código), "código digitado ou leitor" (digitação, colagem e leitor-teclado, que o navegador não distingue), "câmera" e "NFC".
- Q: "Usar minha posição" substitui coordenadas que a pessoa já digitou? → A: **Só depois de perguntar**: a tela pede confirmação antes de substituir; ao aceitar, o campo passa a ter só a posição do GPS (origem "GPS"); se a pessoa editar o número à mão depois, a origem muda para "informada".
- Q: Por quanto tempo as coordenadas da chegada e da entrega ficam guardadas, e a quem continuam visíveis? → A: **Enquanto a viagem existir**, sem exclusão física (Spec 008, RF-033), e visíveis só a quem tem a permissão de ver viagens; prazo de retenção e anonimização das coordenadas ficam para uma spec de privacidade futura.
- Q: Se a pessoa abre a janela de leitura e deixa o celular parado sem ler nada, a câmera e o leitor NFC desligam sozinhos depois de quanto tempo? → A: **Após 2 minutos sem nenhuma leitura**: a câmera e o NFC desligam, a tela avisa em texto e oferece "Continuar lendo"; a janela e os resultados já lidos continuam.
- Q: A posição por GPS passa a ser obrigatória na chegada e na entrega? → A: **Continua opcional** (decidido em 12/10/2026): vale a regra da Spec 008 (RF-013); o GPS é a forma preferida, mas a posição pode ficar em branco, informada ou marcada como "no endereço da unidade".

## Objetivos

- O operador confere o carregamento lendo o identificador de cada cilindro com a câmera ou com a etiqueta NFC, e a viagem registra **como** cada cilindro foi conferido.
- O motorista ou o gestor registra a chegada e a entrega com a posição vinda do GPS do aparelho, com a precisão e a origem guardadas.
- Qualquer pessoa autorizada abre o cilindro certo lendo o código, sem digitar.
- Quando câmera, NFC ou GPS faltam, estão bloqueados ou erram, a tela explica e o fluxo manual da Spec 008 continua completo.
- A leitura nunca expõe cilindro de outra organização, e a localização nunca é lida fora de um registro.
- Toda ação sensível continua gerando evento imutável e auditoria, agora com o método de leitura e a origem da posição.

## Atores

- **Operador de estoque**: confere o carregamento lendo os cilindros.
- **Motorista (cadastro da Spec 007)**: continua sem tela própria de campo com login; quem registra no campo é a pessoa autorizada que usa o celular com a viagem aberta (gestor ou operador com permissão de operar viagens).
- **Gestor logístico**: registra chegada e entrega no local e consulta cilindros.
- **Administrador do tenant**: tem todas as permissões de viagem e de cilindro.
- **Auditor do tenant**: só consulta; vê o método de leitura e a origem da posição, sem ação de escrita.
- **Administrador FluxID (perfil global)**: só vê dados de uma organização quando atua com ela como organização ativa.
- **Natã Baracho**: validador oficial da validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Conferir o carregamento e a entrega lendo os cilindros (Prioridade: P1)

Na conferência de carga de uma viagem "planejada" ou "carregando", o operador abre a leitura, aponta a câmera para o QR Code ou o Data Matrix de um cilindro (ou encosta o aparelho na etiqueta NFC) e o cilindro é conferido na hora, com som, vibração ou texto de confirmação. Cilindro que não é da viagem, que já foi conferido ou que não existe na organização é recusado com o motivo. O operador pode seguir lendo em sequência e desfazer uma leitura. Na tela de entrega de uma parada, a mesma leitura marca cada cilindro previsto como "entregue"; "não entregue" e a justificativa continuam manuais.

**Por que esta prioridade**: é o ganho central da fase e o ponto onde o erro de cilindro trocado custa mais. Sem ela, a Spec 008 continua toda manual.

**Teste independente**: com uma viagem de quatro cilindros e leituras simuladas de código, ler os quatro, confirmar que cada um fica "conferido" com o método registrado, e que um código de cilindro de outra viagem e um de outra organização são recusados.

**Cenários de aceitação**:

1. **Dado** uma viagem carregando e um cilindro previsto, **quando** o operador lê o identificador ativo dele, **então** o cilindro fica "conferido", o evento guarda quem, quando e o método (câmera ou NFC) e a tela confirma em texto.
2. **Dado** um código de cilindro da organização que não pertence à viagem, **quando** ele é lido, **então** a leitura é recusada com o motivo e nada é conferido; quem tem a permissão de ver viagens vê também a viagem em que o cilindro está reservado, e os demais veem só "não pertence a esta viagem".
3. **Dado** um código que não existe na organização ou que pertence a outra organização, **quando** ele é lido, **então** a tela diz apenas que o cilindro não foi encontrado, sem revelar que existe em outra organização.
4. **Dado** um cilindro já conferido, **quando** ele é lido de novo, **então** a tela informa que já estava conferido e nenhum evento novo é criado.
5. **Dado** uma leitura repetida por duplo disparo da câmera, **quando** o mesmo código chega duas vezes em sequência curta, **então** é tratado como uma só leitura.
6. **Dado** a tela de entrega de uma parada, **quando** a pessoa lê o identificador de um cilindro previsto nela, **então** ele é marcado "entregue" na lista, com o método registrado, e a entrega só vale quando a pessoa a salva uma vez, como na Spec 008.
7. **Dado** a tela de entrega, **quando** a pessoa lê um cilindro que não é previsto naquela parada, **então** a leitura é recusada com o motivo e o cilindro não entra na entrega (Spec 008, RF-014).
8. **Dado** um aparelho sem câmera ou sem leitor compatível, **quando** a pessoa abre a conferência ou a entrega, **então** a conferência manual, a digitação e o leitor que age como teclado seguem completos e a tela explica por que a leitura não está disponível.

---

### História 2 — Registrar chegada e entrega com a posição do GPS (Prioridade: P1)

Ao registrar a chegada e a entrega numa parada, a pessoa toca em "Usar minha posição". O aparelho pede permissão, informa a posição e a precisão, e a tela as mostra (com a distância até a unidade e o aviso de fora da geocerca da Spec 007, quando houver). A posição é lida só nesse momento. Se a permissão for negada, a precisão for ruim ou o GPS estiver indisponível, a tela explica e oferece as alternativas manuais da Spec 008.

**Por que esta prioridade**: troca a posição declarada por posição medida, que é a evidência de entrega do PRD (RF014), e é a regra de privacidade mais sensível da spec.

**Teste independente**: com posição simulada dentro e fora da geocerca da unidade, registrar a entrega, confirmar a origem "GPS" e a precisão no evento, e repetir com permissão negada para confirmar o caminho manual.

**Cenários de aceitação**:

1. **Dado** a tela de chegada ou de entrega, **quando** a pessoa toca em "Usar minha posição" e permite, **então** a tela mostra latitude, longitude, precisão e, havendo geocerca ativa, se está dentro ou fora; ao salvar, o registro guarda a origem "GPS" e a precisão.
2. **Dado** uma posição fora da geocerca da unidade, **quando** a entrega é salva, **então** ela é aceita e destacada, como na Spec 008 (RF-016).
3. **Dado** a permissão negada, **quando** a pessoa tenta usar o GPS, **então** a tela explica como liberar a permissão e oferece as coordenadas digitadas, registradas com a origem "informada"; na entrega, oferece também "no endereço da unidade". Na chegada a posição pode ficar em branco.
4. **Dado** o GPS indisponível ou com tempo esgotado, **quando** a leitura falha, **então** a tela explica o motivo em texto e permite tentar de novo ou usar a alternativa manual, sem perder o que já foi preenchido.
5. **Dado** uma posição com precisão ruim, **quando** a pessoa tenta salvar, **então** a tela destaca a precisão ruim em texto (pior que 100 m), permite salvar e o registro guarda a precisão.
6. **Dado** uma posição lida há mais de dois minutos, **quando** a pessoa salva, **então** a posição é descartada e lida de novo, para nunca gravar posição velha como se fosse do momento.
7. **Dado** coordenadas já digitadas, **quando** a pessoa toca em "Usar minha posição", **então** a tela pede confirmação antes de substituí-las; ao aceitar, a origem é "GPS", e se ela editar o número à mão depois, a origem passa a "informada".
8. **Dado** a posição lida e a pessoa que sai da tela sem salvar, **quando** ela volta, **então** nenhuma posição ficou guardada no aparelho.

---

### História 3 — Consultar um cilindro lendo o código (Prioridade: P2)

Em qualquer tela autorizada, a pessoa toca em "Ler cilindro", lê o QR Code, o Data Matrix ou a etiqueta NFC e abre o detalhe do cilindro com identificadores, situação, custódia, testes e histórico, inclusive a viagem em que ele está, para quem tem permissão de ver viagens.

**Por que esta prioridade**: é o uso mais frequente no pátio ("que cilindro é este?") e reaproveita o detalhe que já existe, mas não bloqueia a conferência nem a entrega.

**Teste independente**: ler o identificador de um cilindro do Tenant A como pessoa do Tenant A e abrir o detalhe; repetir como pessoa do Tenant B e confirmar "não encontrado".

**Cenários de aceitação**:

1. **Dado** um identificador ativo de um cilindro da organização, **quando** ele é lido, **então** o detalhe do cilindro abre.
2. **Dado** um identificador desativado, **quando** ele é lido, **então** a tela informa que o identificador foi desativado e mostra para qual cilindro ele valia.
3. **Dado** um cilindro inativo, **quando** ele é lido, **então** a tela informa que o cilindro está inativo (Spec 006).
4. **Dado** uma pessoa sem permissão de ver cilindros, **quando** ela tenta a leitura, **então** a ação não é oferecida e o pedido direto ao servidor é negado.
5. **Dado** uma pessoa que só pode ver cilindros (por exemplo, o auditor), **quando** ela usa "Ler cilindro", **então** a consulta funciona e nenhuma ação de conferência ou entrega é oferecida.

---

### História 4 — Leitura e GPS acessíveis e funcionando no celular instalado (Prioridade: P2)

A leitura e a captura de posição funcionam no app instalado (PWA) e no navegador, em 360 px ou mais, só com toque ou também só com teclado onde houver alternativa, com foco visível, resultados anunciados a leitores de tela e sem depender de cor.

**Por que esta prioridade**: sem isso a tela de campo exclui quem usa tecnologia assistiva e quebra a promessa da Constituição (princípio V).

**Teste independente**: conferir um cilindro e registrar uma entrega só com teclado e com leitor de tela em 360, 768 e 1920 px, com leitura e posição simuladas, e rodar a verificação de acessibilidade automatizada.

**Cenários de aceitação**:

1. **Dado** a janela de leitura aberta, **quando** a pessoa usa o teclado, **então** o foco fica preso na janela, Escape fecha e devolve o foco ao botão que a abriu.
2. **Dado** uma leitura aceita ou recusada, **quando** ela acontece, **então** o resultado é anunciado em texto a leitores de tela, sem depender só de cor, som ou vibração.
3. **Dado** o aparelho offline, **quando** a pessoa abre a leitura, **então** a tela avisa que registrar exige conexão (a fila offline é da Spec 010) e as ações de escrita ficam desabilitadas, como na Spec 008.
4. **Dado** `prefers-reduced-motion`, **quando** a janela de leitura abre, **então** nada anima.
5. **Dado** a janela de leitura aberta e nenhuma leitura há 2 minutos, **quando** o tempo se esgota, **então** a câmera e o NFC desligam, a tela avisa em texto na região de status e oferece "Continuar lendo", sem fechar a janela nem perder os resultados já lidos.

### Casos de borda

- Câmera ocupada por outro aplicativo, permissão negada ou sem câmera traseira: a tela diz o que houve e mantém a digitação.
- Etiqueta NFC ilegível ou sem número de série utilizável: a leitura é recusada com o motivo, sem confundir com "cilindro não encontrado". Etiqueta legível cujo valor não existe na organização, inclusive a de número aleatório, responde "não encontrado".
- Mais de um código no quadro da câmera: nenhuma leitura é aceita naquele quadro; a tela avisa em texto "Há mais de um código no quadro. Aponte para um só." e segue lendo o próximo quadro.
- Código lido que é identificador de **outro tipo** (por exemplo número do casco digitado como QR): o valor é procurado como está; se não existir, "não encontrado".
- Leitura durante uma operação já em andamento (duplo toque em salvar): uma só operação, por chave de idempotência da Spec 008.
- Aparelho que perde a conexão depois da leitura e antes de salvar: a operação não é gravada e a pessoa é avisada (sem fila).
- Navegador que só dá localização aproximada (por política do aparelho): a precisão reflete isso e segue a regra de precisão baixa.
- Posição obtida em modo "simulado" ou "mock" do sistema: o navegador não distingue; o registro guarda precisão e horário, e a tela não promete autenticidade da posição.
- Dois cilindros com identificadores parecidos em organizações diferentes: cada leitura procura só na organização ativa.
- Zoom de 200% e orientação paisagem na janela de leitura: sem rolagem horizontal, com o vídeo contido.

## Requisitos

### Requisitos funcionais

**Leitura de identificadores**

- **RF-001**: A conferência de carga (Spec 008, RF-010) deve aceitar a leitura do identificador ativo de um cilindro, por câmera (QR Code e Data Matrix) ou por NFC, e conferir o cilindro previsto correspondente, registrando quem, quando e o **método** (toque, código digitado ou leitor, câmera ou NFC).
- **RF-002**: A leitura deve procurar o código só entre os identificadores da **organização ativa**; código inexistente ou de outra organização recebe a mesma resposta ("não encontrado"), sem nenhum dado do outro tenant.
- **RF-003**: A leitura de cilindro que não é da viagem, que já está conferido, ou que não está em situação de ser conferido deve ser recusada ou ignorada com o motivo em texto, sem criar evento; a viagem em que o cilindro está só é mostrada a quem tem a permissão de ver viagens.
- **RF-004**: Leituras repetidas do mesmo código em sequência curta devem valer como uma só.
- **RF-001a**: A tela de entrega de uma parada (Spec 008, RF-013) deve aceitar a mesma leitura para marcar como "entregue" o cilindro previsto na parada, registrando o método por cilindro; "não entregue", a justificativa e a correção de entrega continuam manuais, e cilindro não previsto na parada é recusado.
- **RF-005**: A pessoa deve poder desfazer a conferência feita por leitura, como já pode na Spec 008 (RF-010), e o método fica no histórico.
- **RF-006**: A tela "Ler cilindro" deve abrir o detalhe do cilindro (Spec 006) a partir de um identificador lido, para toda pessoa com a permissão de ver cilindros (inclusive o auditor, sem nenhuma ação de escrita), e informar identificador desativado ou cilindro inativo.
- **RF-007**: A leitura por NFC deve comparar o **número de série da etiqueta** e, quando houver, o **texto gravado nela** (registro de texto) ao valor dos identificadores NFC cadastrados (Spec 006), procurando só na organização ativa; o número de série é comparado sem separadores e sem diferença entre maiúsculas e minúsculas. Etiqueta que o aparelho não consegue ler ou sem número de série utilizável é recusada com o motivo. Etiqueta cujo número muda a cada leitura não é detectável: o valor não casa e a resposta é "não encontrado" (RN-005), com a dica de conferir o formato do valor cadastrado.
- **RF-008**: A conferência manual, a digitação e o leitor que age como teclado devem continuar completos e disponíveis em todo aparelho; leitura por câmera e NFC são opcionais e só aparecem onde o navegador as suporta.

**Posição por GPS**

- **RF-009**: A chegada e a entrega de uma parada (Spec 008, RF-013) devem permitir "Usar minha posição", que lê a posição do aparelho **uma vez**, no momento do pedido, e mostra latitude, longitude e precisão.
- **RF-010**: O registro de chegada e de entrega deve guardar a **origem da posição** e a precisão e o horário da leitura. Na **chegada** a origem é GPS ou informada (a chegada não tem "no endereço da unidade"); na **entrega** a origem é GPS, informada ou "no endereço da unidade", mantendo a exclusividade entre coordenadas e "no endereço da unidade" da Spec 008. A origem registrada deve sempre corresponder ao dado: "GPS" só para a posição lida pelo aparelho e sem edição manual posterior, "informada" para coordenadas digitadas ou editadas; por isso "Usar minha posição" só substitui coordenadas já digitadas depois de confirmação da pessoa.
- **RF-011**: A posição lida há mais de dois minutos antes de salvar deve ser descartada e lida de novo.
- **RF-012**: Permissão negada, tempo esgotado ou GPS indisponível devem explicar o motivo em texto e oferecer as alternativas manuais, sem perder os outros campos do formulário.
- **RF-013**: A posição fora da geocerca da unidade continua aceita e destacada (Spec 008, RF-016); a tela mostra a distância até a unidade quando houver geocerca ativa.
- **RF-014**: A precisão pior que 100 metros deve ser destacada em texto na tela e no evento, sem bloquear o registro; a posição continua **opcional** na chegada e na entrega (Spec 008, RF-013), e a ausência dela não impede o registro.
- **RF-015**: O sistema não deve guardar a posição no aparelho (nem em `localStorage`, `sessionStorage` ou IndexedDB) e não deve acompanhar a posição fora de um registro; não há rastreamento contínuo. No servidor, as coordenadas da chegada e da entrega ficam guardadas enquanto a viagem existir (nenhuma exclusão física) e só são visíveis a quem tem a permissão de ver viagens; prazo de retenção e anonimização ficam para uma spec de privacidade futura.

**Segurança, auditoria e privacidade**

- **RF-016**: Toda leitura e toda posição passam pelo servidor, com permissão conferida no banco; nenhuma credencial privilegiada existe no cliente.
- **RF-017**: A conferência por leitura, a chegada e a entrega com GPS continuam gerando evento imutável e registro de auditoria, agora com o método e a origem da posição, sem guardar coordenadas, nome do recebedor ou o código lido em texto aberto nos logs.
- **RF-018**: Nenhuma imagem da câmera é enviada, guardada ou registrada; a decodificação acontece no aparelho (Spec 006). A câmera e o leitor NFC desligam sozinhos após 2 minutos sem nenhuma leitura, com aviso em texto e a ação "Continuar lendo", mantendo a janela e os resultados já lidos.
- **RF-019**: Nenhuma permissão nova de domínio é criada; a leitura reaproveita as permissões de conferir carga, registrar entrega e ver cilindros da Spec 006 e da Spec 008.

**Interface e instalação**

- **RF-020**: A janela de leitura e o bloco de posição devem seguir o design system e a identidade visual da Spec 005, com estados de carregando, vazio, erro, sem suporte, permissão negada e offline.
- **RF-021**: As telas devem funcionar no app instalado (PWA) e no navegador, de 360 px a desktop amplo, sem rolagem horizontal, atendendo a WCAG 2.2 AA.
- **RF-022**: Offline, a leitura e a captura de posição podem ser abertas, mas **nenhuma escrita é feita**: as ações de salvar ficam desabilitadas com o motivo; a fila offline é da Spec 010.
- **RF-023**: Nenhum dado é excluído fisicamente.

### Requisitos não funcionais

- **RNF-001**: Do toque em "Ler" até o cilindro conferido na tela, o resultado deve aparecer em até 1 segundo, depois que o código é reconhecido, em conexão 4G.
- **RNF-002**: A leitura de posição deve ter tempo máximo declarado (até 15 segundos) e nunca travar a tela.
- **RNF-003**: As telas atendem WCAG 2.2 AA e o padrão visual da Spec 005 (tokens, componentes, ícones e Montserrat da Spec 003), sem valor arbitrário de Tailwind nem cor literal.
- **RNF-004**: Nenhum segredo, token, coordenada ou dado pessoal desnecessário entra em log, auditoria em texto aberto ou repositório.
- **RNF-005**: O pacote de entrada não cresce além do limite de 5% sobre a linha de base da Spec 008; a leitura e a posição carregam só quando a janela abre.

### Regras de negócio

- **RN-001**: A leitura **identifica**, não decide: quem muda a situação do cilindro é a mesma operação da Spec 008, validada pelo servidor.
- **RN-002**: O método de conferência (toque, código digitado ou leitor, câmera ou NFC) é informação do evento e não altera nenhuma regra de viagem.
- **RN-003**: A posição vinda do GPS é uma **evidência declarada pelo aparelho**, não uma prova: o sistema guarda precisão e horário e não afirma autenticidade.
- **RN-004**: Localização só é lida quando a pessoa pede, no momento de um registro, e nunca em segundo plano.
- **RN-005**: Código lido que não existe na organização ativa é sempre "não encontrado", por igual, para evitar descobrir cilindros de outros tenants.

### Entidades principais

- **Leitura de identificador (conceito de tela)**: valor lido, tipo (QR Code, Data Matrix, NFC), instante e resultado; não é gravada por si só, só vira dado quando uma conferência ou consulta a usa.
- **Evento de conferência e resultado de entrega por cilindro (estendem a Spec 008)**: ganham o **método** (toque, código digitado ou leitor, câmera ou NFC).
- **Registro de chegada e de entrega (estende a Spec 008)**: ganha a **origem da posição**, a **precisão** (em metros) e o **horário da leitura**, mantendo latitude, longitude e, só na entrega, "no endereço da unidade".
- **Identificador de cilindro (Spec 006)**: continua o vínculo entre o código lido e o cilindro; esta spec só o consulta.

## Critérios de aceitação transversais

- **CA-001**: O Tenant B nunca encontra, lê nem confere cilindro do Tenant A por leitura, nem por pedido direto com valores trocados; a resposta é a mesma de código inexistente.
- **CA-002**: Toda conferência ou entrega feita por leitura ou GPS gera evento e auditoria com o método e a origem da posição.
- **CA-003**: Sem câmera, NFC ou GPS, ou com permissão negada, todas as operações da Spec 008 continuam possíveis pelo fluxo manual.
- **CA-004**: Nenhuma coordenada, nome de recebedor ou código lido aparece em log ou auditoria em texto aberto.
- **CA-005**: A posição não é lida fora de um pedido explícito nem fica guardada no aparelho.
- **CA-006**: As telas passam na verificação de acessibilidade automatizada (axe) em 360, 768 e 1920 px, sem violação crítica ou grave, e são operáveis só com teclado onde há alternativa.
- **CA-007**: Offline, nenhuma escrita acontece e as ações ficam desabilitadas com o motivo.

## Critérios de sucesso

### Resultados mensuráveis

- **MS-001**: O operador confere dez cilindros lendo os códigos em até 3 minutos (a meta manual da Spec 008, MS-002, é de 5 minutos para conferir e iniciar).
- **MS-002**: O registro da chegada e da entrega completas numa parada, com a posição do GPS, leva até 90 segundos.
- **MS-003**: Em 100% das tentativas com permissão negada, câmera ausente ou NFC sem suporte, a pessoa conclui a mesma tarefa pelo fluxo manual.
- **MS-004**: 0 cilindro de outra organização encontrado por leitura, em todos os testes de RLS com dois tenants.
- **MS-005**: 100% das conferências e entregas por leitura ou GPS com evento, auditoria, método e origem da posição, e 0 coordenada em log.
- **MS-006**: 0 violação crítica ou grave de acessibilidade e 0 rolagem horizontal em 360, 768 e 1920 px.
- **MS-007**: Uma pessoa nova consulta um cilindro lendo o código, sem treinamento, em até 20 segundos.

## Premissas e dependências

- A Spec 008 está integrada à `main`; conferência manual, chegada, entrega, posição e histórico existem e são estendidos, não substituídos.
- A leitura por câmera usa o recurso do próprio navegador (hoje, Chrome no Android); sem ele, a câmera não aparece (Spec 006). A leitura por NFC também depende do navegador (hoje, Chrome no Android) e só aparece onde há suporte; iOS e navegadores sem suporte seguem pelo fluxo manual.
- O número de série da etiqueta (e o texto gravado, se houver) é comparado ao valor do identificador NFC cadastrado na Spec 006, que é texto livre e não tem formato fixo. Só casam as etiquetas cujo valor cadastrado está no formato hexadecimal do número de série; as demais precisam ser corrigidas pela transferência ou desativação já prevista na Spec 006. O sistema não grava nem formata etiquetas NFC. O número de série não é segredo e pode ser copiado para outra etiqueta; isso é aceito nesta fase, em que a leitura identifica o cilindro e não autentica a pessoa nem prova a presença do objeto.
- A posição continua opcional na chegada e na entrega, como na Spec 008; o limite de 100 m de precisão só gera aviso.
- Quem registra no campo é uma pessoa autorizada com a viagem aberta no celular; o login do motorista e o app só do motorista não fazem parte desta spec.
- As escritas exigem conexão; fila offline, fotos, assinatura, trava física, GPS contínuo e alertas de proximidade ficam para as Specs 010, Fase 6 e Fase 7.
- O princípio V da constituição pede um aplicativo de campo "tolerante a operação offline". Esta spec o atende em parte: a leitura e a captura de posição abrem sem conexão e as ações de salvar ficam desabilitadas com o motivo. A tolerância completa (fila e sincronização) é o objeto da Spec 010 e deve ser planejada antes de o aplicativo de campo ser usado fora da cobertura de rede.
- O consumo da API de localização e de câmera depende do contexto seguro (HTTPS ou localhost) e da permissão do navegador.
- Os testes usam leitura e posição simuladas; câmera, NFC e GPS reais só entram na validação humana, em aparelho Android com Chrome.
- Esta spec deve ser validada por Natã Baracho antes de encerrar o ciclo, pela entrevista do AGENTS.md.
