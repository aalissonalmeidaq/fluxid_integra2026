# Guia de validação: Clientes, unidades, geocercas, veículos e motoristas

**Feature**: `007-clientes-geocercas-frota` | **Spec**: [spec.md](./spec.md)

Roteiro executável para provar a Spec 007 de ponta a ponta. Contratos em [contracts/](./contracts/) e modelo em [data-model.md](./data-model.md); este guia não repete esses detalhes.

## Pré-requisitos

- Node.js 24.21.0, `npm ci`, Docker em execução e Supabase CLI.
- Supabase local iniciado (`npx supabase start`) e banco recriado com as migrations novas (`npx supabase db reset`).
- Duas organizações de seed (Tenant A e Tenant B), cada uma com administrador, operador de estoque, operador técnico, auditor e um usuário com o papel `driver`; e-mails `@example.invalid`.
- Todos os documentos de teste são fictícios e gerados pelas próprias suítes. **Nunca use CPF, CNH ou CNPJ reais.**
- A consulta de CEP real (ViaCEP) **não** é usada no CI; localmente o provedor falso responde. Para ver o serviço real, aponte a função para o provedor real só na sua máquina e use um CEP público (por exemplo `01001-000`).

## 1. Automatizado

```bash
npm run lint
npm run typecheck
npm run test:coverage
npx supabase db reset && npx supabase test db
npm run test:live
npm run build
npm run test:e2e
```

Resultado esperado: tudo verde; pgTAP com os arquivos `007_*` aprovados; pacote de entrada ≤ 593,95 kB.

## 2. Roteiro manual guiado (celular e desktop)

Executado pela pessoa responsável na validação humana (T-final), em notebook e celular.

1. **Cliente e unidade com CEP**: como administrador do Tenant A, abra **Clientes → Cadastrar cliente** (abre em modal sobre a lista), cadastre um cliente pessoa jurídica (CNPJ fictício válido) e salve. Em **Acrescentar a primeira unidade** (também em modal), digite o CEP: o logradouro, o bairro, a cidade e a UF aparecem e o foco vai ao **Número**; complete número, complemento, responsável e janela de recebimento e salve.
1b. **Coordenadas pelo endereço**: na mesma unidade, preencha o número e acione **Buscar coordenadas pelo endereço**; confira o endereço encontrado, o ponto e a precisão, tente salvar sem marcar a confirmação (deve recusar) e depois marque **Confirmo que o endereço e o ponto estão corretos**; no detalhe, confira "Buscadas pelo endereço e confirmadas em" e "Ainda sem confirmação do motorista". Mude o número e confira que a confirmação cai. Repita com o serviço indisponível: informe as coordenadas à mão ou salve sem elas.
1c. **Mapas**: o formulário mostra o ponto no mapa depois da busca; o detalhe da unidade traz o mapa; na **Visão geral** o mapa ocupa 80% da largura, com as unidades dos clientes e a lista em texto, e os indicadores ficam empilhados à direita.
2. **Falhas do CEP**: repita com um CEP inexistente ("CEP não encontrado"), com o serviço desligado ("não foi possível buscar agora") e sem conexão; em todos, digite o endereço inteiro e salve. Passe do limite de 10 buscas em um minuto e confira o aviso com o tempo para tentar de novo.
3. **Geocerca**: na unidade, crie um **círculo** de 200 m com as coordenadas da unidade e um **polígono** de 4 vértices; veja a pré-visualização e a descrição em texto; use **Testar um ponto** com um ponto dentro e outro fora de cada um; tente um polígono que se cruza e confira a recusa; salve uma segunda geocerca sobreposta e confira o aviso.
4. **Veículo**: cadastre um veículo com placa antiga e outro com placa Mercosul; repita uma placa e confira o conflito; mude um veículo para **em manutenção** e depois **inativo** (com justificativa); confira a situação do licenciamento ("em dia", "a vencer", "vencido").
5. **Motorista e proteção de dados**: cadastre um motorista com CPF e CNH fictícios; confira que lista e detalhe mostram só os últimos dígitos; vincule um usuário com o papel `driver`; tente vincular um usuário sem o papel; **Revele** o CPF, confira o botão **Ocultar**, saia da tela e volte (deve estar mascarado).
6. **Auditor e operadores**: como auditor, confira que lê e vê o histórico, mas não vê o botão **Revelar** nem as ações de escrita; como operador de estoque, confira o acesso de leitura.
7. **Inativação em cascata**: inative o cliente (a tela informa quantas unidades e geocercas serão inativadas), confirme, e confira o histórico de cada item; reative o cliente e confirme que unidades e geocercas continuam inativas; reative uma unidade e uma geocerca, uma a uma.
8. **Isolamento**: como administrador do Tenant B, confirme que nada do Tenant A aparece em nenhuma lista, busca, "Testar um ponto" nem endereço direto.
9. **Responsividade e teclado**: percorra tudo em 360, 768 e 1920 px apenas com Tab, sem rolagem horizontal; confira foco visível e anúncios de resultado.
10. **Offline**: desligue a rede; a estrutura abre, as escritas e a busca de CEP ficam desabilitadas com o motivo.
11. **Anonimização**: com o administrador (sessão com MFA), tente anonimizar um motorista **ativo** (a ação pede para inativar antes); inative-o e anonimize: confira a lista do que será removido, o aviso de irreversível, a confirmação digitada e o resultado ("Motorista anonimizado", sem CPF, CNH, telefone nem vínculo); tente editar, reativar e revelar (devem ser recusados); cadastre de novo o mesmo CPF fictício (deve ser aceito como novo motorista); repita para um cliente pessoa física inativo e para um contato de cliente pessoa jurídica; procure o nome, o CPF e o telefone antigos na busca e no histórico (não devem aparecer); como auditor, confirme que a ação não existe.
12. **Modal**: abra qualquer cadastro e edição e confira que a lista ou o detalhe continua por trás, sem recarregar; feche com **Escape**, com **Cancelar** e com o **Voltar** do navegador; confira que o foco volta ao botão que abriu, que clicar fora não fecha, que o botão de salvar fica à vista num formulário longo e que, em 360 px, o modal cabe sem rolagem horizontal. Abra `/veiculos/novo` digitando o endereço e confira a lista por trás.

## 3. Evidências que entram em `validation.md`

- Contagem de testes por suíte e cobertura; resultado de `db reset` + `supabase test db`.
- Tamanho do pacote de entrada antes (579,54 kB) e depois.
- Desempenho com o volume de referência: busca e primeira página de cada lista, e a consulta "ponto dentro" (RNF-001 a RNF-003).
- Verificação de que CPF, CNH e CNPJ de pessoa física não aparecem em saída alguma (CA-005) e de que a chamada de saída do CEP só carrega o CEP (CA-006) e de que, depois de anonimizar, nenhum valor pessoal antigo é encontrado (CA-015).
- Resposta da validação humana por entrevista (quem, amostra, ambiente, duração, resultado, correções, decisão e confirmação), conforme o AGENTS.md.
