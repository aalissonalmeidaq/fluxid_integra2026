# Contrato: telas, rotas e componentes

**Atende**: RF-039 a RF-047, RF-062, RF-064, História 8 e História 9, CA-011 a CA-014

## Catálogo de telas (menu da Spec 004)

| id | Rótulo | Rota | Permissão | Ícone oficial |
|---|---|---|---|---|
| `clientes` | Clientes | `/clientes` | `customer.read` | `entrega` |
| `geocercas` | Geocercas | `/geocercas` | `geofence.read` | `geocerca` |
| `veiculos` | Veículos | `/veiculos` | `vehicle.read` | `caminhao` |
| `motoristas` | Motoristas | `/motoristas` | `driver.read` | `rota` |

Unidades não têm item de menu: aparecem no detalhe do cliente. Nenhuma regra de visibilidade existente muda (RF-039); os testes da Spec 004 permanecem.

## Rotas

Resolvidas por `src/app/registry/registry-routes.ts`, no padrão de `cylinder-routes.ts`; todas as telas são `React.lazy`.

| Rota | Tela | Permissão da ação |
|---|---|---|
| `/clientes` | Lista de clientes | `customer.read` |
| `/clientes/novo` | Cadastro de cliente | `customer.write` |
| `/clientes/<id>` | Detalhe do cliente (dados, contatos, unidades, histórico) | `customer.read` |
| `/clientes/<id>/editar` | Edição do cliente | `customer.write` |
| `/clientes/<id>/unidades/nova` | Cadastro de unidade (com busca de CEP) | `customer.write` |
| `/clientes/<id>/unidades/<siteId>` | Detalhe da unidade (endereço, recebimento, geocercas, histórico) | `customer.read` |
| `/clientes/<id>/unidades/<siteId>/editar` | Edição da unidade | `customer.write` |
| `/geocercas` | Lista de geocercas | `geofence.read` |
| `/geocercas/nova?unidade=<siteId>` | Cadastro de geocerca | `geofence.write` |
| `/geocercas/<id>` | Detalhe da geocerca (forma, "Testar um ponto", histórico) | `geofence.read` |
| `/geocercas/<id>/editar` | Edição da geocerca | `geofence.write` |
| `/veiculos`, `/veiculos/novo`, `/veiculos/<id>`, `/veiculos/<id>/editar` | Lista, cadastro, detalhe e edição | `vehicle.read` / `vehicle.write` |
| `/motoristas`, `/motoristas/novo`, `/motoristas/<id>`, `/motoristas/<id>/editar` | Lista, cadastro, detalhe e edição | `driver.read` / `driver.write` |

### Cadastro e edição em modal (RF-064)

As rotas de ação (`/novo`, `/nova` e `/editar`) abrem o **formulário em modal** sobre a tela de contexto, que continua montada por trás e fica inerte:

| Rota de ação | Tela por trás | Fechar volta para |
|---|---|---|
| `/clientes/novo` | Lista de clientes | de onde o modal foi aberto (ou `/clientes`) |
| `/clientes/<id>/editar` | Detalhe do cliente | de onde foi aberto (ou o detalhe) |
| `/clientes/<id>/unidades/nova` | Detalhe do cliente | de onde foi aberto (ou o detalhe do cliente) |
| `/clientes/<id>/unidades/<siteId>/editar` | Detalhe da unidade | de onde foi aberto (ou o detalhe da unidade) |
| `/geocercas/nova?unidade=<siteId>`, `/veiculos/novo`, `/motoristas/novo` | Lista da área | de onde foi aberto (ou a lista) |
| `/geocercas/<id>/editar`, `/veiculos/<id>/editar`, `/motoristas/<id>/editar` | Detalhe do cadastro | de onde foi aberto (ou o detalhe) |

- **Sem recarregar.** Os links "Cadastrar" e "Editar" seguem sendo âncoras (funcionam em nova aba); o clique simples abre o modal trocando só o endereço (`history.pushState`, em `src/app/registry/registry-navigation.ts`). O endereço continua valendo como link direto.
- **Fechar.** Escape, "Cancelar" e o botão Voltar do navegador fecham e devolvem o foco ao controle que abriu. Clicar fora **não** fecha.
- **Salvar.** O cadastro leva ao detalhe do que foi criado; a edição fecha o modal e a tela de trás é recarregada com os dados novos. Os erros ficam no modal, junto dos campos, com o foco no primeiro.
- **Estrutura.** Título do diálogo = título do formulário (um só `h2`); botão de salvar fixo ao pé do modal; largura `padrao` (960 px) e rolagem por dentro, sem rolagem horizontal de 320 a 1920 px.
- **Componentes.** `Dialog` ganhou a propriedade `size` (`compacto` ou `padrao`); `RegistryFormModal`, `FormHeader`, `FormCard`, `FormActions` e `FormCancel` ficam em `src/pages/registry/components/form-modal.tsx`. Fora do modal, o mesmo formulário continua funcionando como página inteira.

Abrir uma rota de ação sem permissão confirma as permissões no servidor antes de exibir o formulário, nega o acesso sem exibi-lo e não oferece a ação (História 1, cenário 7).

## Listas (RF-040)

- Tabela a partir de 768 px, com cabeçalhos associados; cartões abaixo disso. Total anunciado em região de status; paginação mantendo busca e filtros; filtro de situação padrão "ativos".
- Colunas e filtros por área:

