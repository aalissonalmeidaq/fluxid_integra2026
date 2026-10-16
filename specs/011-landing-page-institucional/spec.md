# Especificação da funcionalidade: Landing page institucional do FluxID

**Branch da funcionalidade**: `feat/011-landing-page-institucional`

**Criada em**: 13/10/2026

**Status**: Rascunho

**Entrada**: pedido de uma landing page moderna, atraente e empolgante, que seja a página inicial (index) do projeto, com link para o sistema, para a pasta de documentos do projeto e para os materiais públicos (repositórios, evidências e vídeos), tendo o mascote do FluxID como personagem de destaque.

## Contexto

Hoje, quem abre o endereço do FluxID (`fluxid.tec.br`) cai direto na tela de login (ou, já autenticado, na Visão geral). Não existe um lugar que **conte o que é o projeto**, mostre a ideia em poucos segundos e leve a pessoa aos materiais: documentos, repositórios, evidências e vídeos do pitch e dos protótipos. Banca, parceiros, professores e futuros clientes chegam por links soltos.

Esta spec cria uma **página inicial pública**, de apresentação, no endereço raiz (`/`). Ela explica o FluxID de forma empolgante, apresenta o mascote, mostra o que o sistema realmente faz e oferece dois caminhos claros: **entrar no sistema** e **conhecer os materiais do projeto**.

Três pontos orientam a spec. **A página só promete o que o sistema faz**: nada de número, cliente, depoimento ou funcionalidade inventados; os textos refletem as Specs 001 a 010. **A página é pública e leve**: ela não pode pesar o aplicativo de campo nem a instalação PWA, e não pede nenhum dado. **A identidade visual é a da Spec 005** (tokens, Montserrat, logotipo da Spec 003), levada a um nível mais expressivo (movimento, ilustração, profundidade) sem criar uma segunda linguagem visual.

Continuam valendo as regras do repositório: acessibilidade WCAG 2.2 AA, responsividade de 360 px a desktop amplo, movimento que respeita `prefers-reduced-motion`, só tokens (nenhum valor arbitrário, cor literal ou transição que atrase o anel de foco) e nenhum segredo no cliente.

## Clarifications

### Session 2026-10-13

- Q: Qual deve ser a direção visual da landing page? → A: **Abertura escura e vibrante** (azul-marinho da marca com brilhos verdes), e o restante da página alterna seções claras e escuras, sempre com tokens da Spec 005.
- Q: O aplicativo instalado (PWA) abre a landing page ou vai direto ao sistema? → A: **Vai direto ao sistema** (login ou Visão geral); a landing aparece só para quem acessa pelo navegador.
- Q: O que a landing mostra do sistema em si? → A: **Prévias ilustradas**, desenhadas com o visual do sistema e dados marcados "Exemplo" (sem capturas de tela reais e sem dado de cliente).
- Q: Em que endereço fica a Visão geral, já que a landing ocupa `/`? → A: **`/visao-geral`** (decidido em 13/10/2026).
- Q (revisão de 14/10/2026): o que a landing mostra do sistema em si? → A: **capturas reais das telas**, geradas do próprio aplicativo com o backend simulado (dados fictícios, sempre marcados "Exemplo"): a viagem em andamento no computador e as paradas e a carga no celular de campo. Isso substitui a decisão anterior de usar só prévias ilustradas; só a fila de envio sem sinal continua ilustrada (decidido pela pessoa responsável, a partir da revisão visual).

### Session 2026-10-14 (crítica de design)

- Q: Onde ficam os vídeos do pitch e do protótipo do sistema, a prova do produto para quem ainda não tem conta? → A: **Em destaque logo depois da abertura**, numa faixa "Veja o FluxID em ação" (os dois vídeos como palco grande, sem player de terceiros); a segunda ação da abertura leva a ela. Os oito destinos continuam todos na seção de materiais (decidido em 14/10/2026, a partir da crítica de design da landing).

### Session 2026-10-14 (adaptação ao pitch)

