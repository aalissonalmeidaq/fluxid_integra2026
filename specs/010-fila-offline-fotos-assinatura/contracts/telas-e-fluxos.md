# Contrato: telas, textos e estados

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Padrão visual da Spec 005 (tokens, componentes, ícones, Montserrat), skill `ui-ux-pro-max`, WCAG 2.2 AA, de 360 px a desktop amplo, sem rolagem horizontal, movimento reduzido respeitado. **Nenhuma entrada nova no menu.**

## 1. Indicador na barra superior

Discreto, ao lado do estado de conexão, sem ocupar o corpo. É um botão que abre a tela Sincronização.

| Situação | Texto |
|---|---|
| nada pendente | oculto |
| pendentes | "3 pendentes" |
| enviando | "Enviando 2 de 5…" |
| conflito | "1 conflito" (destaque de atenção, com ícone e texto) |
| item antigo sem confirmação (24 h) | "3 pendentes, 1 há mais de 24 h" |
| sem conexão com pendentes | "Sem conexão, 3 pendentes" |

O texto é anunciado numa região `status` quando muda (sem repetir a cada tick). O botão tem nome acessível completo ("Abrir sincronização: 3 pendentes").

## 2. Tela Sincronização (`/sincronizacao`)

- Lista por viagem, com cada item em texto: operação ("Conferência do cilindro 12345", "Chegada à parada 2", "Entrega da parada 2"), hora do aparelho, estado (pendente, enviando, enviado, conflito, falhou) e, nos anexos, "2 fotos e assinatura pendentes".
- Ações: **Enviar agora** (desabilitada sem conexão, com o motivo), **Tentar de novo** nos itens com falha, **Ver conflito** nos conflitos.
- Estados da tela: carregando, vazio ("Nada pendente. Tudo foi enviado."), erro, sem conexão e sincronizando.
- Aviso de espaço quando passar de 80% do limite e de armazenamento não persistente.
- Acessível por teclado; lista com nomes completos; foco visível; ordem de leitura lógica.

## 3. Conflito

Abre em painel (modal no celular, lateral a partir de 768 px), com foco preso e Escape que devolve o foco.

| Bloco | Conteúdo |
|---|---|
| O que você fez | descrição da operação e a hora do aparelho (sem coordenadas nem nome do recebedor; "posição informada" e "recebedor informado" em texto) |
| O que aconteceu | motivo em texto simples |
| Estado atual | situação da viagem e do cilindro no servidor |
| Decisões | **Descartar** (pede a justificativa de 5 a 500 caracteres; exige conexão) e **Reenviar** (quando a causa foi corrigida) |

Textos dos motivos:

| Código | Texto |
|---|---|
| `TRIP_CLOSED` | "A viagem foi encerrada depois que você registrou isto." |
| `INVALID_TRANSITION` | "A situação mudou e o servidor não aceita mais esta operação." |
| `STOP_CLOSED` | "A parada já foi encerrada." |
| `NOT_FOUND` | "Este item saiu da viagem ou da parada." |
| `VERSION_CONFLICT` | "A viagem foi alterada por outra pessoa." |
| `MISSING_DEPENDENCY` | "Depende de um registro que foi descartado." |
| `STALE_OFFLINE_OPERATION` | "Registro com mais de 7 dias de atraso. Peça a uma pessoa autorizada para decidir." |
| `VALIDATION_FAILED` | "O servidor recusou este registro. Veja o motivo." |

## 4. Registrar offline (conferência, chegada e entrega)

- Barra de aviso em texto quando offline: "Sem conexão. O que você registrar fica neste aparelho e será enviado quando houver conexão." O texto nunca promete envio em segundo plano.
- Ao registrar, o item aparece como "pendente" (não como "feito"), por exemplo "Conferido, pendente de envio".
- Ações que exigem conexão ficam desabilitadas com o motivo "Exige conexão": iniciar viagem, cancelar, concluir, desbloquear, devolver, corrigir entrega, consulta geral de cilindros.
- Leitura offline de código que não é da viagem guardada: "Não foi possível confirmar este código sem conexão." (nada é conferido).
- Sair da conta com pendências: caixa de aviso "Há 3 operações que ainda não foram enviadas. Sair não as apaga, mas elas só serão enviadas quando você entrar de novo com esta conta." com **Enviar antes de sair** (quando há conexão), **Sair mesmo assim** e **Continuar no aplicativo**.

## 5. Fotos na entrega

- Bloco "Fotos da entrega (opcional)" abaixo do recebedor, com **Tirar foto** (até 3), contador "1 de 3" e nenhuma exigência.
- Cada foto: miniatura com texto alternativo ("Foto 1 da entrega"), **Refazer** e **Remover**, enquanto a entrega não é salva.
- Estados: sem câmera ("Câmera indisponível neste aparelho. A entrega pode ser registrada sem foto."), permissão negada (texto do motivo e como liberar), imagem inválida, limite de 3 atingido (botão desabilitado com o motivo) e sem espaço ("Sem espaço para novas fotos. A entrega será registrada sem elas.").
- Nenhuma pré-visualização guarda a imagem fora do aparelho; ao sair da tela sem salvar, as fotos não salvas são descartadas depois de uma confirmação.
- Depois de salvar: "Entrega registrada. As fotos serão enviadas em seguida."

- **Acrescentar depois**: na entrega já registrada, o botão **Acrescentar foto ou assinatura** aparece enquanto a viagem está em andamento ou concluída há até 7 dias e há vaga (até 3 fotos e 1 assinatura); fora disso o botão não aparece. O anexo acrescentado depois aparece no histórico como "acrescentado depois".

## 6. Assinatura na entrega

- Bloco "Assinatura de quem recebeu (opcional)" com área de desenho, **Limpar** e uma explicação de que a entrega vale sem assinatura.
- Estados: vazia, com traço, "Assine dentro da área", e o texto alternativo "Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura."
- Assinatura em branco não é guardada; o botão de salvar não depende dela.
- Operável com toque, caneta e mouse; a alternativa de teclado é **não** assinar.

## 7. Detalhe da viagem (quem pode ver)

- Cada entrega mostra "2 fotos" e "com assinatura" para quem tem `trip.read` (contagem apenas); as miniaturas das fotos para quem tem `trip.read` e a assinatura para quem tem `trip.recipient`, por URL assinada de vida curta.
- Quem não tem permissão não vê miniaturas, assinatura nem o link.
- Histórico: "Fotos anexadas à entrega (2)" e "Assinatura anexada", sem nome de arquivo nem caminho.

## 8. Instalação e app instalado

- Botão "Instalar App" (já existente) e o estado "instalado" em texto; a tela não insiste depois de recusada.
- No app instalado e offline: a estrutura abre, a viagem guardada abre, a fila fica visível e o indicador mostra as pendências.

## 9. Acessibilidade

- Contraste, foco visível, ordem de Tab lógica, nomes acessíveis, regiões `status` para mudanças de estado, nenhum estado só por cor.
- Foto e assinatura têm alternativa (opcionais).
- Axe sem violação crítica ou grave em 360, 768 e 1920 px; sem rolagem horizontal; zoom de 200%; paisagem; `prefers-reduced-motion` sem animação.