| Área | Colunas | Filtros |
|---|---|---|
| Clientes | nome, documento (CNPJ completo ou CPF mascarado), segmento, cidades, situação | situação, segmento, UF, "tem geocerca" |
| Geocercas | nome, unidade, cliente, forma, situação | situação, forma, cliente |
| Veículos | placa, tipo, marca e modelo, capacidade, situação, licenciamento | situação, tipo, situação do licenciamento |
| Motoristas | nome, CPF mascarado, categoria, validade da CNH e situação da CNH, situação, usuário vinculado | situação, situação da CNH, vinculado |

## Formulários (RF-041)

- Seções no mesmo formulário (em modal, RF-064), **um único envio**, erros junto dos campos, foco no primeiro erro, rótulos visíveis.
- **Cliente**: tipo de pessoa (troca a máscara do documento), documento, nome, nome fantasia, segmento (com detalhe quando "outro"), contatos (acrescentar e remover, um principal), observações. Na edição, o documento aparece mascarado e só muda se a pessoa digitar um novo valor com justificativa.
- **Unidade**: campo CEP com botão "Buscar CEP" (também ao sair do campo com 8 dígitos); estados `buscando`, `encontrado` (foco em "Número"), `não encontrado`, `indisponível`, `limite atingido` (com o tempo para tentar de novo) e `sem conexão`; os campos de endereço continuam editáveis e o preenchimento nunca apaga número, complemento ou o que a pessoa já digitou. Janela de recebimento: dias marcados (grupo de caixas de seleção) e uma faixa de horário.
- **Geocerca**: forma (círculo ou polígono); círculo com centro e raio e o atalho "usar as coordenadas da unidade"; polígono com lista de vértices (acrescentar e remover só com teclado, cada vértice com rótulo e erro próprios); pré-visualização esquemática em SVG com alternativa em texto (forma, tamanho e vértices); aviso de sobreposição após salvar, com o nome da outra geocerca.
- **Veículo**: placa (normaliza ao sair do campo), tipo, marca, modelo, ano, capacidade em cilindros, carga máxima, vencimento do licenciamento.
- **Motorista**: nome, CPF, CNH (número, categoria, validade), telefone, vínculo opcional (escolha entre usuários vinculáveis).

## Detalhe e ações

- Situação cadastral, situação do documento e (veículo) situação operacional com **texto e ícone**, nunca só cor.
- **Documentos**: CPF e CNH mascarados; botão "Revelar" só para quem tem `*.document`; ao revelar, o valor aparece com botão "Ocultar", é anunciado a leitores de tela e some ao ocultar, sair da tela, trocar de organização, recarregar ou perder a sessão.
- **Inativar e reativar**: diálogo acessível com justificativa; ao inativar cliente ou unidade, mostra a quantidade de unidades e geocercas que serão inativadas (da prévia) e devolve o foco ao acionador; `CASCADE_CHANGED` reabre o diálogo com os números novos.
- **Anonimizar dados pessoais**: botão "Anonimizar dados pessoais" nos detalhes de motorista, cliente pessoa física e (em cada contato) de cliente, só para quem tem `driver.anonymize` ou `customer.anonymize`; para motorista e cliente pessoa física a ação fica desabilitada com o motivo "inative antes" enquanto o registro está ativo. O diálogo (`anonymize-dialog`) lista **o que será removido** e **o que permanece**, avisa que é **irreversível**, pede motivo, justificativa e a confirmação digitada (palavra ANONIMIZAR), trata `MFA_REQUIRED` com a orientação de confirmar o segundo fator, devolve o foco ao acionador e, ao concluir, mostra o aviso "Dados pessoais anonimizados em <data>", troca o nome por "Motorista anonimizado", "Cliente anonimizado" ou "Contato anonimizado" e desabilita editar, reativar, vincular e revelar.
- **Histórico**: lista paginada com filtro por tipo e período, ordem estável, edições com campos e valores não sensíveis e, para os sensíveis, só "alterado".

## Estados e anúncios

- Carregamento, vazio, erro e offline com os componentes da Spec 003. Sem conexão, escritas e busca de CEP ficam desabilitadas com o motivo; nada é enfileirado.
- Resultado de busca de CEP, salvamento e erro anunciados uma vez em `role="status"`, sem mover o foco, exceto o foco em "Número" após preenchimento bem-sucedido.
- Perda de conexão no meio do envio mostra "estado desconhecido" e permite repetir; a unicidade de documento e placa impede duplicata.

## Componentes novos (pasta `src/pages/registry/components/`)

`document-field` (máscara e validação), `postal-code-field`, `status-badge` (cadastral, documento e veículo), `reveal-document`, `contact-list-editor`, `receiving-window-field`, `geofence-shape-editor`, `geofence-preview` (SVG), `point-tester`, `cascade-confirm-dialog`, `anonymize-dialog`, `registry-history`. Reaproveitam `reason-dialog` e `history-list` da Spec 006 quando o formato permitir.

## Restrições visuais

Somente tokens, componentes, ícones, fonte e logotipo da Spec 003 e o padrão da Spec 005 (conteúdo em largura total, barra superior, menu em gaveta no celular). Nenhum valor arbitrário de Tailwind, cor literal ou transição que atrase o anel de foco (`tests/contract/escalas-no-codigo.test.ts` reprova). Movimento respeita `prefers-reduced-motion`. A skill `ui-ux-pro-max` orienta cada tela.