- Q: Como a landing acompanha o pitch "O cilindro que desapareceu" sem perder a essência? → A: **A página passa a seguir a sequência do pitch** (a história do C-262, o tamanho do prejuízo, a causa, as quatro frentes, a jornada da saída ao retorno, a trava física, os vídeos, o piloto e a pergunta final), mantendo a abertura escura, as telas reais, o funcionamento sem sinal, a segurança, os oito materiais e o botão por sessão (pedido da pessoa responsável, 14/10/2026). A antiga faixa "Por que o FluxID" e a seção "O problema" dão lugar às seções do pitch.
- Q: A abertura ocupa quanto da tela? → A: **A tela inteira ao entrar** (altura visível do aparelho), com o cabeçalho sobre ela e um convite para rolar até a história.
- Q: O mascote pode aparecer desfocado ou fundido ao fundo? → A: **Não.** O mascote é recortado sem fundo e aparece nítido; o brilho fica numa camada separada atrás dele. Novas poses saem da mesma arte (corpo inteiro, espiando e rosto), sem criar personagem novo.
- Q: Os vídeos abrem o YouTube? → A: **Não: tocam na própria página.** Antes do clique, a capa é desenhada pelo projeto e nada de terceiros carrega; ao tocar em "Assistir", entra o player incorporado de privacidade reforçada (`youtube-nocookie.com`). O link "Abrir no YouTube" continua disponível. Isso ajusta a RNF-007 só no que a pessoa ativa.
- Q: Os valores em reais do pitch podem aparecer? → A: **Sim, com fonte declarada**: os custos por capacidade e as 130 perdas de 2025, levantados com a Oxigênio Cariri, ficam numa única fonte (`PREJUIZO`), e os totais (R$ 3.766, R$ 40.805 por mês, R$ 489.666 por ano) são calculados, nunca digitados.
- Q: Como tratar o que ainda é protótipo (a trava com solenoide e o alerta de saída da geocerca)? → A: **Sempre marcado "Em validação no piloto"**, nunca como pronto, como pede o checklist do pitch.

### Session 2026-10-14 (crítica de design da página adaptada ao pitch)

- Q: Qual é a ação principal da landing, se o público (banca e gestores) ainda não tem conta? → A: **Assistir ao pitch**; a segunda ação leva à trava. "Entrar no sistema" fica sempre visível no cabeçalho, discreto, e na chamada final como segunda opção (decidido pela pessoa responsável ao aprovar o plano da crítica, 14/10/2026).
- Q: Como tratar o meio da página, que repetia a jornada? → A: **Um bloco só, "O que já funciona"**, com as telas reais e quatro itens (as antigas seções de funcionalidades, sem sinal e segurança); a jornada vira uma linha de marcos; a trava sobe para logo depois da solução, como segundo pico.
- Q: O simulador do piloto pode afirmar quanto o FluxID "protege"? → A: **Não: é uma simulação marcada "Estimativa"**, com a base do cálculo à vista e a ressalva de que é hipótese para o piloto medir.
- Q: E o mascote de joinha nas cenas de perda? → A: **Uma pose nova ("procurando") será fornecida pela equipe**; o encaixe está pronto em `mascote.tsx` e, até a arte chegar, as cenas usam os recortes atuais.

### Session 2026-10-14 (apresentação do FluxID e segunda crítica)

- Q: As poses do mascote da apresentação (IntegraSENAI) entram na landing? → A: **Sim.** As poses (preocupado, procurando de binóculos, indicando, com o tablet de contrato e com o cilindro e o dispositivo) foram extraídas do PDF, recortadas ao contorno e passam a ocupar os momentos que pedem cada expressão. Isso resolve a pose "procurando", que estava pendente (T083). Pedido da pessoa responsável em 14/10/2026.
- Q: A logo do FluxID no topo? → A: **Em destaque**: bem maior (10,5 rem no celular e 16 rem a partir do tablet), com a abertura reservando o espaço dela.
- Q: A jornada do C-262? → A: **O fio da página.** A jornada vira três trechos (preparar, entregar, proteger e voltar), cada um dizendo onde está o C-262; no computador o cartão de rastreio acompanha o trecho lido, e o fecho mostra a resposta com evidências (dados de exemplo).
- Q: Os materiais? → A: **Três blocos** (comece por aqui, código e evidências, vídeos); os oito destinos continuam todos na seção, e os vídeos viram linhas de texto até o player.
- Q: As capturas reais mostram jargão interno? → A: **Não mais**: foram regeneradas a partir de "Paradas e carga", com organização fictícia ("Distribuidora Exemplo"), sem o topo técnico da tela.
- **Pendente de decisão (não incluído nesta versão)**: equipe com nomes e fotos, linha do tempo 2026–2032 e fotos de cena da apresentação; e os valores da apresentação (R$ 3.767 por cilindro e R$ 497.244 por ano), que divergem dos do pitch usados na página (R$ 3.766 e R$ 489.666).

