# Contrato: telas e fluxos

**Atende**: RF-001 a RF-015, RF-020 a RF-023, RNF-001 a RNF-003, CA-003, CA-005 a CA-007

Padrão visual da Spec 005 (tokens, componentes, ícones e Montserrat da Spec 003); nenhum valor arbitrário de Tailwind, cor literal ou transição que atrase o anel de foco. O movimento respeita `prefers-reduced-motion` (a janela de leitura não anima). Todas as telas funcionam de 360 px a desktop amplo, sem rolagem horizontal, com zoom de 200%.

## Janela de leitura (`identifier-reader-dialog`)

- Abre como diálogo modal; em 360 px ocupa a tela toda, com o vídeo contido e o botão de fechar sempre visível. Foco preso dentro; Escape fecha e devolve o foco ao botão que abriu.
- Dois modos, mostrados só quando há suporte: **Câmera** (QR Code e Data Matrix) e **NFC**. Sem nenhum dos dois, o botão de leitura **não aparece** e a própria tela de origem mostra o texto "Leitura por câmera ou NFC indisponível neste aparelho. Digite o código ou use um leitor." (nunca um botão desabilitado sem explicação).
- Modo contínuo: cada leitura aceita ou recusada aparece em texto numa região anunciada a leitores de tela (`role="status"`), com o último resultado e a contagem ("3 de 10 conferidos"). A janela continua aberta até a pessoa fechar.
- A mesma leitura em sequência curta conta uma vez. O resultado aparece em até 1 s depois do código reconhecido.
- O resultado nunca depende só de cor, som ou vibração; a spec não exige som nem vibração.

| Estado | Exibição |
|---|---|
| `opening` | `Loading` do design system; pede a permissão do navegador quando necessário |
| `reading` | vídeo ou aviso "Aproxime a etiqueta"; resultado anunciado |
| `unsupported` | texto explicando o motivo e o caminho manual |
| `denied` | "A permissão da câmera foi negada", com o passo para liberar e o caminho manual |
| `error` | câmera ocupada ou falha; "Tentar de novo" e o caminho manual |
| `paused` | após 2 minutos sem leitura: câmera e NFC desligados, aviso em texto na região `status` e a ação "Continuar lendo"; a janela e os resultados continuam |
| offline | "Sem conexão. Registrar exige conexão."; a leitura abre, mas confirmar fica desabilitado com o motivo |

## Mensagens por resultado da resolução

| Resultado | Texto na tela |
|---|---|
| Cilindro da viagem, previsto | "Cilindro 12345 conferido." |
| Já conferido | "Cilindro 12345 já estava conferido." (sem evento novo) |
| Da organização, fora da viagem | "Cilindro 12345 não pertence a esta viagem." e, com `trip.read`, "Está reservado na viagem n.º 7." |
| Não previsto nesta parada (entrega) | "Cilindro 12345 não está previsto nesta parada." |
| Não encontrado (inclui outra organização) | "Cilindro não encontrado." e, para NFC, a dica "Confira o formato do valor cadastrado." |
| Identificador desativado | "Este identificador foi desativado." e o cilindro a que valia |
| Cilindro inativo | "Cilindro inativo." (Spec 006) |
| Etiqueta ilegível ou sem número de série utilizável | "Não foi possível ler a etiqueta. Digite o código ou tente outra." |
| Mais de um código no quadro da câmera | "Há mais de um código no quadro. Aponte para um só." (nenhuma leitura é aceita naquele quadro e a janela segue lendo) |

## Conferência de carga (`loading-panel`)

- Botão "Ler cilindro" ao lado da lista; cada leitura aceita chama `check_item` com `source` (`camera`, `nfc` ou `typed`) e atualiza a lista e a contagem.
- Conferir e desfazer por toque seguem iguais; o histórico mostra o método em texto ("conferido por câmera").

## Entrega (`delivery-dialog`)

- A leitura marca "entregue" o cilindro previsto na parada, com o método por cilindro; "não entregue" e a justificativa continuam manuais.
- A entrega só vale ao salvar, uma vez, como na Spec 008. A leitura de cilindro não previsto na parada é recusada.

## Posição (`position-field`), na chegada e na entrega

- Botão "Usar minha posição". Uma leitura por toque, com limite de 15 s e indicador de carregamento; nunca observa a posição em segundo plano.
- Mostra latitude, longitude, precisão e hora da leitura. Com geocerca ativa mostra a distância e "dentro" ou "fora da geocerca" (fora é aceito e destacado). Precisão pior que 100 m: aviso em texto, sem bloquear.
- A **chegada** não oferece "no endereço da unidade"; essa alternativa existe só na entrega.
- Coordenadas já digitadas: pede confirmação antes de substituir; ao aceitar, origem "GPS"; se a pessoa editar o número à mão depois, a origem muda para "informada".
- Posição lida há mais de 2 minutos é descartada ao salvar e lida de novo, com aviso.
- Permissão negada, tempo esgotado ou posição indisponível: texto do motivo, "Tentar de novo" e as alternativas (as coordenadas digitadas e, só na entrega, "no endereço da unidade"), sem perder os outros campos.
- Nada é guardado no aparelho; sair da tela sem salvar descarta a posição.

## Botão "Ler cilindro" (`read-cylinder-button`)

Na lista e no detalhe de cilindros e no cabeçalho das viagens, para quem tem `cylinder.read` (inclusive o auditor). Abre o leitor e, ao ler um identificador ativo, navega ao detalhe do cilindro. Quem só pode ver cilindros não recebe nenhuma ação de escrita.

## Acessibilidade

- Teclado: abrir, fechar, escolher o modo, repetir e usar as alternativas manuais sem mouse.
- Resultado e erro anunciados em uma região `status` por tela; o foco nunca é roubado ao receber um resultado.
- Alvos de 44 por 44 px, foco visível de 3:1 ou mais, contraste AA e texto que quebra sem estourar a largura.
- Sem armadilha de foco quando o navegador pede permissão; o retorno do pedido devolve o foco ao botão.

## Capturas visuais (Linux)

Janela de leitura (aberta, sem suporte, permissão negada), bloco de posição (vazio, lida, precisão ruim, fora da geocerca, erro) e "Ler cilindro", em 360, 768 e 1920 px.
