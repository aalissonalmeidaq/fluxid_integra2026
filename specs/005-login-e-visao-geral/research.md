# Pesquisa: Entrada renovada e Visão geral

Decisões da Fase 0. Nenhum item ficou como "NEEDS CLARIFICATION": as ambiguidades da spec foram resolvidas em `/speckit-clarify` (seção Clarifications) e o restante é decisão de implementação.

## 1. Como desenhar os gráficos sem biblioteca

- **Decisão**: dois componentes SVG próprios (`LineChart`, `DonutChart`) em `src/design-system/charts/`, com cores só de tokens e uma `<table>` equivalente.
- **Justificativa**: RNF-002 proíbe dependência nova, e o catálogo de ícones da Spec 003 já é SVG próprio. Dois gráficos simples não justificam biblioteca; o SVG dá controle total de contraste, rótulos e acessibilidade.
- **Alternativas**: biblioteca de gráficos (rejeitada: dependência nova, peso no pacote e acessibilidade variável); canvas (rejeitado: não é lido por tecnologia assistiva nem respeita cores forçadas).

## 2. Acessibilidade dos gráficos

- **Decisão**: `role="img"` com `aria-labelledby` e `aria-describedby`; tabela com os mesmos dados ao lado; legenda da rosca com valor e percentual em texto; traçados e marcadores distintos além da cor.
- **Justificativa**: WCAG 2.2 AA (1.4.1, 1.1.1) e RA-003. A tabela serve a quem usa teclado e a quem precisa dos números exatos; funciona com cores forçadas.
- **Alternativa**: só `aria-label` com resumo (rejeitada: perde os dados).

## 3. Paleta dos gráficos

- **Decisão**: `navy`, `azul-royal`, `ciano-acessivel` e `verde-acessivel`; elementos gráficos com 3:1 ou mais contra `branco`, verificado em teste com `src/design-system/contrast.ts`.
- **Justificativa**: `azul-ciano`, `verde-vivo` e `alerta-faixa` são só decorativos (`CORES_SO_DECORATIVAS` e baixo contraste de `alerta-faixa`). Quatro categorias na rosca exigem quatro tons distinguíveis; os traçados diferentes cobrem daltonismo.
- **Alternativa**: criar tokens novos (rejeitada: RF-024 proíbe cor fora dos tokens da Spec 003).

## 4. Fonte de dados de exemplo

- **Decisão**: porta `OverviewSource` (aplicação), tipos no domínio e implementação `sampleOverviewSource` na infraestrutura, injetada por um contexto.
- **Justificativa**: RF-017 pede fonte única substituível. A divisão segue as camadas do projeto e deixa a regra fora dos componentes React. A spec dos cilindros troca a implementação sem mexer nos blocos, e os testes injetam falha, demora e vazio sem ganchos no código de produção.
- **Alternativas**: constantes dentro dos componentes (rejeitada: espalha os números e quebra RF-017); parâmetro de URL para simular estados (rejeitada: gancho de teste em produção e risco de confundir dado de exemplo com real).

## 5. Estrutura de títulos

- **Decisão**: o logotipo continua sendo o `h1`; "Visão geral" e "Bem-vindo de volta" (entrada) são `h2`; blocos são `h3`.
- **Justificativa**: é a convenção do shell desde a Spec 003. Trocar o nível das telas existentes ultrapassaria o que CA-001 permite mudar. RF-027 (um só `h1`) continua verdadeira desde que o logotipo seja renderizado uma vez por largura.
- **Alternativa**: título da tela como `h1` e logotipo sem nível (rejeitada: alteraria todas as telas e seus testes).

## 6. Layout do shell autenticado

- **Decisão**: grade de duas colunas a partir de 768 px (lateral com logotipo e menu da Spec 004; coluna principal com barra superior, barra de conexão e `main`); abaixo, a barra superior carrega o botão do menu e o painel da Spec 004.
- **Justificativa**: reproduz a estrutura das referências com o menu que já existe. O `use-min-width` já decide entre coluna fixa e painel, e o menu mantém seu foco e seus estados.
- **Alternativa**: manter o cabeçalho atual e só acrescentar a Visão geral (rejeitada: RF-021 e RF-022 pedem a barra superior com o menu da pessoa).

## 7. Menu da pessoa

- **Decisão**: botão de divulgação com `aria-expanded` e `aria-controls`; o nome vem do `ProfileService.load()` ao abrir, com texto alternativo se falhar.
- **Justificativa**: o estado de autenticação não carrega o nome de exibição, e RF-032 proíbe leitura de dado real na **Visão geral**; o menu da pessoa é do shell e usa o serviço de perfil já existente, só sob demanda. Divulgação em vez de `role="menu"` evita a navegação por setas e mantém Tab natural (RF-022).
- **Alternativa**: guardar o nome no estado de autenticação (rejeitada: mudaria a Spec 002 e criaria dado pessoal em memória sem necessidade).

## 8. Entrada

- **Decisão**: trocar só a moldura de `LoginPage` por `AuthLayout` e `BrandPanel`; campo de senha vira `PasswordField`; o texto atual "Esqueci minha senha" é preservado.
- **Justificativa**: RF-003 e RN-003 mantêm todo o comportamento da Spec 002. Alterar a lógica ou os textos de ação criaria risco sem ganho de identidade.
- **Alternativa**: reescrever a página (rejeitada: regressão de autenticação).

## 9. Desempenho e tamanho

- **Decisão**: medir antes (linha de base em `baseline.md`) e depois; `React.lazy` da Visão geral só se a medição passar do limite.
- **Justificativa**: o limite é de 20% sobre a mediana da Spec 004 (107 ms autenticado e 152 ms na entrada) e de 5% no pacote. Dividir o pacote sem necessidade adiciona carregamento assíncrono e estados extras.
- **Alternativa**: dividir o código desde o início (rejeitada: complexidade antes de haver medida).

## 10. Redação dos exemplos

- **Decisão**: textos no vocabulário do PRD (cilindro, lacre, geocerca, teste hidrostático, custódia) e redigidos como indicadores e eventos; "Exemplo" visível em todo bloco.
- **Justificativa**: RN-004 e a constituição (IV) proíbem presumir que um comando, uma trava ou uma entrega aconteceu. Medidas como "cilindros com teste hidrostático em dia" e "alertas tratados" não afirmam estado físico.
- **Alternativa**: copiar os números e rótulos das referências (rejeitada: conteúdo de outro produto, segundo a decisão de clarify).