### Session 2026-10-16 (planos e investimento)

- Q: A landing mostra como o FluxID é contratado e quanto custa? → A: **Sim, numa seção própria, "Planos e investimento"** (pedido da pessoa responsável em 16/10/2026, que tira "área de preços" do fora de escopo). A contratação é uma **assinatura mensal recorrente** mais uma **taxa única de implantação**, as duas calculadas pelo tamanho da operação. Faixas de referência: até 250 cilindros, implantação de cerca de R$ 3.500 e assinatura de R$ 2.000 por mês; até 600 cilindros, cerca de R$ 7.000 e R$ 4.000 por mês; acima disso, plano personalizado. Os valores ficam numa fonte única (`PLANOS`), a página os formata e diz que são de referência, e cada faixa tem o contato com o plano no assunto. A seção Piloto fica com o valor, a simulação e as fases.

## Objetivos

- Quem chega ao endereço do projeto entende, nos primeiros segundos, **o que é o FluxID, para quem serve e por que importa**.
- A pessoa chega ao sistema em **um toque** ("Entrar no sistema"), e quem já está autenticado entra direto, sem passar pelo login de novo.
- Os **documentos** e os **materiais** do projeto (repositórios, evidências, canal e vídeos) ficam a um toque, organizados e identificados.
- A página é **bonita, moderna e memorável**, com o mascote como personagem, sem sacrificar acessibilidade nem desempenho.
- O aplicativo e o PWA continuam funcionando como antes.

## Atores

- **Visitante**: qualquer pessoa sem sessão (banca, parceiro, cliente em potencial, professor). Só lê e navega pelos links.
- **Usuário do sistema**: pessoa com conta; usa a página como porta de entrada.
- **Usuário já autenticado**: chega a `/` e deve poder seguir direto ao sistema.
- **Equipe do projeto**: mantém os textos e os links; precisa trocá-los sem mexer na lógica da página.
- **Pessoa responsável pela validação humana do ciclo**: definida na entrevista de encerramento (a spec anterior citava Natã Baracho como validador oficial; confirmar para este ciclo, sem presumir).

## Cenários de usuário e testes

### História 1 — Entender o projeto e entrar no sistema (Prioridade: P1)

Um visitante abre `fluxid.tec.br`. Vê a identidade do FluxID, uma chamada forte que resume a proposta, o mascote e um botão principal "Entrar no sistema". Rolando, entende o problema que o projeto resolve e como o sistema funciona. Toca no botão e chega à tela de login.

**Por que esta prioridade**: sem a porta de entrada e o entendimento rápido, a página não cumpre o papel de index do projeto.

**Teste independente**: abrir `/` sem sessão em 360 px e em 1440 px; ler a chamada principal sem rolar; tocar em "Entrar no sistema" e chegar a `/login`.

**Cenários de aceitação**:

1. **Dado** um visitante sem sessão, **quando** abre `/`, **então** vê a landing page (e não a tela de login), com logotipo, chamada principal, mascote e o botão "Entrar no sistema" visíveis sem rolar a página em 360 px e em desktop.
2. **Dado** a landing page aberta, **quando** o visitante ativa "Entrar no sistema" (toque, clique, Enter ou Espaço), **então** vai para `/login`.
3. **Dado** um usuário com sessão válida, **quando** abre `/`, **então** vê a mesma landing page, com o botão principal trocado por "Abrir o sistema", que o leva direto à Visão geral, sem passar pelo login.
4. **Dado** um visitante que digita o endereço antigo de uma tela interna sem sessão, **quando** a rota exige login, **então** continua indo ao login como hoje (a landing não altera a proteção das telas internas).

---

### História 2 — Conhecer o que o sistema faz (Prioridade: P1)

Rolando a página, o visitante encontra seções curtas e visuais sobre o que o FluxID entrega de verdade: rastreabilidade de cilindros, estoque e cadastros, viagens com paradas e carga, aplicativo de campo com leitura de códigos e GPS, funcionamento sem conexão com fila de sincronização, fotos e assinatura de entrega, e segurança com isolamento por organização, perfis de acesso e auditoria.

**Por que esta prioridade**: é o conteúdo que torna a página empolgante e convincente, e precisa ser fiel ao produto.

