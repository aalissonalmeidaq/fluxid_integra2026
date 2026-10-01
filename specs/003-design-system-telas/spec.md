# Especificação da funcionalidade: Telas e design system do FluxID

**Branch da funcionalidade**: `feat/003-design-system-telas`

**Criada em**: 30/09/2026

**Status**: Rascunho; clarificações resolvidas, pronta para `/speckit-clarify` ou `/speckit-plan`

**Entrada**: Criar o design system versionado do FluxID, com tokens, componentes base, ativos de marca (logotipo e ícones) e shell de navegação, e refazer as telas de identidade da Spec 002 (entrada, recuperação de senha, MFA, seleção de tenant, perfil, membros, papéis, auditoria e administração de organizações) com esse padrão, sem alterar nenhuma regra de autenticação, sessão ou RBAC. As referências visuais aprovadas são as seis pranchas de identidade FluxID guardadas em `referencias/` (visão geral, variações da marca, iconografia, layout, cores e tipografia).

## Contexto

A Spec 002 entregou os fluxos de identidade com uma interface funcional e provisória. Durante o ciclo, uma tentativa de redesenho feita fora de uma spec derrubou a suíte E2E: trouxe um botão de login social sem ação (fora do escopo da Spec 002), carregou fontes e imagens de terceiros, exibiu o login fora do shell (sem cabeçalho, landmark principal, link de pular nem indicador de conexão) e usou cores com contraste insuficiente. O episódio mostra que a interface precisa de um padrão único, versionado e verificável, definido antes de qualquer tela nova.

O PRD (Fase 0 e seção 13) já prevê identidade visual FluxID, design system versionado, alvos de toque de 44 px, navegação acessível e feedback para offline e sincronização. A constituição (item V) exige o design system FluxID, WCAG 2.2 AA e responsividade de 360 px a desktop amplo. Esta spec cumpre esses pontos para as telas que já existem e deixa o padrão pronto para as telas de domínio das próximas specs.

### Identidade de referência

São seis pranchas normativas, guardadas em `referencias/`. Elas definem o lema "Rastreabilidade que protege. Inteligência que conecta.", os pilares Seguro, Inteligente e Conectado e o seguinte:

| Prancha | Arquivo | O que define |
|---------|---------|--------------|
| Visão geral | `prancha-identidade-fluxid.png` | Resumo da identidade, aplicações de marca e padrões gráficos |
| Variações da marca | `02-variacoes-da-marca.png` | Assinatura principal (horizontal com slogan), secundária (horizontal sem slogan, uso digital), vertical, símbolo (256, 64, 32 e 16 px), wordmark, versões cromáticas (principal, monocromática azul, monocromática preta, escala de cinza e negativa branca), fundos aprovados (branco, azul, navy e cinza-gelo), área de proteção, redução mínima (digital 120 px) e usos incorretos |
| Iconografia | `03-sistema-de-iconografia.png` | Grid de 24 por 24 px, traço de 2 px, terminais arredondados, área segura de 2 px, 30 ícones em cinco grupos, tamanhos (16, 24, 32 e 48 px), estados (padrão, ativo, desabilitado e erro), variantes (contorno, duotone, monocromática e negativa) e uso correto e incorreto |
| Layout | `04-sistema-de-layout.png` | Grid de 12 colunas no desktop (container 1200 px, margem 32 px), 8 no tablet (margem 24 px) e 4 no mobile (margem 16 px), calha de 16 px, base de espaçamento de 8 px (4, 8, 16, 24, 32, 48 e 64), containers largo (1200 px), padrão (960 px) e compacto (720 px), botões, campo de texto, seletor, status e alerta, cards (raio 12 px, padding 24 px, borda 1 px, sombra suave) e responsividade (empilhar, redimensionar, priorizar) |
| Cores | `05-sistema-de-cores.png` | Paleta, gradientes oficiais, proporção de uso (60% neutros, 25% azuis, 10% verdes e 5% ciano), combinações aprovadas e usos a evitar |
| Tipografia | `06-sistema-tipografico.png` | Montserrat nos pesos 300, 400, 500, 600, 700 e 800, escala (display 64 px, H1 48 px, H2 36 px, H3 24 px, corpo 16 px e legenda 12 px), entrelinha de 100%, 125% e 150%, alinhamento, fontes de reserva (Arial e sans-serif) e usos a evitar |

