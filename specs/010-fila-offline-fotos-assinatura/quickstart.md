# Guia de validação: Fila offline, fotos e assinatura de entrega

**Feature**: `010-fila-offline-fotos-assinatura` | **Data**: 12/10/2026

Roteiro para a pessoa responsável conferir a spec ponta a ponta, depois de implementada. Contratos em [contracts/](./contracts/) e modelo em [data-model.md](./data-model.md). Foto, assinatura, perda de sinal e instalação **reais** só se validam em aparelho Android com Chrome; os testes automatizados cortam a rede e simulam a câmera e **não substituem** este roteiro.

## Preparação

1. `npx supabase stop`, `npx supabase start` e `npx supabase db reset` (função e migrations novas exigem parar e iniciar).
2. `npm ci`, `npm run build` e `npm run preview -- --port 4173 --host 127.0.0.1`.
3. Massa do roteiro: o comando de sementes da Spec 009 (`npm run campo:semear-roteiro`) cria as viagens A (4 cilindros, 2 paradas) e B (10 cilindros). Entre com `reg-g-admin@example.invalid` e a senha `Local-only-020!` (dado fictício do ambiente local).
4. **Para validar a instalação**: um endereço **HTTPS com certificado confiável** (homologação ou túnel HTTPS temporário apontando para a porta 4173). O endereço `localhost` por `adb reverse` e o `npm run dev:rede` **não** instalam o aplicativo no Android (diagnóstico da Spec 009).
5. Para o celular alcançar o Supabase local: `adb reverse tcp:54321 tcp:54321`, ou o repasse do Vite no `npm run dev:rede`.

## Roteiro

1. **Guardar a viagem (história 1)**: com conexão, abrir a viagem A e iniciar o carregamento. Esperado: a viagem fica disponível offline; nada mais a fazer.
2. **Conferir sem sinal**: ligar o modo avião (ou `adb reverse --remove tcp:54321`). Ler os 4 cilindros (câmera e NFC). Esperado: cada um aparece como "conferido, pendente de envio"; o indicador mostra "4 pendentes"; nada chega ao servidor.
3. **Fila sobrevive**: fechar e abrir o aplicativo (ou reiniciar o aparelho). Esperado: a contagem de pendentes continua.
4. **Exigir conexão**: tentar iniciar a viagem, cancelar, concluir e devolver offline. Esperado: ações desabilitadas com "Exige conexão"; nada é enfileirado.
5. **Código fora da viagem**: ler, offline, um cilindro de outra viagem. Esperado: "Não foi possível confirmar este código sem conexão."; nada é conferido.
6. **Desfazer pendente**: desfazer uma conferência ainda pendente. Esperado: sai da fila sem criar evento no servidor.
7. **Sincronizar (história 2)**: voltar a conexão com o aplicativo aberto. Esperado: envio automático, em ordem; o indicador some; o histórico da viagem mostra cada evento **uma vez**, com o método de leitura.
8. **Entrega offline e chegada**: com a viagem em andamento, ficar offline, registrar a chegada e a entrega da parada 1 (posição pelo GPS). Esperado: ambas pendentes, na ordem; a entrega só é enviada depois da chegada.
9. **Queda no meio do envio**: iniciar o envio e cortar a conexão no meio; religar. Esperado: o envio retoma, sem duplicar nenhuma operação.
10. **Conflito**: com operações pendentes da viagem B, cancelar a viagem B em outra sessão; voltar a conexão. Esperado: a operação fica como **conflito**, preservada, com o motivo "A viagem foi encerrada depois que você registrou isto."; as pendentes de outras viagens seguem.
11. **Decidir o conflito**: abrir o conflito e **Descartar** com justificativa. Esperado: exige conexão e justificativa; o histórico registra a decisão; o item sai do aparelho só depois da confirmação.
12. **Outra conta**: sair e entrar com outra conta no mesmo aparelho. Esperado: a fila da primeira conta **não** aparece; ao voltar com a conta original, a fila continua.
13. **Sair com pendências**: tentar sair com itens pendentes. Esperado: aviso com "Enviar antes de sair", "Sair mesmo assim" e "Continuar no aplicativo".
14. **Fotos (história 3)**: na entrega da parada 2, tirar 3 fotos (e tentar a quarta). Esperado: prévia, refazer e remover; a quarta é recusada com o motivo; registrar a entrega **offline**. Ao voltar a conexão, o registro chega primeiro e as fotos depois.
15. **Sem metadados**: baixar uma foto enviada (por quem tem `trip.read`) e conferir que não tem EXIF nem localização.
16. **Assinatura (história 4)**: assinar na entrega, limpar, assinar de novo e salvar; testar assinatura em branco. Esperado: em branco não é guardada; a entrega vale sem assinatura.
17. **Permissões dos anexos**: entrar com perfil sem `trip.recipient`. Esperado: vê "com assinatura" mas não a imagem; sem `trip.read`, não vê as fotos.
18. **Tenant B**: tentar abrir um anexo do Tenant A como Tenant B. Esperado: "não encontrado", igual ao inexistente.
19. **Instalar (história 5)**: abrir o endereço HTTPS no Chrome do Android, tocar em **Instalar App** (ou menu ⋮ → Instalar app) e abrir pelo ícone. Esperado: abre em tela cheia.
20. **App instalado offline**: com o aplicativo instalado, ligar o modo avião, abrir, conferir e registrar uma entrega, e voltar a conexão. Esperado: tudo se comporta como no navegador, com a fila.
21. **Acessibilidade**: repetir 2, 8 e 14 só com teclado em 360, 768 e 1920 px. Esperado: foco visível, estados anunciados, sem rolagem horizontal; foto e assinatura com alternativa.

## Verificações automáticas

`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npx supabase db reset` e `npx supabase test db` (reiniciar o Supabase antes), `npm run test:live`, `npm run build`, `npm run catalogo:build`, `npm run test:e2e` e `npm run test:visual:atualizar` (Linux). A medição de pacote de entrada compara com a linha de base da Spec 009. A rodada pode ser feita em qualquer horário: os testes pgTAP da Spec 008 passaram a usar a data de São Paulo (T073). Rode o pgTAP e o `npm run test:live` em momentos diferentes e faça `npx supabase db reset` entre eles.

## Métricas

| Métrica | Como medir | Meta |
|---|---|---|
| MS-001 | uma viagem de 4 cilindros e 2 paradas, toda offline, enviada ao voltar a conexão | sem erro e sem intervenção |
| MS-002 | 100 reenvios forçados com quedas aleatórias (teste automatizado) | 0 duplicada e 0 perdida |
| MS-003 | conflitos provocados (viagem cancelada, item já conferido, cilindro alterado) | 100% preservados e visíveis |
| MS-004 | entrega com 3 fotos e assinatura em 4G (`npm run test:desempenho:campo`, estendido) | até 60 s, registro antes dos anexos |
| MS-005 | RLS com dois tenants, contratos de privacidade | 0 anexo de outro tenant e 0 dado sensível em log |
| MS-006 | axe e capturas em 360, 768 e 1920 px | 0 violação crítica ou grave |
| MS-007 | instalação e abertura offline em Android real por HTTPS | confirmado por Natã Baracho |

## Resultado esperado

Todos os passos com o resultado descrito, as métricas medidas com tempo real em `validation.md` e a validação humana feita por Natã Baracho, com as respostas gravadas no registro de uso de IA. Pontos que só o aparelho real confirma: foto pela câmera, perda e retorno de sinal, instalação por HTTPS e abertura offline do aplicativo instalado.