**Teste independente**: percorrer a página e conferir que cada bloco de funcionalidade corresponde a uma capacidade das Specs 001 a 010 e que não há número, cliente ou recurso fora delas.

**Cenários de aceitação**:

1. **Dado** a landing page, **quando** o visitante a percorre, **então** encontra, em ordem lógica, a proposta, o problema, a solução em etapas, as funcionalidades principais, o funcionamento offline, a segurança e a chamada final.
2. **Dado** qualquer texto de funcionalidade, **quando** revisado pela equipe, **então** é rastreável a uma spec entregue; nada descreve recurso não implementado como disponível.
3. **Dado** que há ilustrações ou prévias de telas, **quando** exibem dados, **então** são marcadas "Exemplo" e vêm de uma fonte substituível, como no resto do produto.

---

### História 3 — Acessar documentos e materiais do projeto (Prioridade: P1)

O visitante quer ver a documentação e as evidências. A página tem uma seção "Materiais do projeto" e um destaque para os documentos, com links claros e identificados: pasta de documentos, repositório do sistema, repositório da API, evidências, canal do YouTube, vídeo do pitch, vídeo do protótipo físico e vídeo do protótipo do sistema.

**Por que esta prioridade**: foi pedido explicitamente e é o motivo de muita gente chegar à página.

**Teste independente**: ativar cada link e conferir que abre o destino correto em nova aba, com indicação de que sai do site.

**Cenários de aceitação**:

1. **Dado** a seção de materiais, **quando** o visitante a abre, **então** vê exatamente estes destinos, cada um com nome, descrição curta e ícone: Documentos (pasta do Google Drive), Repositório do sistema, Repositório da API, Evidências (pasta do Google Drive), Canal do YouTube, Vídeo do pitch, Vídeo do protótipo físico e Vídeo do protótipo do sistema.
2. **Dado** um link externo, **quando** ativado, **então** abre em nova aba sem expor a página de origem ao destino e a pessoa sabe, antes de ativar, que é um link externo.
3. **Dado** os vídeos, **quando** a página carrega, **então** nenhum player de terceiros é carregado antes de a pessoa pedir; os vídeos aparecem como cartões de marca, com miniatura desenhada pelo próprio projeto, e abrem no YouTube, para não pesar a página nem rastrear visitantes.
4. **Dado** que os endereços mudam com o tempo, **quando** a equipe precisa trocar um link, **então** altera um único ponto de dados, sem mexer na apresentação.

---

### História 4 — Conhecer o mascote e sentir a marca (Prioridade: P2)

O mascote do FluxID (robô em forma de cilindro, azul, branco e verde, com o logotipo no peito, cadeados vermelhos e o polegar para cima) é o personagem da página: aparece na abertura, acompanha momentos-chave da rolagem e reforça a mensagem de rastreabilidade e segurança.

**Por que esta prioridade**: dá personalidade e memorização; a página funciona sem ele, mas perde o diferencial pedido.

**Teste independente**: abrir a página e conferir o mascote na abertura, com texto alternativo adequado e sem prejudicar a leitura; ativar "reduzir movimento" no sistema e conferir que nada se move sem pedido.

**Cenários de aceitação**:

1. **Dado** a abertura da página, **quando** carrega, **então** o mascote aparece em destaque, integrado ao fundo da marca, sem cobrir texto nem botões.
2. **Dado** o mascote como imagem informativa, **quando** lido por leitor de tela, **então** tem descrição curta e útil; usado só como decoração, é ignorado pelas tecnologias assistivas.
3. **Dado** uma pessoa com "reduzir movimento" ligado, **quando** navega, **então** não há animação contínua, parallax nem rolagem animada; o conteúdo aparece imediatamente e completo.

---

### História 5 — Usar bem em qualquer aparelho, teclado e leitor de tela (Prioridade: P1)

A página funciona em celular de 360 px, tablet e monitor amplo, com teclado e leitor de tela, e é rápida em 4G.

**Por que esta prioridade**: é regra do repositório (WCAG 2.2 AA e responsividade) e a página é a primeira impressão do projeto.

**Teste independente**: navegar só pelo teclado do topo ao rodapé; medir contraste; abrir em 360 px, 768 px e 1920 px; rodar a verificação automatizada de acessibilidade.

**Cenários de aceitação**:

1. **Dado** navegação só por teclado, **quando** a pessoa percorre a página, **então** a ordem de foco é lógica, o foco é sempre visível e há um atalho "Pular para o conteúdo".
2. **Dado** qualquer largura de 360 px a desktop amplo, **quando** a página é aberta, **então** não há rolagem horizontal, texto cortado nem elemento sobreposto, e o conteúdo usa toda a largura disponível, como no restante do produto.
3. **Dado** o contraste, **quando** medido, **então** textos e controles atendem WCAG 2.2 AA em todas as seções, inclusive sobre fundos escuros, imagens e degradês.
4. **Dado** que a landing é pública, **quando** carregada, **então** tem título, descrição e pré-visualização de compartilhamento (nome, resumo e imagem) adequados para quando o link é enviado por mensagem.

---

### História 6 — Não prejudicar o aplicativo (Prioridade: P1)

Quem usa o sistema no campo não paga o custo da landing page: o pacote que o aplicativo carrega ao abrir não cresce, e o PWA instala e funciona como antes.

**Por que esta prioridade**: o produto é offline-first e o campo depende de abrir rápido; a landing não pode piorar isso.

**Teste independente**: comparar o tamanho do pacote de entrada antes e depois; instalar o PWA e abrir sem conexão.

**Cenários de aceitação**:

1. **Dado** o pacote de entrada do aplicativo, **quando** comparado com a linha de base anterior à spec, **então** não cresce além de 2%, porque a landing e suas imagens carregam sob demanda.
2. **Dado** o PWA instalado, **quando** aberto, **então** inicia no sistema (ou no login) como antes, e não na landing; a landing é para quem acessa pelo navegador.
3. **Dado** uma pessoa sem conexão, **quando** abre `/` com o PWA já instalado, **então** vê a landing com todo o texto, o logotipo e os links internos (imagens fora do precache podem faltar sem prejudicar a leitura), e cada link externo informa "precisa de conexão" em vez de falhar em silêncio.

## Casos de borda

- Visitante com JavaScript lento ou conexão ruim: o texto principal e o botão de entrada aparecem antes das imagens pesadas, sem deslocar o layout quando a imagem chega.
- Imagem do mascote que não carrega: a página continua legível e completa, com o logotipo no lugar.
- Link externo indisponível (Drive ou YouTube fora do ar): o link continua visível; a página não quebra e não bloqueia a navegação.
- Pasta do Drive privada para quem não tem acesso: o destino é do Google; a página informa na descrição que o acesso pode exigir permissão.
- Usuário autenticado com sessão expirada: ao tocar em "Abrir o sistema", o fluxo normal o leva ao login.
- Navegador sem suporte a recursos visuais avançados: a página mostra a versão estática equivalente.
- Alguém abre `/` com parâmetros ou fragmentos (`#materiais`): a rolagem vai à seção correta e o foco acompanha.
- Idioma: toda a página em português do Brasil; nomes próprios e termos técnicos mantêm a grafia original.
- Tema do sistema operacional: a abertura é sempre escura, por decisão visual; as demais seções seguem a mesma regra de tema do restante do produto, e o contraste AA vale em qualquer combinação.

## Requisitos

### Requisitos funcionais

