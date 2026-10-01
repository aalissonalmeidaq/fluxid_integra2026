# Contrato: menu de navegação no shell

**Atende**: RF-005 a RF-020, RA-001 a RA-007

## Itens e visibilidade

Catálogo e ordem em [data-model.md](../data-model.md). Regra: um item restrito aparece só no estado `ready` (ou `offline` com cache da mesma sessão e tenant) e só se o código exigido consta na lista do escopo (`tenant` ou `global`). Ser perfil global não concede itens do tenant. Início e Meu perfil aparecem em todo estado com sessão. Sem sessão, ou com a sessão limitada ao fluxo de verificação em duas etapas (`mfa_required`), o menu não é renderizado.

## Estrutura do DOM

```text
<header> … logotipo, [botão do menu < 768 px], instalar PWA, organização ativa, sair
<nav aria-label="Navegação principal">
  <ul>
    <li><a href="/" aria-current="page">Início <span class="sr-only">(página atual)</span></a></li>
    <li><a href="/perfil">Meu perfil</a></li>
    …
  </ul>
  [estado: carregando | erro com "Tentar de novo" | "possivelmente desatualizado"]
</nav>
<main id="main-content" tabindex="-1">
```

- Um só landmark `main`, um só `h1` por tela (logotipo), nome acessível único para o `nav`.
- O item atual usa `aria-current="page"`, texto "(página atual)" para tecnologias assistivas e marca visual por barra e peso, nunca só cor.
- O estado do menu usa uma região `role="status"` única; o erro usa `Alert`. Anúncio uma vez, sem mover o foco.

## Responsividade

| Largura | Comportamento |
|---|---|
| Menor que 768 px (inclui 320 e 360) | Menu recolhido atrás de um botão "Menu" com `aria-expanded` e `aria-controls`; painel sob o cabeçalho, com rolagem vertical própria e sem cobrir o conteúdo quando fechado |
| 768 px ou mais (tablet e desktop) | Menu fixo em coluna à esquerda do `main`, sempre visível; o botão não existe |

Sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%. O texto longo quebra dentro do alvo de 44 px. Retrato e paisagem. Movimento reduzido sem animação; nada pisca.

## Teclado e foco

| Ação | Resultado |
|---|---|
| Primeiro Tab da página | Link "Pular para o conteúdo principal" |
| Enter ou Espaço no botão do menu | Abre o painel e leva o foco ao primeiro item |
| Tab / Shift+Tab | Percorre os itens em ordem visual; painel fechado fica fora da ordem de Tab (`hidden`) |
| Enter em um item | Navega por carga de página; a tela de destino move o foco ao título (RA-006 da Spec 003, RF-013) e o menu começa fechado em largura menor que 768 px |
| Escape com o painel aberto | Fecha e devolve o foco ao botão |
| Toque ou clique fora do painel aberto | Fecha e devolve o foco ao botão |

Todos os controles têm alvo de 44 por 44 px e anel de foco de 3:1 ou mais, com os tokens da Spec 003. Nenhuma cor, tamanho ou espaçamento fora dos tokens (RF-010, `escalas-no-codigo`).

## Estados

| Estado | Itens | Mensagem | Ação |
|---|---|---|---|
| Carregando | Início, Meu perfil | "Carregando telas…" (`Loading`, anunciado uma vez) | nenhuma; teclado livre |
| Pronto | conforme as permissões | nenhuma | nenhuma |
| Erro (falha ou 5 s sem resposta) | Início, Meu perfil | "Parte das telas não pôde ser listada." | botão "Tentar de novo" |
| Offline com cache | últimas telas da mesma sessão e tenant | "Sem conexão. As telas podem estar desatualizadas." | nenhuma |
| Offline sem cache | Início, Meu perfil | idem | nenhuma |
| Vazio (sem permissões restritas) | Início, Meu perfil | nenhuma | nenhuma |

## Atualização

A consulta roda ao autenticar, em cada carga de página, ao mudar o tenant ativo e a cada 60 s com a aba visível e online. Offline pausa; ao voltar a rede refaz. Ao mudar tenant ou pessoa o estado volta a `loading` antes do novo render, sem itens do contexto anterior. Sair, expirar ou trocar de pessoa descarta o estado e o cache.

## Cabeçalho

O link "Meu perfil" sai do cabeçalho (está no menu). Permanecem: logotipo, instalar PWA, organização ativa (com "Trocar organização") e Sair. O botão do menu entra à esquerda do logotipo em largura menor que 768 px.
