# Contrato: telas e rotas

**Atende**: RF-026 a RF-028, CA-008, histórias 6 e 7

Padrão visual da Spec 005 (conteúdo em toda a largura, menu lateral a partir de 768 px, gaveta abaixo disso), só tokens e componentes do design system, ícones da Spec 003 e Montserrat. Uma entrada nova no menu: **Viagens**, visível só a quem tem `trip.read`.

## Rotas (4)

| Rota | Tela | Permissão para abrir |
|---|---|---|
| `/viagens` | Lista de viagens | `trip.read` |
| `/viagens/nova` | Planejar viagem (modal sobre a lista) | `trip.write` |
| `/viagens/:id` | Detalhe da viagem | `trip.read` |
| `/viagens/:id/editar` | Editar viagem (modal sobre o detalhe) | `trip.write` |

O endereço do modal continua valendo como link direto. Abrir sem permissão mostra "Sem permissão" depois da consulta de permissões ao servidor, antes de exibir o formulário. Id de outra organização mostra "Viagem não encontrada".

## Lista

- Tabela a partir de 768 px (número, data, situação, veículo, motorista, paradas, cilindros, divergências) e cartões abaixo; filtro padrão "abertas".
- Busca, filtros (situação, período, veículo, motorista, cliente), ordenação, paginação e total anunciado em região de status.
- Estados: carregando, vazio ("Nenhuma viagem ainda", com a ação "Planejar viagem" para quem pode), erro com "Tentar de novo" e offline.

## Planejar e editar

- Cabeçalho: data, veículo, motorista, observações; avisos de CNH e de licenciamento.
- Paradas: adicionar unidade (busca por cliente e unidade), reordenar com botões de subir e descer (e arrastar como complemento, nunca como único meio), remover.
- Cilindros por parada: busca paginada de elegíveis com seleção por teclado, contador "x de capacidade" e mensagem em texto quando um cilindro é recusado (reservado em qual viagem, teste vencido).
- Resumo fixo: paradas, cilindros, capacidade e avisos.

## Detalhe

- Cabeçalho com número, situação, data, veículo, motorista e as ações permitidas pela situação (iniciar carregamento, iniciar viagem, concluir, cancelar, editar).
- Aba **Paradas e carga**: cada parada com situação, unidade, cilindros e as situações independentes de cada item (item, bloqueio e custódia, com texto e ícone, nunca só cor).
- Painel **Conferência** (viagem em carregamento): lista com "Conferir" e "Desfazer" por cilindro, contador "x de y conferidos" anunciado, e "Retirar da viagem" (exceção, com justificativa).
- Diálogo **Registrar entrega** por parada: resultado de cada cilindro, nome e função do recebedor, horário, posição opcional, aviso de posição fora da geocerca e justificativa por cilindro não entregue.
- Ação **Registrar desbloqueio** por item (diálogo; o excepcional pede o segundo fator e a justificativa) com o aviso de que é registro lógico e de que a trava será comandada na Fase 6.
- Ação **Retornar ao estoque** por item em trânsito, com justificativa.
- Aba **Histórico**: eventos ordenados, filtro por tipo e período, sem dado pessoal.
- Links para veículo, motorista, cliente, unidade e cilindro, e o inverso: detalhes de cilindro e de unidade mostram "Viagens" com link.

## Acessibilidade e responsividade

- 360, 768 e 1920 px sem rolagem horizontal; foco visível e ordem lógica; diálogos com foco preso, Escape fecha e o foco volta ao disparador.
- Todo resultado de ação (conferido, entregue, recusado) vai a uma região `role="status"`; no máximo uma por tela.
- Erros em texto junto do campo; nenhuma informação só por cor.
- Sem conexão: estrutura visível, ações de escrita desabilitadas com o motivo e nada guardado no aparelho (a fila é da Fase 5).
- Movimento respeita `prefers-reduced-motion`; nenhum valor arbitrário de Tailwind nem cor literal (o teste `escalas-no-codigo` reprova).