- **RF-001**: A rota `/` passa a exibir a landing page pública, para visitantes e para usuários autenticados.
- **RF-002**: A landing não exige sessão, não faz chamada ao servidor do sistema para renderizar e não coleta nenhum dado pessoal.
- **RF-003**: O botão principal é "Entrar no sistema" para visitante e "Abrir o sistema" para quem tem sessão válida; o primeiro leva a `/login`, o segundo à Visão geral.
- **RF-004**: A Visão geral do sistema continua existindo, em `/visao-geral`, com a mesma proteção, permissão e comportamento de hoje; a navegação interna, os testes e os atalhos que apontavam para `/` passam a apontar para o novo endereço.
- **RF-005**: A página tem, nesta ordem: cabeçalho com logotipo e atalhos; abertura escura e vibrante (azul-marinho da marca com brilhos verdes) com chamada principal, subtítulo, mascote e botões; faixa "em ação" com os vídeos do pitch e do protótipo do sistema em destaque; faixa de prova de valor (o que o sistema entrega); o problema; a solução em etapas; as funcionalidades principais; o funcionamento sem conexão; a segurança e a organização por tenant; os materiais do projeto; chamada final; rodapé.
- **RF-006**: A seção de materiais lista os oito destinos definidos na História 3, com nome, descrição curta e ícone, e abre cada um em nova aba com proteção de origem e aviso de link externo.
- **RF-007**: Os textos, os links e a ordem das seções vêm de uma única fonte de dados substituível, separada da apresentação.
- **RF-008**: Os vídeos aparecem como cartões com miniatura que levam ao YouTube; nenhum player de terceiros é carregado automaticamente.
- **RF-009**: O mascote é usado como personagem de destaque na abertura e em, no máximo, dois outros momentos da rolagem, em formato otimizado para a web, com descrição alternativa e sem cobrir conteúdo.
- **RF-010**: A página tem "Pular para o conteúdo", marcos semânticos (cabeçalho, principal, rodapé, seções com títulos hierárquicos), um único título de primeiro nível e navegação por âncoras com foco acompanhando.
- **RF-011**: A página tem título, descrição e imagem de compartilhamento próprios, em português do Brasil.
- **RF-012**: Movimentos (entrada de seções, destaque do mascote, brilho) são opcionais e desligam por completo com "reduzir movimento"; nenhuma informação depende de movimento.
- **RF-013**: A página mostra o sistema por **capturas reais de telas** (a viagem em andamento no computador e as paradas e a carga no celular de campo), geradas do aplicativo com dados fictícios e guardadas como imagens locais descritas em texto, e por uma prévia ilustrada da fila de envio sem sinal; telas, prévias e números ilustrativos são marcados "Exemplo" e saem de uma fonte substituível; nenhum dado de cliente real aparece.
- **RF-014**: A landing não altera as regras de conectividade com o Supabase, a proteção das rotas internas nem o fluxo de login.
- **RF-015**: A proteção das telas internas continua exigindo sessão; a landing é a única tela pública nova e não expõe dado de nenhum tenant.

- **RF-016** (adaptação ao pitch): A abertura ocupa a altura visível da tela ao entrar, com o mascote nítido em destaque, o cartão de rastreio do C-262 (dados de exemplo, marcados "Exemplo") e um convite para rolar até a história.
- **RF-017**: A página segue a sequência do pitch: a história do C-262 (cenas com horário e rota ilustrada), o prejuízo (números calculados de uma fonte declarada, com a ressalva de que só consideram o cilindro), a causa (prancheta, planilha e memória), as quatro frentes, a jornada em sete etapas com as regras do registro, a trava física, os vídeos, o piloto e o modelo por assinatura, e a pergunta final.
- **RF-018**: Cada frente e cada etapa da jornada diz em texto se já está na plataforma (com a spec de origem) ou em validação no piloto; a trava física e o alerta de saída da geocerca nunca aparecem como prontos.
- **RF-019**: Os três vídeos (pitch, protótipo do sistema e protótipo físico) tocam na própria página, no player de privacidade reforçada, só depois que a pessoa toca em "Assistir"; o player recebe o foco; sem conexão, o botão avisa e não abre nada; os cartões de vídeo da seção de materiais levam a esse player.
- **RF-020**: A trava é mostrada em três momentos alternáveis por botões (no transporte, no destino, fora da geocerca), com o texto do momento anunciado; o piloto tem um simulador do patrimônio preservado pelas perdas evitadas.

### Requisitos não funcionais

- **RNF-001**: A landing atende WCAG 2.2 AA (contraste, foco visível e não obscurecido, alvos de toque de ao menos 24 por 24 px, ordem de foco, texto alternativo, estrutura de títulos), inclusive sobre a abertura escura com brilhos, e é validada com teclado e leitor de tela.
- **RNF-002**: Responsiva de 360 px a desktop amplo, sem rolagem horizontal e usando toda a largura, sem container máximo, como decidido na Spec 005.
- **RNF-003**: O pacote de entrada do aplicativo não cresce além de 2% sobre a linha de base anterior; a landing e suas imagens carregam sob demanda.
- **RNF-004**: Em 4G simulado e aparelho médio, o maior conteúdo visível (LCP) aparece em até 2,5 s e o deslocamento acumulado de layout (CLS) fica abaixo de 0,1; o conteúdo útil da primeira dobra não depende da imagem do mascote.
- **RNF-005**: O peso total de imagens da primeira dobra fica em até 250 KB, em formato moderno com alternativa, em tamanhos adequados a cada largura.
- **RNF-006**: Usa só tokens do design system: nenhum valor arbitrário de Tailwind, cor literal ou transição que atrase o anel de foco; o teste `tests/contract/escalas-no-codigo.test.ts` continua passando.
- **RNF-007**: Nenhum script, fonte ou imagem de terceiros é carregado na abertura; links externos só são acessados quando ativados.
- **RNF-008**: O PWA continua instalável e o aplicativo instalado inicia no sistema; os estados de carregamento, erro e offline da landing estão definidos.
- **RNF-009**: Nenhum segredo, token ou credencial entra no repositório ou na página; só links públicos.
- **RNF-010**: Toda a interface em português do Brasil, com linguagem clara e positiva, sem jargão desnecessário.

