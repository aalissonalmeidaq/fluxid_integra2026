# Contrato: ativos de marca

**Atende**: RF-024 a RF-030, CA-012, MS-009

Especificação visual: pranchas `02-variacoes-da-marca.png` e `03-sistema-de-iconografia.png` em [referencias/](../referencias/). Todos os ativos são SVG hospedados no aplicativo: os 30 ícones inline e o logotipo e o símbolo como arquivos oficiais da marca.

## Logotipo (`src/design-system/brand/`)

| Versão | Componente | Onde é usada |
|---|---|---|
| Secundária (horizontal sem slogan) | `Logo variant="horizontal"` | cabeçalho do shell |
| Vertical | `Logo variant="vertical"` | telas de entrada e recuperação |
| Símbolo (256, 64, 32 e 16 px de altura) | `Simbolo size` | favicon, PWA, catálogo |
| Negativa branca | `Logo variant="negativa-branca"` | fundos azul e navy |
| Principal (com slogan), wordmark, monocromática azul, monocromática preta, escala de cinza, negativa sobre navy | arquivos de `brand/oficial/`, em `logo-variacoes.ts` | somente no catálogo |

**Origem dos arquivos (atualizada em 01/10/2026):** a equipe de marca enviou `logo-principal`, `logo-vertical`, `logo-negativa-branca`, `logo-negativa-navy`, `logo-monocromatica-preta` e `icone`, guardados sem alteração em `src/design-system/brand/oficial/`. As demais versões do logotipo (`logo-horizontal`, `logo-wordmark`, `logo-monocromatica-azul` e `logo-escala-de-cinza`) são derivadas por `scripts/design-system/gerar-variacoes-da-marca.mjs`, só removendo elementos ou trocando a cor, e levam o aviso "Derivado de ...". O símbolo e o favicon são exatamente o `icone.svg`, sem versão reduzida (o teste `icones-pwa.test.ts` confere o favicon byte a byte). Os componentes usam `<img>`; o logotipo mantém as cores oficiais, isento do contraste de texto, e por isso o arquivo não passa pela regra de cores só dos tokens. Os SVG não podem ter script, imagem embutida nem referência externa (teste `logo.test.tsx`).

Regras: respeitar a área de proteção; largura mínima digital de 120 px (o componente recusa tamanho menor, em teste); fundos aprovados (branco, azul, navy e cinza-gelo). O catálogo mostra os usos incorretos: distorcer, alterar cores, girar, aplicar sombra e trocar a tipografia. O logotipo tem nome acessível "FluxID" quando é o único identificador e é decorativo (`alt` vazio) quando ao lado do nome em texto.

## Ícones (`src/design-system/icons/`)

Grade de 24 por 24 px, traço de 2 px (proporcional nos demais tamanhos, com 2 px efetivos a 16 px), terminais arredondados, área segura de 2 px.

| Grupo | Ícones |
|---|---|
| Rastreabilidade | localização, rota, histórico, geocerca, mapa, última leitura |
| Segurança | escudo, lacre, bloqueio, alerta, rompimento, verificado |
| Conectividade | antena, GPS, rede, nuvem, sincronizar, sem sinal |
| Ativos e logística | cilindro, sensor, caminhão, armazém, entrega, inventário |
| Sistema | dashboard, usuário, configurações, relatórios, filtros, notificações |

`<Icon name size state variant label />`: `size` 16, 24, 32 ou 48; `state` padrão, ativo, desabilitado ou erro; `variant` contorno, duotone, monocromática ou negativa. Sem `label`, o SVG é decorativo (`aria-hidden`, não focável). Com `label`, recebe `role="img"` e `aria-label`.

Cores por estado sobre fundo claro (todas com 3:1 ou mais): padrão grafite, ativo `#159B19`, desabilitado `#6B7F94`, erro `#B42318`. Na variante negativa, branco sobre fundo escuro.

## Ícones da PWA e favicon

`scripts/design-system/gerar-icones-pwa.mjs` rasteriza o símbolo para `public/icons/icon-192.png`, `icon-512.png` e `maskable-512.png` (com margem segura para máscara) e escreve `public/favicon.svg`. O símbolo de 16 px precisa permanecer distinguível; a aprovação visual é humana (MS-008).

## Terceiros

Nenhuma fonte, imagem, ícone, script ou folha de estilo vem de domínio de terceiros, e não há fotografia de banco de imagens. O teste `no-external-assets` (já existente) continua, e o teste de rede do navegador comprova zero requisições externas por tela (CA-004).