Os gradientes oficiais são azul digital (#1249BB para #23AFE5), conexão segura (#37D20A para #1766D9) e profundidade (#163B72 para #1249B8). Observação: a prancha de cores traz o azul profundo como #1249B8 e o início do gradiente azul digital como #1249BB; o plano deve registrar qual valor é o oficial.

Paleta da prancha e contraste medido em 30/09/2026 (razão de luminância WCAG; texto normal exige 4,5:1, texto grande e componentes de interface exigem 3:1):

| Cor | Valor | Sobre branco (#FFFFFF) | Sobre cinza-gelo (#F3F7FA) | Texto normal |
|-----|-------|------------------------|----------------------------|--------------|
| Azul profundo | #1249B8 | 7,86:1 | 7,30:1 | atende |
| Azul royal | #1766D9 | 5,33:1 | 4,95:1 | atende |
| Azul ciano | #23AFE5 | 2,52:1 | 2,34:1 | **não atende** |
| Verde vivo | #37D20A | 2,02:1 | 1,88:1 | **não atende** |
| Verde escuro | #159B19 | 3,66:1 | 3,40:1 | **não atende** (atende só texto grande e ícones) |
| Navy | #163B72 | 11,04:1 | 10,25:1 | atende |
| Grafite | #26384A | 12,02:1 | 11,16:1 | atende |

Texto branco sobre as mesmas cores tem a mesma razão da coluna "sobre branco". Portanto, texto branco sobre verde escuro (3,66:1) também não atende para texto normal, e ciano e verde vivo não servem como cor de texto sobre fundo claro. O design system precisa de variantes acessíveis para esses usos.

**Combinações que a prancha de cores chama de "aprovadas" e o contraste real (calculado em 30/09/2026):**

| Combinação | Razão | Texto normal (4,5:1) | Uso permitido nesta spec |
|------------|-------|----------------------|--------------------------|
| Branco sobre azul profundo | 7,86:1 | atende | texto e componentes |
| Azul royal sobre branco | 5,33:1 | atende | texto e componentes |
| Verde vivo sobre navy | 5,46:1 | atende | texto e componentes sobre fundo escuro |
| Ciano sobre navy | 4,38:1 | **não atende** | só texto grande, ícones e elementos gráficos |
| Verde vivo sobre azul profundo | 3,89:1 | **não atende** | só texto grande, ícones e elementos gráficos |
| Ciano sobre azul profundo | 3,12:1 | **não atende** | só texto grande, ícones e elementos gráficos |
| Verde vivo sobre cinza-gelo | 1,88:1 | **não atende** | somente logotipo e elementos decorativos |

O logotipo é isento da exigência de contraste de texto pela própria WCAG 2.2 (critério 1.4.3, exceção para logotipos), então a combinação "verde vivo sobre cinza-gelo" pode aparecer no logotipo, mas **não** em texto nem em ícones de significado. Ícones e componentes que carregam informação precisam de pelo menos 3:1 contra o fundo; por isso o estado "ativo" dos ícones, que a prancha desenha em verde vivo, precisa usar uma variante de maior contraste sobre fundo claro.

## Clarifications

### Session 2026-09-30

- Q: Qual tela deve vir primeiro depois da Spec 002? → A: Telas e design system, antes das telas de domínio (cilindros, viagens, clientes), para que cada tela nova já nasça no padrão.
- Q: O redesenho muda comportamento? → A: Não. Nenhuma regra de autenticação, sessão, RBAC ou isolamento multitenant da Spec 002 muda; a interface só muda de aparência, estrutura visual e textos de apoio.
- Q: O logotipo e os ícones serão fornecidos prontos em vetor ou redesenhados? → A: Redesenhados nesta spec, a partir das pranchas de variações da marca e de iconografia, que passam a ser a especificação desses ativos. A aprovação da fidelidade à marca é uma etapa obrigatória do ciclo (MS-008).
- Q: A equipe de marca enviou arquivos oficiais do logotipo? → A: Sim, em 01/10/2026: assinatura principal, vertical, negativa branca, negativa sobre navy, monocromática preta e símbolo. Eles substituem o logotipo e o símbolo redesenhados, como a premissa previa. O símbolo e o favicon são exatamente o `icone.svg` oficial, em todos os tamanhos, sem versão reduzida. As versões do logotipo que a marca não enviou como arquivo (horizontal sem slogan, wordmark, monocromática azul e escala de cinza) são derivadas dos oficiais por script, apenas removendo elementos ou trocando a cor. Os 30 ícones continuam redesenhados nesta spec.
- Q: O catálogo de componentes fica dentro do aplicativo publicado ou só em desenvolvimento e CI? → A: Só desenvolvimento e CI (build separado), fora do pacote de produção.
- Q: Qual tolerância de diferença visual faz a comparação com a linha de base falhar? → A: Até 0,1% dos pixels, com o limite fixado na configuração do teste.
- Q: Em 360 px, formulários longos viram etapas ou seções? → A: Seções na mesma página, com um único envio.
- Q: Quem aprova a fidelidade à marca e a linha de base visual ao final do ciclo? → A: Alisson Almeida.
- Q: O que fazer com violações de acessibilidade moderadas ou leves? → A: Não bloqueiam o CI, mas são listadas no relatório e revisadas na aprovação do ciclo.
- Q: As pranchas adicionais (variações da marca, iconografia, layout, cores e tipografia) são normativas? → A: Sim, são a referência aprovada. Onde uma combinação da prancha não atender a WCAG 2.2 AA, vale a WCAG para texto e componentes de interface, e a prancha continua valendo para logotipo e elementos decorativos.

## Objetivos

- Definir uma identidade visual única, versionada e testável, a partir da prancha aprovada.
- Garantir que todo par de cores usado para texto e para componentes de interface atenda ao contraste da WCAG 2.2 AA.
- Oferecer componentes base e um shell de navegação consistentes, reutilizáveis nas próximas specs.
- Refazer as telas de identidade existentes nesse padrão, sem mudar nenhum comportamento.
- Cobrir carregamento, vazio, erro, offline e sincronização em todas as telas.
- Impedir regressões: acessibilidade, responsividade, ausência de recursos de terceiros e aparência passam a ser verificadas automaticamente.

## Atores

- **Pessoa usuária final**: entra, recupera acesso, escolhe a organização, mantém o perfil e usa as telas de administração dentro das permissões que já possui.
- **Administrador de tenant e Administrador FluxID/Master**: usam as telas de membros, papéis, organizações e auditoria.
- **Pessoa que usa tecnologia assistiva ou só o teclado**: precisa operar todas as telas sem mouse e com leitor de tela.
- **Pessoa desenvolvedora**: monta telas novas a partir dos componentes e dos tokens.
- **Pessoa responsável pela marca ou pelo design**: aprova a fidelidade das telas à identidade; neste ciclo, Alisson Almeida.

## Cenários de usuário e testes

### História 1 — Usar um padrão visual único e verificável (Prioridade: P1)

Uma pessoa desenvolvedora ou de design consulta e usa um conjunto único de tokens (cores, tipografia, espaçamento, sombras e gradientes) e de componentes base, em vez de decidir estilos tela a tela.

**Por que esta prioridade**: todas as outras histórias dependem deste padrão; sem ele cada tela repetiria o problema que o redesenho fora de spec causou.

**Teste independente**: abrir o catálogo de componentes e conferir que cada componente aparece em todas as variantes e estados, e executar a verificação automática de contraste dos tokens.

**Cenários de aceitação**:

1. **Dado** o catálogo de componentes, **quando** a pessoa abre um componente, **então** vê descrição, variantes, estados (padrão, foco, ativo, desabilitado, erro, carregando), orientação de uso e de acessibilidade.
2. **Dado** os tokens de cor, **quando** a verificação automática compara cada combinação permitida de texto e fundo, **então** todas atendem 4,5:1 (texto normal) ou 3:1 (texto grande e componentes), e qualquer combinação que não atenda faz a verificação falhar.
3. **Dado** o verde vivo e o ciano da prancha, **quando** a pessoa os procura como cor de texto sobre fundo claro, **então** o padrão oferece uma variante acessível para esse uso e restringe a cor original a elementos decorativos ou de grande dimensão.
4. **Dado** o catálogo, **quando** a pessoa abre o sistema de ícones e as versões do logotipo, **então** vê os 30 ícones em todos os tamanhos e estados, as versões do logotipo exigidas pelo aplicativo, a área de proteção, a redução mínima e os usos incorretos.

---

### História 2 — Navegar por um shell consistente e acessível (Prioridade: P1)

Qualquer pessoa, autenticada ou não, vê o mesmo shell: cabeçalho com a marca, link para pular ao conteúdo, landmark principal, indicador de conexão e sincronização, organização ativa e ação de sair quando houver sessão.

**Por que esta prioridade**: o shell é a base de acessibilidade e de feedback de conexão; a ausência dele quebrou a navegação por teclado e o aviso de offline.

**Teste independente**: abrir a aplicação deslogada e logada, em 360 px e em largura ampla, e navegar só pelo teclado.

**Cenários de aceitação**:

1. **Dado** a tela de entrada, **quando** a pessoa pressiona Tab pela primeira vez, **então** o foco vai para "Pular para o conteúdo principal", e ativá-lo leva o foco ao conteúdo principal.
2. **Dado** o dispositivo sem rede, **quando** qualquer tela é exibida, **então** o indicador de conexão informa o estado offline e oferece a ação de tentar reconectar, inclusive na tela de entrada.
3. **Dado** uma pessoa autenticada, **quando** o shell é exibido em 360 px, **então** organização ativa, perfil e sair continuam acessíveis sem rolagem horizontal.

---

### História 3 — Entrar, recuperar o acesso e confirmar o segundo fator (Prioridade: P1)

A pessoa executa, com a nova identidade, as telas de entrada, solicitação de recuperação, definição de nova senha, verificação em duas etapas e escolha de sessão a encerrar quando o limite é atingido.

**Por que esta prioridade**: é a porta de entrada do produto e a tela mais exposta; precisa ser a primeira a nascer correta.

**Teste independente**: percorrer cada fluxo da Spec 002 e confirmar que o resultado de cada ação é idêntico ao anterior, com a nova aparência.

**Cenários de aceitação**:

1. **Dado** a tela de entrada, **quando** a pessoa informa credenciais inválidas, **então** recebe a mesma mensagem genérica de antes, anunciada para tecnologia assistiva e com foco no campo correto.
2. **Dado** a tela de entrada, **quando** é exibida, **então** oferece somente e-mail, senha, entrar e recuperar acesso (nenhum login social, SSO, "lembrar de mim" ou cadastro).
3. **Dado** o limite de três sessões, **quando** a pessoa precisa escolher uma sessão a encerrar, **então** o diálogo prende o foco, fecha com Escape e devolve o foco ao controle que o abriu.
4. **Dado** a recuperação de senha, **quando** a solicitação é aceita, **então** a mesma mensagem é mostrada exista ou não a conta.

---

### História 4 — Escolher a organização e manter o perfil (Prioridade: P2)

A pessoa com mais de um vínculo escolhe a organização ativa, troca de organização e edita nome e foto de perfil, com a nova identidade.

**Por que esta prioridade**: são telas de uso frequente depois da entrada, de baixa complexidade e que validam formulários, listas de opções e envio de arquivo no padrão.

**Teste independente**: com dois vínculos, escolher cada organização e confirmar que os dados exibidos pertencem só à escolhida; atualizar o nome e enviar uma foto válida e uma inválida.

**Cenários de aceitação**:

1. **Dado** dois vínculos ativos, **quando** a tela de escolha é exibida, **então** o foco inicia no título e cada opção é operável só pelo teclado.
2. **Dado** o perfil, **quando** um arquivo inválido é escolhido, **então** a mensagem de erro é anunciada e nada é enviado.
3. **Dado** a troca de organização, **quando** o conteúdo anterior é removido, **então** nenhum dado da organização anterior permanece visível.

---

### História 5 — Administrar organizações, membros e papéis (Prioridade: P2)

Administradores usam, com a nova identidade, as telas de organizações, membros (com convite) e papéis e permissões, incluindo listas que viram cartões no mobile.

**Por que esta prioridade**: concentram tabelas, formulários longos e diálogos de confirmação com justificativa, que são os casos mais difíceis para o padrão.

**Teste independente**: em 360 px e em largura ampla, executar convidar, bloquear e reativar um vínculo, criar e desativar um papel e criar uma organização.

**Cenários de aceitação**:

1. **Dado** a lista de membros ou de organizações em 360 px, **quando** exibida, **então** cada item aparece como cartão legível, sem rolagem horizontal e com ações de 44 px.
2. **Dado** uma ação sensível, **quando** o diálogo de confirmação abre, **então** exige a justificativa já prevista na Spec 002, prende o foco e devolve o foco ao fechar.
3. **Dado** uma pessoa sem permissão, **quando** abre uma área restrita, **então** vê a mensagem de acesso negado já existente, no padrão visual.

---

### História 6 — Consultar a auditoria (Prioridade: P3)

A pessoa autorizada consulta eventos de auditoria com filtros e paginação, com a nova identidade, em tabela na largura ampla e em lista no mobile.

**Por que esta prioridade**: é consulta, sem efeito colateral, e valida a tabela de maior volume e os filtros.

**Teste independente**: aplicar filtros válidos e inválidos e carregar mais eventos, em 360 px e em largura ampla.

**Cenários de aceitação**:

1. **Dado** filtros inválidos, **quando** a pessoa aplica o filtro, **então** o erro é associado ao campo, anunciado e nenhuma consulta é feita.
2. **Dado** a consulta sem eventos, **quando** exibida, **então** mostra o estado vazio do padrão, com orientação.

---

### História 7 — Receber feedback consistente de carregamento, vazio, erro, offline e sincronização (Prioridade: P2)

Em toda tela, a pessoa entende o que está acontecendo: carregando, sem dados, erro com ação possível, sem rede ou sincronizando, sempre com o mesmo vocabulário visual e os mesmos anúncios.

**Por que esta prioridade**: o PRD exige feedback de offline e sincronização e nunca confirmação otimista; a consistência evita que cada tela invente o seu.

**Teste independente**: forçar cada estado em cada tela e conferir aparência, texto e anúncio.

**Cenários de aceitação**:

1. **Dado** uma operação sensível sem rede, **quando** a pessoa a aciona, **então** vê o erro de conexão e **nenhuma** confirmação de sucesso aparece.
2. **Dado** o carregamento de uma lista, **quando** demora, **então** o indicador de carregamento é anunciado uma vez, não bloqueia o teclado e respeita a preferência por movimento reduzido.
3. **Dado** o retorno da rede, **quando** a sincronização conclui, **então** o indicador volta ao estado normal e a pessoa é informada sem perder o que digitava.

## Requisitos funcionais

### Identidade e tokens

- **RF-001**: O design system deve definir tokens de cor, tipografia, espaçamento, sombras e gradientes a partir da prancha de identidade, em um único lugar versionado.
- **RF-002**: O layout deve seguir o sistema de layout da prancha: grid de 12 colunas no desktop (container de até 1200 px e margem de 32 px), de 8 colunas no tablet (margem de 24 px) e de 4 colunas no mobile (margem de 16 px), todos com calha de 16 px; containers largo (1200 px), padrão (960 px) e compacto (720 px); e escala de espaçamento de base 8 px (4, 8, 16, 24, 32, 48 e 64), sem medidas fora da escala.
- **RF-003**: A tipografia deve usar Montserrat nos pesos 300, 400, 500, 600, 700 e 800, com a escala da prancha (display 64 px, H1 48 px, H2 36 px, H3 24 px, corpo 16 px e legenda 12 px), entrelinha de 100%, 125% e 150%, hospedada no próprio aplicativo. Em telas estreitas, os tamanhos de título devem reduzir para caber sem rolagem horizontal. As fontes de reserva são Arial e a sans-serif do sistema.
- **RF-003A**: O padrão deve definir cores semânticas de erro, alerta e sucesso (a prancha mostra alerta em vermelho e status ativo em verde, mas a paleta não as nomeia), com contraste verificado nas mesmas regras de RF-004, e a informação nunca pode depender só da cor.
- **RF-004**: Cada token de cor de texto ou de componente deve ter combinações permitidas explícitas com o fundo, e o conjunto deve incluir variantes acessíveis para ciano, verde vivo e verde escuro.
- **RF-005**: A cor original do verde vivo e do ciano só pode ser usada em elementos decorativos ou de grande dimensão, nunca como cor de texto normal sobre fundo claro.
- **RF-006**: Os gradientes oficiais (azul digital, conexão segura e profundidade) são decorativos; nenhum texto essencial pode depender deles sem contraste verificado sobre o ponto mais claro do gradiente.
- **RF-006A**: O catálogo deve documentar a proporção de uso das cores da prancha (60% neutros, 25% azuis, 10% verdes e 5% ciano) como orientação, e as combinações aprovadas com seus contrastes medidos e a restrição de uso de cada uma (ver a tabela do Contexto).

### Componentes

- **RF-007**: O padrão deve oferecer, no mínimo, botão (primário, secundário e perigoso, com os estados normal, hover, foco e desabilitado), campo de texto e seletor com rótulo, ajuda e erro, indicador de status (por exemplo ativo e conectado), mensagem de alerta e de erro, diálogo de confirmação, card (raio de 12 px, padding de 24 px, borda de 1 px e sombra suave, nas variantes informativa, de indicador e de alerta), lista, tabela que se adapta a lista no mobile, indicador de carregamento e estado vazio.
- **RF-008**: Todo componente interativo deve ter estados de foco, desabilitado, carregando e erro, e alvo de toque mínimo de 44 px.
- **RF-009**: O diálogo deve prender o foco, fechar com Escape, devolver o foco ao acionador e anunciar seu título.
- **RF-010**: Campos de formulário devem associar rótulo, descrição e erro ao controle, de modo que leitores de tela os anunciem; a cor não pode ser o único indicador de erro.
- **RF-011**: Cada componente deve ter documentação com descrição, variantes, estados, orientação de uso e requisitos de acessibilidade, acessível em um catálogo navegável. O catálogo é um build separado, executado em desenvolvimento e no CI, e não faz parte do pacote de produção do aplicativo (não entra no cache offline da PWA nem no carregamento inicial do shell).

### Shell

- **RF-012**: O shell deve ser exibido em todas as telas, autenticadas ou não, com cabeçalho e marca, link "Pular para o conteúdo principal", um único landmark principal e rodapé.
- **RF-013**: O shell deve exibir o estado de conexão e de sincronização, com a ação de tentar reconectar quando offline, também na tela de entrada.
- **RF-014**: Autenticada, a pessoa deve ver a organização ativa, o acesso ao perfil e a ação de sair; deslogada, nenhum dado de tenant é exibido.
- **RF-015**: O botão de instalar a PWA, quando disponível, deve atender ao contraste e ao alvo de toque do padrão.

### Telas

- **RF-016**: Devem ser refeitas no padrão: entrada, solicitação de recuperação, definição de nova senha, verificação em duas etapas (inclusive configuração do segundo fator), diálogo de limite de sessões, seleção e troca de organização, perfil e avatar, administração de organizações, membros e convites, papéis e permissões e consulta de auditoria do tenant e da plataforma.
- **RF-017**: Cada tela deve manter as mesmas rotas, os mesmos campos, as mesmas validações, as mesmas permissões exigidas e o mesmo resultado de cada ação da Spec 002.
- **RF-018**: As mensagens que protegem contra enumeração de contas (entrada e recuperação) devem permanecer equivalentes em significado e idênticas entre os casos.
- **RF-019**: A tela de entrada deve oferecer somente e-mail, senha, entrar e recuperar acesso.
- **RF-020**: Em 360 px, listas e tabelas de dados devem aparecer como cartões, e formulários longos devem ser divididos em seções na mesma página, com um único envio, sem rolagem horizontal e sem criar etapas (avançar e voltar) que alterem o fluxo da Spec 002.

### Estados

- **RF-021**: Toda tela deve tratar e exibir, no mesmo padrão, os estados de carregamento, vazio, erro, offline e sincronização.
- **RF-022**: Nenhuma tela pode exibir confirmação de sucesso para uma operação cujo resultado o servidor não confirmou.
- **RF-023**: A preferência de movimento reduzido deve desativar animações contínuas em toda a aplicação.

### Ativos de marca

- **RF-024**: O logotipo deve usar os arquivos vetoriais oficiais da equipe de marca (e versões derivadas deles, sem redesenho, para as variações que a marca não enviou) e estar disponível no aplicativo, no mínimo nas versões que a aplicação usa: assinatura secundária (horizontal sem slogan, para o cabeçalho), assinatura vertical (para telas de entrada), símbolo isolado e a versão negativa branca (para fundos azul e navy). O restante das variações da prancha (principal com slogan, wordmark, monocromáticas azul e preta e escala de cinza) entra no catálogo.
- **RF-025**: O símbolo deve existir nos tamanhos 256, 64, 32 e 16 px e dele devem derivar o favicon e os ícones de instalação da PWA, legíveis no menor tamanho.
- **RF-026**: O uso do logotipo deve respeitar a área de proteção, a redução mínima digital de 120 px de largura e os fundos aprovados da prancha, e o catálogo deve mostrar os usos incorretos (distorcer, alterar as cores, girar, aplicar sombras e trocar a tipografia).
- **RF-027**: O sistema de ícones deve conter os 30 ícones da prancha de iconografia: rastreabilidade (localização, rota, histórico, geocerca, mapa e última leitura), segurança (escudo, lacre, bloqueio, alerta, rompimento e verificado), conectividade (antena, GPS, rede, nuvem, sincronizar e sem sinal), ativos e logística (cilindro, sensor, caminhão, armazém, entrega e inventário) e sistema (dashboard, usuário, configurações, relatórios, filtros e notificações).
- **RF-028**: Os ícones devem seguir a construção da prancha (grid de 24 por 24 px, traço de 2 px na grade de 24 px, proporcional nos demais tamanhos e com ajuste para 2 px efetivos a 16 px, terminais arredondados e área segura de 2 px), existir nos tamanhos 16, 24, 32 e 48 px e nos estados padrão, ativo, desabilitado e erro, com as variantes contorno, duotone, monocromática e negativa.
- **RF-029**: Todo ícone que carrega significado deve ter nome acessível ou estar associado a texto, e todo ícone puramente decorativo deve ser ignorado por tecnologia assistiva; cada estado do ícone sobre fundo claro deve atender 3:1 de contraste.
- **RF-030**: Nenhum ativo (fonte, imagem, ícone, script ou folha de estilo) pode ser carregado de domínio de terceiros, e nenhuma fotografia de banco de imagens pode ser usada nas telas.

## Requisitos não funcionais

- **RNF-001**: A aplicação deve funcionar offline para o shell e para as telas já suportadas, inclusive com a fonte e os ícones hospedados localmente.
- **RNF-002**: Se a fonte não carregar, o texto deve continuar legível com fonte do sistema, sem quebrar o layout.
- **RNF-003**: O tempo percebido de entrada e de confirmação de recuperação definido na Spec 002 (RNF-003 e RNF-004) não pode piorar; a medição de antes e depois é registrada.
- **RNF-004**: O carregamento inicial do shell não pode piorar mais de 20% em relação à linha de base medida antes da mudança.
- **RNF-005**: As telas devem funcionar de 360 px a desktop amplo, em orientação retrato e paisagem.
- **RNF-006**: O padrão deve permitir uma tela nova sem criar cores, tamanhos de fonte ou espaçamentos fora dos tokens.

## Regras de negócio

- **RN-001**: Esta spec é apenas de apresentação. Nenhuma regra de autenticação, sessão, MFA, RBAC, isolamento multitenant, auditoria ou retenção da Spec 002 pode mudar.
- **RN-002**: Textos de interface podem ser refinados, mas não podem alterar o significado das mensagens de segurança nem revelar dados que hoje não são revelados.
- **RN-003**: Toda tela nova ou refeita deve usar somente componentes e tokens do padrão; exceções precisam ser registradas no catálogo.

## Critérios de aceitação transversais

- **CA-001**: Cada tela refeita, em 360 px, 768 px e 1920 px, não apresenta violações críticas ou graves na verificação automática de acessibilidade WCAG 2.2 AA (violações críticas e graves bloqueiam o CI; as moderadas e leves não bloqueiam, mas são listadas no relatório e revisadas na aprovação do ciclo).
- **CA-002**: A verificação automática de contraste cobre 100% das combinações de cor permitidas pelos tokens e falha se uma combinação não atender 4,5:1 (texto normal) ou 3:1 (texto grande e componentes).
- **CA-003**: Todos os controles interativos têm alvo de toque de pelo menos 44 por 44 px, exceto links em linha dentro de texto corrido.
- **CA-004**: Um teste registra as requisições de rede ao carregar cada tela e comprova nenhuma requisição a domínio de terceiros.
- **CA-005**: Nenhuma tela apresenta rolagem horizontal em 360 px, 768 px e 1920 px, nem com zoom de 200% (reflow equivalente a 320 px).
- **CA-006**: Todas as funções de todas as telas são operáveis só pelo teclado, com indicador de foco visível de contraste mínimo de 3:1 e sem armadilha de foco.
- **CA-007**: As suítes de testes da Spec 002 (unitários, de contrato, banco, ao vivo e E2E) continuam passando sem mudança nas verificações de comportamento; só seletores e textos de apoio podem mudar.
- **CA-008**: A captura de cada tela, em três larguras e nos estados principais, é comparada com uma linha de base aprovada; diferença acima de 0,1% dos pixels (limite fixado na configuração do teste) falha a verificação, a menos que a mudança seja aprovada e a linha de base atualizada.
- **CA-009**: Com a preferência de movimento reduzido ativa, nenhuma animação contínua permanece em execução em nenhuma tela.
- **CA-010**: 100% dos componentes do padrão estão documentados no catálogo com descrição, variantes, estados e orientação de acessibilidade.
- **CA-011**: Em modo de cores forçadas do sistema (alto contraste), todos os controles continuam visíveis e distinguíveis.
- **CA-012**: Os 30 ícones existem nos quatro tamanhos e nos quatro estados, e a verificação automática confirma que cada estado sobre fundo claro atende 3:1 e que o símbolo oficial a 16 px mantém escudo e pino distintos (de duas a quatro formas relevantes, isto é, com ao menos 6 pixels conectados, sem se fragmentar; os pontos da órbita, menores que isso, não contam), tem cobertura de pixels entre 20% e 80% e nenhuma forma relevante com menos de 2 px de largura; a legibilidade percebida a 16 px é aprovada por pessoa responsável (MS-008).
- **CA-013**: A verificação automática confirma que as medidas de layout (calhas, margens, containers e espaçamentos) e os tamanhos e pesos de fonte usados nas telas pertencem às escalas dos tokens.

## Cenários de exceção e casos de borda

- A fonte principal não carrega (rede lenta ou offline no primeiro acesso): o texto usa a fonte do sistema e o layout permanece utilizável.
- Nomes muito longos de organização, pessoa ou papel: o texto quebra ou trunca com acesso ao conteúdo completo, sem estourar o cartão nem causar rolagem horizontal.
- Tabela com muitas colunas em 360 px: vira cartões sem perder nenhuma informação ou ação.
- Zoom de 200% ou espaçamento de texto ampliado: nada é cortado nem sobreposto.
- Teclado virtual aberto em tela pequena: o campo em edição e a mensagem de erro permanecem visíveis.
- Diálogo com conteúdo longo em 360 por 640 px, inclusive em paisagem: o conteúdo rola dentro do diálogo e as ações permanecem alcançáveis.
- Sessão expira ou rede cai com um diálogo aberto: o estado é informado sem confirmação falsa e sem perder o foco de forma desorientadora.
- Indicador de erro apenas por cor: não é permitido; sempre há texto ou ícone associado.
- Resposta do servidor lenta: o indicador de carregamento aparece e é anunciado uma vez, sem duplicar anúncios.
- Dispositivo em modo de cores forçadas ou com alto contraste: bordas e estados continuam perceptíveis.

## Requisitos de acessibilidade e experiência

- **RA-001**: Todas as telas atendem a WCAG 2.2 nível AA, incluindo contraste, reflow, espaçamento de texto, foco visível e não obscurecido, e tamanho de alvo.
- **RA-002**: A hierarquia de títulos é lógica em cada tela, com um único título principal, e existe um único landmark principal.
- **RA-003**: Mensagens de status e de erro são anunciadas a tecnologias assistivas sem mover o foco indevidamente; erros de formulário são associados ao campo.
- **RA-004**: O idioma da página é português do Brasil.
- **RA-005**: A informação nunca depende só de cor, forma ou posição.
- **RA-006**: O foco é movido de forma previsível em mudanças de tela, diálogos e trocas de organização.
- **RA-007**: Animações respeitam a preferência de movimento reduzido e nenhuma pisca mais de três vezes por segundo.
- **RA-008**: Os alvos de toque e o espaçamento atendem ao mínimo de 44 px do PRD.

## Entidades principais

- **Token de design**: valor nomeado de cor, tipografia, espaçamento, sombra ou gradiente, com seus usos permitidos e a razão de contraste de cada combinação.
- **Componente**: elemento reutilizável da interface, com variantes, estados, regras de acessibilidade e documentação.
- **Tela**: composição de componentes dentro do shell, com seus estados (carregamento, vazio, erro, offline, sincronização).
- **Ativo de marca**: logotipo, ícone ou padrão gráfico em formato vetorial, hospedado no aplicativo.
- **Linha de base visual**: conjunto aprovado de capturas de tela, por tela, largura e estado, usado para detectar regressão.

## Dependências

- Spec 002: rotas, campos, regras, mensagens de segurança e testes das telas de identidade.
- Prancha de identidade FluxID (`referencias/prancha-identidade-fluxid.png`).
- As seis pranchas de identidade em `referencias/`, que passam a ser a especificação do logotipo, dos ícones, do layout, das cores e da tipografia.
- Alisson Almeida, que aprova os ícones redesenhados, o uso dos arquivos oficiais da marca, a fidelidade das telas à identidade e a linha de base visual ao final do ciclo, e registra a validação humana (MS-008).
- Licença que permita hospedar a fonte Montserrat no aplicativo.
## Premissas e decisões assumidas

- Não há tema escuro nesta spec; só o tema claro da prancha.
- O idioma é português do Brasil; internacionalização está fora do escopo.
- O azul royal com texto branco (5,33:1) e o azul profundo, o navy e o grafite atendem texto normal e são a base para texto e botões primários; os valores das variantes acessíveis do verde e do ciano, e das cores semânticas de erro, alerta e sucesso, serão definidos no plano e verificados pelos testes de contraste.
- Onde a prancha aprova uma combinação que não atende a WCAG (por exemplo, verde vivo sobre cinza-gelo), a combinação vale só para o logotipo e elementos decorativos; texto e ícones de significado seguem a WCAG.
- Os 30 ícones são redesenhados nesta spec a partir da prancha de iconografia, que é a especificação deles; a aprovação da fidelidade é uma etapa do ciclo. O logotipo e o símbolo usam os arquivos oficiais enviados pela equipe de marca em 01/10/2026; novas versões oficiais substituem as derivadas sem mudar a spec.
- A prancha de layout mostra componentes e cores de status (por exemplo, vermelho de alerta) que a paleta não nomeia; o plano deve definir esses valores.
- O valor oficial do azul profundo (#1249B8 na paleta, #1249BB no início de um gradiente) é decidido no plano e registrado nos tokens.
- Rotas, campos, validações e permissões da Spec 002 permanecem como estão; só a apresentação muda.
- O catálogo de componentes é uma documentação navegável e versionada, publicada apenas em desenvolvimento e CI (fora do pacote de produção); a ferramenta que o implementa é decisão do plano.
- A linha de base visual é aprovada por Alisson Almeida antes de passar a bloquear regressões.
- Os usuários de teste do ambiente local bastam para validar as telas; nenhuma publicação em nuvem é necessária.

## Fora do escopo

- Telas de domínio: cilindros, viagens, clientes, frota, motoristas e geocercas.
- Login social, SSO, cadastro público, "lembrar de mim" e qualquer método de autenticação além de e-mail e senha.
- Aplicações de marca: embalagem, site institucional, redes sociais, cartão de visita e outdoor.
- Tema escuro, internacionalização e personalização de tema por tenant.
- Qualquer mudança de regra de autenticação, sessão, MFA, RBAC, isolamento multitenant, auditoria ou retenção.
- Publicação em nuvem (Supabase cloud e Vercel).

## Métricas de sucesso

- **MS-001**: 100% das telas refeitas, nas três larguras de referência, sem violações críticas ou graves de acessibilidade.
- **MS-002**: 100% das combinações de cor permitidas pelos tokens atendem o contraste mínimo da WCAG 2.2 AA.
- **MS-003**: 0 requisições a domínios de terceiros ao carregar qualquer tela.
- **MS-004**: 100% das tarefas das histórias 1 a 6 são concluídas só com o teclado.
- **MS-005**: 100% das verificações de comportamento da Spec 002 continuam aprovadas.
- **MS-006**: 100% dos componentes do padrão documentados no catálogo.
- **MS-007**: O tempo percebido de entrada e de recuperação não piora em relação à medição anterior.
- **MS-008**: A pessoa responsável pela marca aprova a fidelidade das telas, do logotipo e dos ícones às pranchas de identidade, com registro da validação humana (amostra, ambiente, duração e resultado).
- **MS-009**: 100% dos 30 ícones e das versões de logotipo exigidas pelo aplicativo existem em formato vetorial no próprio aplicativo e aparecem no catálogo.