## Critérios de aceitação transversais

- As capturas visuais (Chromium no Linux) da landing em 360 px, 768 px e 1440 px, em tema claro e escuro, são geradas no Linux e versionadas; nunca `*-win32.png`.
- A verificação automatizada de acessibilidade não aponta violação séria ou crítica na landing em nenhuma das três larguras.
- O E2E cobre: visitante entra no sistema; usuário autenticado abre o sistema; cada link de material abre o destino certo em nova aba; teclado do início ao fim; "reduzir movimento".
- Antes de rodar o E2E, o `dist` é reconstruído (`npm run build`).
- O pacote de entrada e o peso das imagens da primeira dobra são medidos e registrados no relatório de validação.

## Critérios de sucesso

- **SC-001**: Em teste com ao menos 5 pessoas que não conhecem o projeto, ao menos 4 explicam corretamente, em uma frase, o que o FluxID faz depois de 30 segundos na página.
- **SC-002**: 100% das pessoas testadas encontram e ativam "Entrar no sistema" em até 5 segundos, em celular e em computador.
- **SC-003**: 100% dos oito links de materiais abrem o destino correto, em nova aba.
- **SC-004**: Nenhuma violação séria ou crítica de acessibilidade e contraste AA em todas as seções, nas três larguras e nos dois temas.
- **SC-005**: LCP em até 2,5 s e CLS abaixo de 0,1 em 4G simulado; pacote de entrada do aplicativo com crescimento de até 2%.
- **SC-006**: Na validação humana, a pessoa responsável avalia a página como moderna, atraente e fiel à identidade do FluxID, e aprova ou aprova com ajustes.

## Premissas e dependências

- **A landing assume o endereço `/`.** A Visão geral do sistema muda para `/visao-geral` (decidido em 13/10/2026); o plano define a migração dos atalhos, da navegação e dos testes. Quem já favoritou `/` com sessão passa a ver a landing e segue ao sistema por um toque.
- **O PWA instalado inicia no sistema**, não na landing (decidido em 13/10/2026); a landing é para o acesso pelo navegador. O plano define o ajuste do endereço de início da instalação. Instalações feitas antes desta spec, que ainda abrem em `/`, também iniciam no sistema (redirecionamento em modo instalado).
- **Os oito links** são os informados pelo responsável em 13/10/2026 e ficam em uma fonte de dados única. As duas pastas do Google Drive podem exigir permissão de acesso; a equipe é responsável por mantê-las compartilhadas.
- **O mascote** é a imagem enviada pela equipe nesta conversa (guardada em `specs/011-landing-page-institucional/assets/mascote-original.png`). A implementação gera as versões otimizadas e confirma, com a equipe, que a equipe detém o direito de uso da arte antes da publicação.
- **Conteúdo:** os textos são propostos pela spec a partir das Specs 001 a 010 e validados pela equipe; nada é inventado (sem números de clientes, métricas de mercado ou depoimentos).
- **Título, descrição e imagem de compartilhamento** ficam no HTML base do aplicativo e valem para o endereço público; as telas internas exigem login e não são compartilhadas.
- **Sem formulário de contato, newsletter, análise de audiência (analytics) nem cookies** nesta spec; qualquer um deles exige spec própria, por envolver dados pessoais e privacidade.
- **Fora de escopo:** domínio e DNS (já tratados em `docs/publicacao-em-nuvem.md`), blog, versão em outro idioma, área logada e qualquer mudança no aplicativo de campo. (A área de preços saiu do fora de escopo em 16/10/2026: veja a seção "Planos e investimento" nas clarificações.)
- **Dependências:** identidade visual e componentes das Specs 003 e 005; navegação e proteção de rotas das Specs 002 e 004; PWA e pacote de entrada das Specs 001 e 010.
- **Validação humana:** nenhuma etapa de encerramento é feita sem entrevista com a pessoa responsável (regra do repositório).
