# Especificação da funcionalidade: Entrada renovada e Visão geral

**Branch da funcionalidade**: `feat/005-login-e-visao-geral` (criada depois da integração da Spec 004, PR #11)

**Criada em**: 01/10/2026

**Status**: Implementada no ciclo 01; aguardando validação humana, registro de IA e pull request Refinamentos de interface pedidos em 02/10/2026 (RF-034 a RF-038) incorporados ao mesmo ciclo.

**Entrada**: Redesenhar a tela de entrada (celular e desktop em duas colunas, com painel de marca) e criar a tela Visão geral (painel inicial autenticado) com menu lateral, barra superior, cartões de indicadores, gráfico, listas e área de mapa reservada, reproduzindo a estrutura das imagens de referência com a identidade visual oficial da Spec 003 (tokens, componentes, ícones, Montserrat), em estilo minimalista premium. O menu lateral é o menu por permissão da Spec 004. Os indicadores, o gráfico e as listas usam dados de exemplo claramente identificados como exemplo; o mapa é um espaço reservado. Sem login social e sem "Lembrar de mim" enquanto não houver regra aprovada.

## Contexto

A Spec 003 deu ao aplicativo um design system e um shell únicos, e a Spec 004 acrescentou o menu por permissão. A tela de entrada atual é um cartão simples e a página inicial autenticada (`/`) ainda é o texto "Fundação Técnica Ativa". Esta spec dá a essas duas telas a cara do produto, a partir de três imagens de referência: a Visão geral em desktop (menu lateral, barra superior, cartões, mapa, gráficos e listas) e a entrada em celular e em desktop (formulário ao lado de um painel de marca).

O produto ainda não tem cilindros, rastreamento, alertas nem dispositivos: essas funcionalidades pertencem a fases futuras do PRD. A Visão geral, portanto, entrega a **estrutura** do painel, com dados de exemplo identificados como tal. Nenhum número do painel representa a operação real.

## Clarifications

### Session 2026-10-01

- Q: Nos blocos "Alertas recentes" e "Cilindros recentes", o que fazer com o link "Ver todos" sem telas de destino? → A: Ocultar o link (RF-014).
- Q: De onde vêm os conteúdos da Visão geral? → A: Das imagens de referência vêm só a estrutura e o estilo; rótulos, blocos e exemplos são do domínio do FluxID (cilindros de gases), conforme o PRD (RF-010 a RF-015a).

### Session 2026-10-02

- Q: A entrada deve seguir a nova imagem de referência (painel com chamada, cartões de destaque, cartão de formulário com logotipo, selo "Ambiente seguro")? → A: Sim, no que é só visual (RF-002, RF-003, RF-034 a RF-038). Ficam de fora "Entrar com Google", "Lembrar de mim" e "Fale com o suporte", que não têm regra nem backend (RF-004), e a fotografia, que não é ativo aprovado.
- Q: Onde fica o estado de conexão nas telas públicas do celular? → A: Discreto, no fim da página (RF-006).
- Q: O logotipo do shell autenticado deve levar a algum lugar? → A: Sim, à Visão geral, e deve ser maior (RF-034).

## Objetivos

- Entrada com identidade de marca em celular e desktop, mantendo todo o comportamento de autenticação da Spec 002.
- Visão geral como página inicial autenticada, com a estrutura de painel das referências, em estilo minimalista premium.
- Usar só tokens, componentes, ícones e fonte da Spec 003 e o menu por permissão da Spec 004.
- Nunca apresentar dado de exemplo como se fosse dado real.

## Atores

- **Pessoa não autenticada**: usa a tela de entrada para acessar a conta.
- **Pessoa autenticada (qualquer papel)**: chega à Visão geral depois de entrar.
- **Administrador de tenant, operador técnico e perfil global**: veem a mesma Visão geral; o menu lateral muda conforme as permissões (Spec 004).
- **Alisson Almeida**: responsável pela validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Entrar por uma tela com a identidade da marca (Prioridade: P1)

A pessoa abre o aplicativo e vê a tela de entrada com a marca FluxID: no desktop, o formulário ao lado de um painel de marca; no celular, a marca no alto e o formulário abaixo. A autenticação funciona exatamente como na Spec 002.

**Por que esta prioridade**: é a primeira tela que toda pessoa vê e a que mais comunica a identidade do produto.

**Teste independente**: abrir a entrada em 360, 768 e 1920 px, entrar com credenciais válidas, inválidas e de perfil que exige segundo fator, e confirmar que cada resultado se comporta como antes.

**Cenários de aceitação**:

1. **Dado** uma tela de 1024 px ou mais, **quando** a pessoa abre a entrada, **então** vê duas colunas: o painel de marca (logotipo oficial, assinatura "Rastreabilidade que protege. Inteligência que conecta.", título e três destaques) e o formulário com e-mail, senha e botão Entrar.
2. **Dado** uma tela abaixo de 1024 px, **quando** a pessoa abre a entrada, **então** vê uma só coluna, com a faixa de marca no alto e o formulário logo abaixo, sem rolagem horizontal desde 320 px.
3. **Dado** credenciais inválidas, sessão expirada, limite de sessões, bloqueio por tentativas ou perfil que exige segundo fator, **quando** a pessoa tenta entrar, **então** cada situação mostra a mesma mensagem, o mesmo foco e o mesmo fluxo da Spec 002.
4. **Dado** a entrada, **quando** a pessoa usa só o teclado, **então** o primeiro Tab leva ao link "Pular para o conteúdo principal", a ordem segue o formulário e o foco é visível.
5. **Dado** a entrada, **quando** a pessoa a observa, **então** não há botão de login social nem opção "Lembrar de mim".

### História 2 — Chegar à Visão geral depois de entrar (Prioridade: P1)

Depois de entrar, a pessoa vê a Visão geral: menu lateral à esquerda, barra superior, título da página, uma linha de quatro cartões de indicadores e, abaixo, mapa de cilindros e viagens, movimentação, cilindros por situação, alertas e cilindros recentes, e um bloco de desempenho operacional.

**Por que esta prioridade**: é a página inicial do aplicativo e a moldura de todas as fases futuras.

**Teste independente**: entrar com um administrador de tenant, um operador técnico e o Master e conferir a estrutura e o menu de cada um em 360, 768 e 1920 px.

**Cenários de aceitação**:

1. **Dado** uma pessoa autenticada, **quando** abre `/`, **então** vê a Visão geral com os blocos descritos em RF-009 a RF-016, e nenhum texto de "Fundação Técnica Ativa".
2. **Dado** o desktop, **quando** a pessoa vê a página, **então** o menu lateral é a coluna fixa da Spec 004 e a barra superior mostra a organização ativa, o estado de conexão e o menu da pessoa.
3. **Dado** perfis diferentes, **quando** entram, **então** a Visão geral é a mesma e o menu lateral mostra exatamente os itens da Spec 004 para cada um.
4. **Dado** qualquer bloco com número, gráfico ou lista, **quando** a pessoa o vê, **então** ele traz a marca "Exemplo" em texto visível, e a página identifica, também em texto, que os valores são "Dados de exemplo".
5. **Dado** a área do mapa, **quando** a pessoa a vê, **então** ela é um espaço reservado com texto explicando que o rastreamento chega em uma fase futura, sem imagem de mapa nem marcadores.

### História 3 — Usar a Visão geral em celular, tablet e desktop, só com teclado (Prioridade: P1)

A Visão geral se reorganiza de 360 px a desktop amplo e é operável só pelo teclado, com os gráficos acessíveis a quem não os vê.

**Por que esta prioridade**: a Spec 003 exige responsividade e acessibilidade em toda tela.

**Teste independente**: percorrer a página com Tab nas três larguras de referência, sem rolagem horizontal, e conferir as alternativas textuais dos gráficos.

**Cenários de aceitação**:

1. **Dado** 360 px, **quando** a pessoa vê a Visão geral, **então** os cartões e os blocos ficam em uma coluna, o menu fica recolhido atrás do botão da Spec 004 e não há rolagem horizontal.
2. **Dado** 768 px, **quando** a pessoa vê a página, **então** os cartões ficam em duas colunas e o menu lateral fica fixo.
3. **Dado** 1920 px, **quando** a pessoa vê a página, **então** os quatro cartões ficam na mesma linha e os blocos seguem a disposição das referências, sem esticar além da largura máxima de leitura do shell.
4. **Dado** um gráfico, **quando** a pessoa usa leitor de tela ou só o teclado, **então** encontra os mesmos dados em texto ou tabela, e a informação nunca depende só da cor.
5. **Dado** os controles da página, **quando** a pessoa usa o teclado, **então** cada um tem alvo de 44 por 44 px e anel de foco visível de 3:1 ou mais.

### História 4 — Ver estados de carregamento, vazio, erro e offline (Prioridade: P2)

Cada bloco da Visão geral trata os estados do vocabulário da Spec 003, sem quebrar a página.

**Por que esta prioridade**: o cenário de campo tem rede ruim; a tela precisa continuar compreensível.

**Teste independente**: forçar atraso, falha e perda de rede e observar cada bloco e o anúncio.

**Cenários de aceitação**:

1. **Dado** o carregamento, **quando** a página abre, **então** cada bloco mostra um indicador anunciado uma vez e a estrutura não muda de lugar depois.
2. **Dado** uma falha ao carregar um bloco, **quando** a pessoa a vê, **então** o bloco mostra mensagem em texto e a ação "Tentar de novo", e os demais blocos seguem funcionando.
3. **Dado** o aparelho offline com o aplicativo instalado, **quando** a pessoa abre a Visão geral, **então** a estrutura abre, com o aviso de offline da Spec 003, sem pedir rede.
4. **Dado** um bloco sem dados, **quando** a pessoa o vê, **então** mostra estado vazio com texto explicativo, nunca uma área em branco.

### História 5 — Menu da pessoa e saída pela barra superior (Prioridade: P2)

A barra superior reúne o que é da pessoa: organização ativa com "Trocar organização", acesso a Meu perfil e Sair.

**Por que esta prioridade**: libera o cabeçalho antigo e fecha a moldura do painel.

**Teste independente**: abrir o menu da pessoa por mouse e teclado e acionar cada item.

**Cenários de aceitação**:

1. **Dado** uma pessoa autenticada, **quando** aciona o menu da pessoa, **então** vê o nome, a organização ativa, "Meu perfil" e "Sair".
2. **Dado** o menu da pessoa aberto, **quando** usa Escape ou clica fora, **então** ele fecha e o foco volta ao botão.
3. **Dado** a organização ativa, **quando** a pessoa aciona "Trocar organização", **então** o fluxo da Spec 002 continua igual.

## Requisitos funcionais

### Entrada

- **RF-001**: A tela de entrada deve ter, a partir de 1024 px, duas colunas: painel de marca e formulário; abaixo de 1024 px, uma coluna com a faixa de marca no alto.
- **RF-002**: O painel de marca deve usar o logotipo e os ativos oficiais (a assinatura oficial vem no próprio logotipo), a chamada "Controle seus ativos. Proteja sua operação." com uma frase de apoio, três destaques de texto (rastreamento em tempo real, alertas inteligentes, decisões orientadas por dados) e o selo "Ambiente seguro", sem fotografia nem imagem de terceiros. O cartão do formulário traz o logotipo decorativo e o título "Bem-vindo de volta" com o subtítulo "Acesse sua conta para continuar".
- **RF-003**: O formulário deve manter e-mail, senha, o link de recuperação de senha ("Esqueci minha senha", texto atual) e Entrar, com todo o comportamento da Spec 002: validação, mensagens, foco, limite de sessões, expiração, bloqueio e segundo fator. "Esqueci minha senha" fica alinhado à direita, logo abaixo do campo de senha e antes de Entrar, na mesma ordem do foco; o botão Entrar leva uma seta decorativa; os campos de e-mail e de senha trazem ícone decorativo e texto-guia ("Digite seu e-mail", "Digite sua senha") além do rótulo visível, e o campo de e-mail pede teclado de e-mail, sem capitalização nem corretor automáticos.
- **RF-004**: A entrada não deve oferecer login social ("Entrar com Google"), "Lembrar de mim", cadastro público nem canal de suporte ("Fale com o suporte"), que não têm regra aprovada nem backend. A recriação visual de 02/10/2026 manteve essa exclusão por decisão da pessoa responsável.
- **RF-005**: O campo de senha deve oferecer mostrar e ocultar a senha, com nome acessível e estado informado, e a senha nunca deve ser exibida por padrão.
- **RF-006**: A entrada deve exibir o estado de conexão existente (conectado, offline, reconectar) sem reescrevê-lo, e continuar funcionando offline como hoje. Nas telas públicas abaixo de 768 px, o estado de conexão desce para o fim da página, em texto discreto e centralizado, acima do rodapé; o aviso de que o dispositivo ficou sem rede continua no alto e, se a conexão falhar, o botão de reconectar aparece no mesmo lugar do fim da página.
- **RF-007**: A tela de entrada e todas as telas sem sessão plena (recuperação de senha e verificação em duas etapas) devem usar a mesma identidade visual de marca.

### Visão geral

- **RF-008**: A rota `/` autenticada deve exibir a Visão geral no lugar da página "Fundação Técnica Ativa"; sem sessão, `/` continua exibindo a entrada.
- **RF-009**: A página deve ter o título "Visão geral" e um subtítulo curto, e identificar de forma visível que os valores exibidos são dados de exemplo.
- **RF-010**: A página deve ter uma linha de quatro cartões de indicadores do domínio do FluxID (cilindros de gases medicinais e industriais): Cilindros cadastrados, Em viagem, Alertas críticos e Lacres conectados, cada um com ícone do catálogo, valor, rótulo e uma nota de contexto.
- **RF-011**: A página deve ter o bloco "Cilindros e viagens no mapa" como espaço reservado para o mapa, com texto explicando que o rastreamento chega em fase futura, e sem imagem de mapa.
- **RF-012**: A página deve ter o bloco "Movimentação de cilindros" com um gráfico de linha de dados de exemplo (entradas e saídas por dia) e uma alternativa textual em tabela.
- **RF-013**: A página deve ter o bloco "Cilindros por situação" com um gráfico de rosca de dados de exemplo (cheios, com clientes, vazios, em manutenção), legenda com valor e percentual em texto, e alternativa textual.
- **RF-014**: A página deve ter os blocos "Alertas recentes" (por exemplo, lacre violado, saída da geocerca, teste hidrostático a vencer) e "Cilindros recentes" (identificador, tipo de gás e situação), com listas de exemplo, e sem a ligação "Ver todos", que fica oculta (nem desabilitada) enquanto não houver telas de destino; a spec dos cilindros a acrescenta.
- **RF-015**: A página deve ter o bloco "Desempenho operacional" com três medidas de exemplo (cilindros com teste hidrostático em dia, tempo médio de retorno de cilindros, alertas tratados), sem texto que indique que uma entrega, um comando ou uma trava aconteceu (RN-004).
- **RF-015a**: Os textos, rótulos e exemplos dos blocos pertencem ao domínio do FluxID e ao vocabulário do PRD; das imagens de referência vêm apenas a estrutura (disposição dos blocos) e o estilo visual, nunca os conteúdos delas.
- **RF-016**: Cada bloco deve ter título, região nomeada para tecnologia assistiva e a marca "Exemplo" visível; nenhum valor de exemplo pode aparecer sem essa marca.
- **RF-017**: Os dados de exemplo devem vir de uma única fonte substituível, separada dos componentes, para que a fase de cilindros os troque por dados reais sem mudar a estrutura.
- **RF-018**: Os gráficos devem ser desenhados com os tokens de cor da Spec 003, com contraste de 3:1 ou mais para os elementos gráficos, e sem biblioteca nova de gráficos.

### Menu lateral e barra superior

- **RF-019**: O menu lateral é o menu por permissão da Spec 004, sem item novo, sem item sem tela e sem perder nenhuma regra dela (itens restritos só após a confirmação do servidor, estados, atualização e cache offline).
- **RF-020**: O item "Início" do menu passa a se chamar "Visão geral", mantendo o caminho `/`; o nome acessível, a marca de página atual e os testes da Spec 004 são atualizados para o novo nome.
- **RF-021**: A barra superior deve mostrar o logotipo (no celular), o botão do menu (abaixo de 768 px), a organização ativa com "Trocar organização" e o menu da pessoa; o estado de conexão (conectado, offline, reconectar) continua na barra de conexão da Spec 003, logo abaixo da barra superior (RF-006). O logotipo é um link para a Visão geral (RF-034).
- **RF-022**: O menu da pessoa deve mostrar o nome de exibição, a organização ativa, "Meu perfil" e "Sair", abrir por botão com `aria-expanded`, fechar com Escape ou clique fora devolvendo o foco ao botão, e ser operável só pelo teclado.
- **RF-023**: Busca, ajuda e notificações não fazem parte desta spec e não devem aparecer na barra superior como controles sem função.

### Identidade, acessibilidade e experiência

- **RF-024**: As duas telas devem usar apenas tokens, componentes, ícones, fonte Montserrat e logotipo da Spec 003, sem cor, tamanho ou espaçamento fora dos tokens, e sem recurso de terceiros.
- **RF-025**: O estilo deve ser minimalista premium: muito espaço em branco, hierarquia tipográfica clara, no máximo duas ênfases de cor por bloco, sem sombras pesadas nem decoração que não informe. A conferência é humana (MS-007), pois "minimalista premium" não tem critério automático além do uso de tokens (CA-010).
- **RF-026**: As telas devem funcionar de 360 px a desktop amplo, em retrato e paisagem, sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- **RF-027**: As telas devem atender WCAG 2.2 AA: contraste, foco visível e não obscurecido, alvos de 44 px, ordem de foco coerente, um só `h1` e um só `main`.
- **RF-028**: Os estados de carregamento, vazio, erro e offline usam os componentes da Spec 003, anunciam uma vez e não movem o foco.
- **RF-029**: Com movimento reduzido, nenhum elemento anima; nada pisca mais de três vezes por segundo.
- **RF-030**: A instalação e o funcionamento PWA, inclusive offline, devem ser preservados; nenhum dado da Visão geral é guardado no cache do service worker.

### Refinamentos de interface (02/10/2026)

- **RF-034**: O logotipo do shell autenticado (topo da coluna lateral a partir de 768 px e barra superior abaixo disso) deve ser um link para a Visão geral (`/`), com o nome acessível "FluxID" e a dica "Ir para a Visão geral", alvo de pelo menos 44 px de altura, e maior que antes: 192 px de largura na coluna lateral e 152 px na barra superior, encolhendo sem distorcer quando a coluna é estreita. Continua sendo o único `h1`. O cabeçalho simples da verificação de sessão não ganha link.
- **RF-035**: O título do formulário de entrada é "Bem-vindo de volta", com o subtítulo "Acesse sua conta para continuar" (h2). O formulário fica num cartão com o logotipo decorativo (sem nome acessível, para não haver segundo logotipo nomeado), visível a partir de 1024 px. O selo "Ambiente seguro" aparece no canto do formulário a partir de 1024 px e no painel de marca abaixo disso.
- **RF-036**: No painel de marca, a chamada "Controle seus ativos. Proteja sua operação." (segunda frase com ênfase em ciano), a frase de apoio e três cartões de destaque (rastreamento em tempo real, alertas inteligentes, decisões orientadas por dados) usam fundo em degradê de tokens e uma rede de rotas decorativa em SVG, sem fotografia. Abaixo de 768 px o painel mostra só o logotipo, o selo e a chamada; a frase de apoio e os cartões entram a partir de 768 px. A moldura mantém as margens da grade da Spec 003.
- **RF-037**: A coluna lateral do shell autenticado ocupa um quarto da largura, com no máximo 256 px. Abaixo de 1280 px as grades de blocos da Visão geral não podem apertar o conteúdo a ponto de cortar tabelas ou quebrar rótulos curtos; sem rolagem horizontal nem com zoom de 200%.
- **RF-038**: Botões e campos têm transição de 150 ms apenas em cor de fundo e de borda (nunca no anel de foco, que deve aparecer de imediato com o contraste de 3:1), cursor de ponteiro e estado pressionado nos botões; títulos `h1` a `h3` usam quebra equilibrada; o texto-guia dos campos tem contraste de 4,5:1. Com movimento reduzido nada anima (RF-029).

### Segurança

- **RF-031**: Nenhuma mudança desta spec cria, remove ou altera permissão, papel ou regra de acesso (RN-002); a Visão geral é acessível a toda pessoa autenticada e o servidor continua decidindo o acesso às demais telas.
- **RF-032**: Nenhum dado de tenant, de pessoa ou de operação real é exibido na Visão geral; os dados de exemplo são os mesmos para todo mundo e não saem do cliente.
- **RF-033**: O cliente não deve guardar nem registrar em log credenciais, e a senha digitada nunca deve ser enviada a lugar algum além da autenticação existente.

## Requisitos não funcionais

- **RNF-001**: A Visão geral e a entrada não devem piorar em mais de 20% o carregamento do shell medido na Spec 004 (mediana de 89 ms autenticado e 127 ms na entrada, limite de 107 ms e 152 ms), com o mesmo comando e na mesma máquina.
- **RNF-002**: Nenhuma dependência nova no `package.json`; os gráficos são desenhados com os recursos já existentes.
- **RNF-003**: O tamanho do pacote de produção não deve crescer mais de 5% por causa desta spec.
- **RNF-004**: Os dados de exemplo devem estar em português brasileiro, com números formatados no padrão pt-BR.

## Regras de negócio

- **RN-001**: Dado de exemplo nunca é dado real; toda exibição de exemplo é rotulada, e a spec dos cilindros substituirá a fonte sem mudar a estrutura.
- **RN-002**: As regras de acesso, os papéis e as permissões das Specs 002 e 004 não mudam.
- **RN-003**: A autenticação, o segundo fator, o limite de sessões e a recuperação de senha continuam como na Spec 002.
- **RN-004**: O painel não presume estado físico: nada nele indica que um comando, trava ou entrega aconteceu (constituição, item IV).

## Critérios de aceitação transversais

- **CA-001**: Os testes das Specs 001 a 004 continuam passando; só podem mudar seletores e textos de apoio: o rótulo "Início" para "Visão geral", o título da página inicial, a posição de Meu perfil e Sair, o novo shell (o cabeçalho dá lugar à barra superior e à lateral, e o logotipo e o "Instalar App" mudam de lugar) e a moldura das telas públicas. O comportamento de cada tela permanece.
- **CA-002**: A entrada, nas três larguras, mantém todos os cenários de autenticação da Spec 002 e não tem login social nem "Lembrar de mim", comprovado por teste. Sem "Entrar com Google", "Lembrar de mim" nem "Fale com o suporte".
- **CA-003**: A Visão geral tem os blocos de RF-010 a RF-015, cada um com a marca "Exemplo", comprovado por teste.
- **CA-004**: Nenhuma violação crítica ou grave de acessibilidade (axe) na entrada e na Visão geral, em 360, 768 e 1920 px, e os gráficos têm alternativa textual comprovada.
- **CA-005**: Nenhuma largura de 320 a 1920 px, nem zoom de 200%, apresenta rolagem horizontal.
- **CA-006**: Carregamento, vazio, erro e offline de cada bloco são exercitados em teste, sem mover o foco.
- **CA-007**: A entrada e a Visão geral operam só pelo teclado, com foco visível de 3:1 ou mais, incluindo o menu da pessoa.
- **CA-008**: As capturas de referência das duas telas, em três larguras e nos estados principais, entram na regressão visual da Spec 003, geradas no Linux.
- **CA-009**: Um teste prova que nenhum valor de exemplo aparece sem a marca "Exemplo" e que nenhum dado real é lido pela Visão geral.
- **CA-010**: Nenhuma cor, tamanho ou espaçamento fora dos tokens, comprovado pelos testes de escalas da Spec 003.

## Cenários de exceção e casos de borda

- Pessoa com a sessão limitada ao fluxo de verificação em duas etapas: continua vendo a tela de verificação, sem menu, como na Spec 004, agora com a mesma identidade de marca das demais telas públicas (RF-007) e um só `h1` (o logotipo).
- Pessoa autenticada sem tenant ativo (por exemplo, perfil global): a Visão geral abre, e a barra superior mostra apenas o que existe (sem organização ativa).
- Nome de exibição muito longo: quebra ou trunca com reticências dentro do menu da pessoa, sem estourar a largura e sem perder o nome acessível.
- Texto longo nos cartões em 360 px: quebra dentro do cartão.
- Sessão expirada na Visão geral: a pessoa volta à entrada com o aviso da Spec 002.
- Rede lenta na entrada: o botão mostra carregando e continua focável, como hoje.
- Preferência de cores forçadas: bordas e ícones permanecem visíveis, e os gráficos mantêm a alternativa textual.
- Janela estreita em paisagem (por exemplo, 740 por 360): menu recolhido e sem rolagem horizontal.

## Requisitos de acessibilidade e experiência

- **RA-001**: As telas atendem WCAG 2.2 AA, incluindo contraste, reflow, foco visível e não obscurecido e tamanho de alvo.
- **RA-002**: Cada bloco da Visão geral é uma região com nome acessível; a ordem de leitura segue a ordem visual.
- **RA-003**: Gráficos têm título, descrição e alternativa em tabela; cor nunca é o único meio de informar (rótulos, formas ou texto).
- **RA-004**: Mudanças de estado (carregando, erro) são anunciadas uma vez, sem mover o foco.
- **RA-005**: O botão de mostrar senha e o menu da pessoa informam o estado por atributo acessível.
- **RA-006**: O foco se move de forma previsível: ao abrir e ao fechar o menu da pessoa, e ao navegar (título da tela).
- **RA-007**: O painel de marca é decorativo para tecnologia assistiva, exceto o texto e o logotipo, que têm nome acessível.
- **RA-008**: Leitor de tela está fora do escopo do projeto atual; a estrutura semântica continua coberta por testes automáticos.

## Entidades principais

- **Bloco da Visão geral**: região com título, marca "Exemplo", conteúdo e estados (carregando, vazio, erro, pronto).
- **Dado de exemplo**: valor ilustrativo, em fonte única substituível, nunca originado de dado real.
- **Painel de marca**: área de identidade da entrada, com logotipo, assinatura e destaques.

## Dependências

- Spec 002 (autenticação, tenant ativo, recuperação de senha), Spec 003 (design system, shell, estados e regressão visual) e Spec 004 (menu por permissão).
- Constituição, itens I (especificação), II (TDD), III (segurança), IV (estados explícitos), V (experiência e acessibilidade), VI (rastreabilidade), VII (qualidade) e VIII (documentação viva).
- Imagens de referência fornecidas pela equipe (apenas como guia de estrutura).

## Premissas e decisões assumidas

- As fotografias das imagens de referência (cilindros, caminhão, mapa) não são ativos aprovados do repositório; o painel de marca usa só cores, logotipo e texto oficiais. Uma fotografia só entra quando a equipe fornecer um ativo aprovado.
- A assinatura "Rastreabilidade que protege. Inteligência que conecta." é oficial (Documento de Visão e Spec 003).
- "Fale com o suporte", "Entrar com Google", "Lembrar de mim", busca, ajuda e notificações das referências ficam de fora: não há regra, canal ou funcionalidade aprovada para esses itens. Entram quando uma spec os definir. O selo "Ambiente seguro" entrou em 02/10/2026 como texto de marca (RF-035), sem função.
- Os itens do menu das referências que não têm tela (Ativos, Rastreamento, Alertas, Relatórios, Usuários, Configurações) não aparecem; o menu continua sendo só o da Spec 004.
- Os números de exemplo são ilustrativos, coerentes com o domínio de cilindros de gases medicinais e industriais, e marcados como exemplo; não seguem os números das referências.
- "Início" vira "Visão geral" porque é o nome do título da página nas referências; o caminho `/` não muda.
- Esta spec depende do menu da Spec 004, já integrado à `main` (PR #11); a branch da Spec 005 saiu da `main` depois disso, sem misturar os ciclos.
- Não há tema escuro (Spec 003).
- Teste com leitor de tela e em aparelho real seguem como pendência herdada.

## Fora do escopo

- Dados reais de cilindros, lacres, alertas, rotas, rastreamento e mapa.
- Busca global, ajuda, notificações e atalhos de teclado globais.
- Login social, "Lembrar de mim", cadastro público e canal de suporte.
- Telas de Ativos, Rastreamento, Alertas, Relatórios, Usuários e Configurações.
- Fotografias, ilustrações de terceiros e animações decorativas.
- Mudança de regra de acesso, papel ou permissão.

## Métricas de sucesso

- **MS-001**: 100% dos cenários de autenticação da Spec 002 passam na entrada renovada, nas três larguras.
- **MS-002**: 100% dos valores de exemplo exibidos têm a marca "Exemplo", e 0 valores reais aparecem na Visão geral.
- **MS-003**: 0 violações críticas ou graves de acessibilidade nas duas telas, nas três larguras.
- **MS-004**: 100% dos controles das duas telas operáveis só pelo teclado, com alvo de 44 px e foco de 3:1 ou mais.
- **MS-005**: 0 rolagem horizontal de 320 a 1920 px e com zoom de 200%.
- **MS-006**: O carregamento do shell não piora mais de 20% em relação à medição da Spec 004.
- **MS-007**: A pessoa responsável aprova a entrada e a Visão geral em celular e desktop, com registro da validação humana (amostra, ambiente, duração e resultado).
