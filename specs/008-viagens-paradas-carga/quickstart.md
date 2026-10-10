# Guia de validação: Viagens, paradas, carga e entrega

**Feature**: `008-viagens-paradas-carga` | **Data**: 08/10/2026

Roteiro para a pessoa responsável conferir a spec ponta a ponta, depois de implementada. Contratos em [contracts/](./contracts/) e modelo em [data-model.md](./data-model.md).

## Preparação

1. `npx supabase db reset` e `npx supabase start` (funções novas exigem parar e iniciar).
2. `npm ci`, `npm run build` e `npm run preview` (ou `npm run dev`), e abrir o app.
3. Entrar como administrador do Tenant A; ter, no Tenant A, dois clientes pessoa jurídica com unidades, um veículo disponível com capacidade para 6 cilindros, um motorista ativo com CNH em dia e 8 cilindros ativos, em estoque, com teste em dia. Cadastrar, no Tenant B, um cliente e um cilindro para o teste de isolamento.

## Roteiro

1. **Planejar (história 1)**: em Viagens, "Planejar viagem". Escolher data, veículo, motorista; duas paradas (uma em cada cliente) e 2 cilindros por parada. Conferir o resumo e salvar. Esperado: viagem "planejada" com número 1, quatro cilindros reservados, evento no histórico.
2. **Recusas**: tentar incluir um cilindro já reservado (a tela diz em qual viagem), um cilindro com teste vencido ou reprovado, mais cilindros que a capacidade e um veículo em manutenção (nem aparece). Esperado: cada recusa com o motivo em texto, nada gravado.
3. **Editar**: reordenar as paradas, trocar um cilindro, salvar; abrir a edição em duas abas e gravar nas duas. Esperado: eventos com valores anteriores e novos; a segunda gravação recusada pela versão.
4. **Carregar (história 2)**: "Iniciar carregamento", conferir três dos quatro cilindros e tentar iniciar a viagem. Esperado: recusado, a tela lista o cilindro que falta.
5. **Retirar e conferir**: retirar o quarto cilindro com justificativa (exceção) ou conferi-lo; iniciar a viagem. Esperado: viagem "em andamento", cilindros "em trânsito", "bloqueado (lógico)" e fora do estoque, com evento no histórico de cada cilindro.
6. **Entregar (história 3)**: na parada 1, "Registrar chegada" e "Registrar entrega" com os dois cilindros, nome e função do recebedor, horário e uma posição. Esperado: parada "entregue", cilindros "no cliente"; posição fora da geocerca, se houver, destacada.
7. **Divergir**: na parada 2, marcar um cilindro como não entregue, com justificativa. Esperado: parada "com divergência", cilindro "não entregue" ainda em trânsito.
8. **Desbloquear (história 4)**: registrar o desbloqueio de um cilindro entregue; tentar desbloquear o não entregue. Esperado: o primeiro funciona e a entrega não muda; o segundo pede segundo fator, exceção e justificativa.
9. **Encerrar (história 5)**: tentar concluir com a divergência sem decisão (recusado); retornar o cilindro ao estoque com justificativa e concluir. Esperado: viagem "concluída", cilindro em estoque, e viagem concluída sem edição.
10. **Cancelar**: planejar uma segunda viagem e cancelá-la com justificativa. Esperado: reservas liberadas, cilindros disponíveis de novo.
11. **Consultar (história 6)**: filtrar por situação e período; abrir o histórico; abrir o detalhe de um cilindro e de uma unidade e ver "Viagens". Entrar como auditor: vê tudo, sem ação de escrita e sem o nome do recebedor.
12. **Isolamento**: como administrador do Tenant B, abrir `/viagens/<id do Tenant A>`. Esperado: "Viagem não encontrada".
13. **Acessibilidade (história 7)**: repetir os passos 1, 4 e 6 só com teclado em 360, 768 e 1920 px; ligar o modo offline. Esperado: sem rolagem horizontal, foco visível, resultados anunciados, escrita desabilitada com o motivo.

## Verificações automáticas

`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run test:e2e` e `npm run test:visual:atualizar` (Linux). Medição de desempenho em 4G: `node scripts/viagens/medir-desempenho-4g.mjs`.

## Resultado esperado

Todos os passos com o resultado descrito, métricas MS-001 a MS-008 medidas e registradas com tempo real em `validation.md`, e a validação humana feita por Natã Baracho, com as respostas gravadas no registro de uso de IA.
