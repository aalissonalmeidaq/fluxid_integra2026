# Contrato: Visão geral, barra superior e menu da pessoa

**Atende**: RF-008 a RF-023, RA-002 a RA-006

## Estrutura do DOM (com sessão)

```text
<a> Pular para o conteúdo principal
[≥ 768 px] <aside> logotipo (h1, link para "/", 192 px) + <nav aria-label="Navegação principal"> (Spec 004, "Visão geral" em vez de "Início")
<header TopBar>  [< 768 px: botão do menu + logotipo (h1, link para "/", 152 px)] · organização ativa [Trocar organização] · Instalar App · menu da pessoa
[barra de conexão existente]
<main id="main-content" tabindex="-1">
  <h2> Visão geral </h2>  <p> subtítulo + "Dados de exemplo" </p>
  <section aria-labelledby> Indicadores: 4 cartões (ícone, valor, rótulo, nota) — cada um com "Exemplo"
  <section> Cilindros e viagens no mapa (espaço reservado)       "Exemplo"
  <section> Movimentação de cilindros (LineChart + tabela)       "Exemplo"
  <section> Cilindros por situação (DonutChart + legenda + tabela) "Exemplo"
  <section> Alertas recentes (lista)                              "Exemplo"
  <section> Cilindros recentes (lista)                            "Exemplo"
  <section> Desempenho operacional (3 medidas)                    "Exemplo"
```

- Um só `h1` (logotipo, renderizado uma vez por largura) e um só `main`; cada bloco é uma região com nome acessível (`h3`); a ordem de leitura segue a ordem visual.
- Nenhum texto "Fundação Técnica Ativa"; nenhum "Ver todos", "busca", "ajuda" ou "notificações" (RF-014, RF-023).

## Grade responsiva

| Largura | Cartões | Blocos |
|---|---|---|
| 360 px | 1 coluna | Uma coluna; menu recolhido atrás do botão |
| 768 px | 2 colunas | Menu fixo; blocos em uma ou duas colunas conforme a largura útil |
| 1920 px | 4 na mesma linha | Mapa e movimentação lado a lado, depois situação, alertas e cilindros; sem esticar além de `containers.largo` |

Sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%; tabelas e texto longo rolam ou quebram dentro do bloco.

## Estados por bloco

| Estado | Exibição |
|---|---|
| `loading` | `Loading` do design system dentro do bloco; região `role="status"` anuncia uma vez; a estrutura não muda de lugar depois |
| `ready` | Conteúdo, com a marca "Exemplo" |
| `empty` | `EmptyState` com texto explicativo, nunca área em branco |
| `error` | `Alert` com mensagem em texto e a ação "Tentar de novo"; os demais blocos seguem |

Offline com o app instalado: a estrutura abre (a fonte de exemplo está no pacote) com o aviso de offline da Spec 003. O foco não se move em nenhum estado.

## Menu da pessoa

- Botão com `aria-expanded` e `aria-controls`; painel com nome de exibição, organização ativa, "Meu perfil" e "Sair".
- Escape ou clique fora fecham e devolvem o foco ao botão; Tab percorre os itens na ordem; nome longo trunca com reticências sem estourar a largura.
- O nome é lido ao abrir; falha ou demora mostra "Minha conta" sem bloquear as ações.
- Perfil global sem tenant ativo: a barra superior mostra só o que existe.

## Estilo

Só tokens, componentes, ícones e Montserrat da Spec 003; no máximo duas ênfases de cor por bloco; sem sombras pesadas nem animações; alvos de 44 por 44 px; foco visível de 3:1 ou mais; `prefers-reduced-motion` respeitado (nada anima).
