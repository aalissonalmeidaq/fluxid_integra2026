# Contrato: telas, rotas e comportamento de interface

**Atende**: RF-027 a RF-037, CA-006, CA-007, CA-009

Preserva as decisões da Spec 005 (conteúdo em largura disponível, estado de conexão na barra superior, menu em gaveta no celular e fixo a partir de 768 px, um só `h1` no logotipo e `h2` por tela). Só tokens, componentes, ícones e fonte da Spec 003; sem valor arbitrário (`escalas-no-codigo.test.ts`). Movimento respeita `prefers-reduced-motion`.

## Rotas

| Caminho | Tela | Carregamento |
|---|---|---|
| `/cilindros` | Lista | `React.lazy` |
| `/cilindros/novo` | Cadastro | `React.lazy` |
| `/cilindros/<id>` | Detalhe (dados, identificadores, testes, histórico) | `React.lazy` |
| `/cilindros/<id>/editar` | Edição (mesmo formulário do cadastro) | mesmo chunk do cadastro |
| `/estoque/entrada` | Entrada no estoque | `React.lazy` |

`<id>` inválido (não é UUID) → estado de erro "não encontrado", sem chamar o servidor.

## Lista (RF-028, história 2)

- Filtro cadastral padrão "Ativos" (opções: Ativos, Inativos, Todos); a busca respeita o filtro escolhido.
- Busca (identificador completo ou parte do número de série), filtros (cadastral, situação do teste, estoque, tipo), ordenação e paginação por cursor mantendo busca e filtros; total anunciado em `role="status"`.
- ≥ 768 px: tabela com cabeçalhos associados; < 768 px: cartões. Sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- Cada linha/cartão mostra três selos separados com ícone e texto: **cadastral** (Ativo/Inativo), **estoque** (Em estoque/Fora do estoque) e **teste** (Em dia/A vencer/Vencido/Reprovado/Sem teste). Aviso "Sem identificador" quando não há identificador ativo.
- Estados: carregando, vazio (com "Cadastrar cilindro" só a quem tem `cylinder.write`), erro com "Tentar de novo", offline (consulta indisponível sem rede; estrutura abre).
- Mostra só dados reais da organização ativa; trocar a organização recarrega a tela sem resquício da anterior.

## Cadastro e edição (RF-001, RF-004, RF-030)

- Antes de exibir o formulário, a rota confirma `cylinder.write` na consulta de permissões ao servidor (Spec 004); sem permissão, mostra o estado de acesso negado e não renderiza o formulário. Edição de cilindro inativo é recusada (a tela mostra o aviso e oferece reativar a quem pode).

- Seções na mesma página, um único envio, rótulos visíveis, ajuda e erros associados aos campos; foco no primeiro erro.
- Campos: tipo (catálogo, com "Novo tipo" para quem pode), número de série (obrigatório), fabricante, ano, pressão de trabalho, observações e, no cadastro, o primeiro identificador (tipo + valor).
- Conflito de série ou identificador: mensagem junto do campo que indica o cilindro que usa o valor, com link se a pessoa puder vê-lo.
- Edição envia `expected_version`; `VERSION_CONFLICT` mostra aviso com ação "Recarregar" que preserva o que a pessoa digitou para comparação.
- Sem conexão: envio desabilitado com o motivo; nada é guardado localmente.

## Detalhe (história 2, 5, 6, 7)

Blocos: dados do cilindro com os três selos; identificadores (ativos e desativados, com ações para quem pode); testes hidrostáticos (registrar, retificar, original visível); histórico (mais recente primeiro, inverter ordem, filtros por tipo e período, paginado). Ações de inativar/reativar, desativar e transferir identificador usam diálogo acessível com justificativa obrigatória e devolvem o foco ao acionador. Não existe nenhuma ação de excluir.

## Entrada no estoque (RF-029, história 3)

- Campo "Identificador" com foco inicial; Enter envia; remove quebras de linha e espaços das pontas; compatível com leitor que age como teclado.
- Depois de cada resultado: campo limpo, foco de volta ao campo, resultado anunciado uma vez em `role="status"` (sem mover o foco), última leitura visível.
- Resultados: sucesso; repetição (mesmo resultado, sem duplicar); já em estoque; cilindro inativo; não encontrado (oferece "Cadastrar cilindro" se `cylinder.write`); identificador desativado (informa a quem pertencia); aviso de teste vencido/reprovado destacado, sem impedir a entrada.
- Sem conexão ou conexão perdida no envio: "estado desconhecido" com "Tentar de novo" que reutiliza a mesma chave de operação.
- Uma sequência de 20 entradas é possível sem tocar no mouse (MS-002).

## Acessibilidade e PWA

- WCAG 2.2 AA: um só `h1` e um só `main`, alvos de 44 px, foco sempre visível, estado nunca só por cor, mensagens em português sem culpar a pessoa.
- A estrutura abre offline; nenhum dado de cilindro, identificador ou histórico em `Cache Storage`, `localStorage`, `sessionStorage` ou IndexedDB.
- Pacote de entrada ≤ 593,95 kB: nenhuma tela entra no pacote de entrada.
