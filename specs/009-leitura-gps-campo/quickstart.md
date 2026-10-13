# Guia de validação: Leitura de identificadores e GPS no aplicativo de campo

**Feature**: `009-leitura-gps-campo` | **Data**: 12/10/2026

Roteiro para a pessoa responsável conferir a spec ponta a ponta, depois de implementada. Contratos em [contracts/](./contracts/) e modelo em [data-model.md](./data-model.md). Câmera, NFC e GPS **reais** só se validam em aparelho Android com Chrome; os testes automatizados usam leituras e posições simuladas e **não substituem** este roteiro.

## Preparação

1. `npx supabase db reset` e `npx supabase start` (funções novas exigem parar e iniciar).
2. `npm ci`, `npm run build` e `npm run preview` (ou `npm run dev`).
3. O app precisa abrir em contexto seguro no celular (HTTPS ou localhost com túnel); câmera, NFC e GPS não funcionam em HTTP comum.
4. Entrar como administrador do Tenant A. Ter uma viagem **planejada** com 2 paradas e 4 cilindros (Spec 008), os 4 cilindros com QR Code ou Data Matrix impresso ou na tela, e **ao menos 2 deles com etiqueta NFC** cadastrada com o **número de série em hexadecimal**. Para medir MS-001 (conferência de dez cilindros), ter também uma segunda viagem **planejada** com **10 cilindros**, o que exige um veículo com capacidade de **pelo menos 10 cilindros** (a Spec 008 usava um de capacidade 6).
5. Ter no Tenant B um cilindro com identificador para o teste de isolamento.

## Roteiro

1. **Conferir lendo (história 1)**: iniciar o carregamento e abrir "Ler cilindro". Ler os 4 cilindros seguidos (câmera para dois, NFC para dois). Esperado: cada um conferido na hora, contagem "4 de 4", histórico com o método ("câmera" ou "NFC").
2. **Recusas**: ler um cilindro de outra viagem, um já conferido, o código do cilindro do Tenant B e um código inexistente. Esperado: cada recusa com o texto do contrato; o do Tenant B igual ao inexistente ("Cilindro não encontrado."); só quem tem `trip.read` vê a viagem do cilindro de outra viagem.
3. **Desfazer e repetir**: desfazer uma conferência e ler de novo. Esperado: volta a "conferido"; duas leituras seguidas do mesmo código contam uma.
4. **Iniciar e chegar com GPS (história 2)**: iniciar a viagem; na parada 1, "Registrar chegada" e "Usar minha posição", permitindo a localização. Esperado: latitude, longitude, precisão e hora; "dentro" ou "fora da geocerca" se houver geocerca.
5. **Entregar lendo**: "Registrar entrega" na parada 1, ler os cilindros previstos (marcam "entregue"), informar o recebedor, usar a posição do GPS e salvar. Esperado: parada "entregue", método por cilindro e origem "GPS" com a precisão no histórico, sem coordenadas na auditoria.
6. **Precisão ruim e posição velha**: forçar precisão pior que 100 m (ambiente fechado) e salvar; esperar mais de 2 minutos com a posição lida e salvar. Esperado: aviso em texto e registro permitido; a posição velha é lida de novo.
7. **Permissão negada**: negar a localização e tentar. Esperado: texto do motivo, "Tentar de novo" e as alternativas (as coordenadas digitadas e, só na entrega, "no endereço da unidade") completas, sem perder os outros campos.
8. **Coordenadas digitadas**: digitar coordenadas e tocar em "Usar minha posição". Esperado: pede confirmação; ao aceitar, origem "GPS"; editar o número depois muda para "informada".
9. **Sem suporte**: abrir o app num navegador sem câmera ou NFC (desktop). Esperado: o botão de leitura não aparece, o texto explica e a conferência manual, a digitação e o leitor-teclado seguem completos.
10. **NFC fora do formato**: ler uma etiqueta cujo valor foi cadastrado em outro formato (decimal). Esperado: "não encontrado" com a dica de formato.
11. **Consultar (história 3)**: em "Cilindros", "Ler cilindro" e ler um identificador ativo, um desativado e o de um cilindro inativo. Esperado: abre o detalhe, informa o desativado e o inativo. Entrar como auditor: a consulta funciona e nenhuma ação de escrita aparece.
12. **Acessibilidade e offline (história 4)**: repetir os passos 1, 4 e 5 só com teclado em 360, 768 e 1920 px; ligar o Offline do DevTools. Esperado: foco preso na janela, resultado anunciado, sem rolagem horizontal, confirmar desabilitado offline com o motivo.
13. **Leitor parado (história 4)**: abrir a janela de leitura e não ler nada por 2 minutos. Esperado: a câmera e o NFC desligam, a tela avisa em texto "Continuar lendo" e a janela e os resultados já lidos continuam; ao tocar em "Continuar lendo", a leitura volta.

## Verificações automáticas

`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npx supabase db reset` e `npx supabase test db`, `npm run test:live`, `npm run build`, `npm run test:e2e` e `npm run test:visual:atualizar` (Linux). A medição de pacote de entrada compara com a linha de base da Spec 008.

## Métricas

| Métrica | Como medir | Meta |
|---|---|---|
| MS-001 | cronometrar a leitura de dez cilindros | até 3 min |
| MS-002 | cronometrar chegada e entrega completas com GPS | até 90 s |
| MS-007 | uma pessoa nova consulta um cilindro lendo o código | até 20 s |
| MS-003 a MS-006 | testes automatizados e roteiro acima | conforme a spec |

## Resultado esperado

Todos os passos com o resultado descrito, as métricas medidas com tempo real em `validation.md` e a validação humana feita por Natã Baracho, com as respostas gravadas no registro de uso de IA. Pontos que só o aparelho real confirma: leitura por câmera e NFC, precisão do GPS, formato dos valores NFC já cadastrados e a validade dos limites de 2 minutos, 15 segundos e 100 metros.
