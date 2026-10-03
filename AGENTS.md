# Instruções do repositório FluxID

## Idioma e metodologia

- Escreva specs, planos, tarefas, registros e documentação em português brasileiro.
- Execute o fluxo Spec Kit definido em `docs/metodologia-desenvolvimento.md`.
- Use TDD e mantenha as regras de domínio fora dos componentes React.

## GitHub Flow e qualidade

- A branch `main` é protegida. Trabalhe em branches e integre mudanças somente por pull request aprovado.
- Antes de qualquer commit, execute os testes e as validações aplicáveis ao escopo alterado.
- Não ignore hooks com `--no-verify` e não use force push.

## Segurança, multitenancy e auditoria

- Isole dados por tenant com `organization_id` e políticas RLS.
- Teste toda política RLS com pelo menos dois tenants e confirme tanto o acesso permitido quanto o bloqueado.
- Toda ação sensível deve exigir autorização adequada e gerar registro de auditoria.
- Nunca versione segredos, senhas, tokens, chaves privadas, credenciais privilegiadas ou a chave `service_role`.
- Nunca exponha credenciais privilegiadas no cliente React.

## Conectividade do Supabase

- Siga `docs/arquitetura-conectividade-supabase.md` para selecionar Supabase local, LAN ou cloud.
- No modo automático, priorize cloud, depois LAN e somente então local.
- Não trate erro de autenticação, autorização, validação ou RLS como motivo para fallback.
- Não implemente escrita simultânea em duas instâncias. Sincronização exige operações idempotentes, auditoria e tratamento explícito de conflitos.
- Ao promover uma conexão LAN ou local para cloud, conclua a sincronização segura antes de trocar o cliente ativo; não transfira sessões entre projetos Supabase por simples troca de URL.
- Use somente chaves publicáveis no frontend. Chaves secretas e `service_role` permanecem exclusivamente no servidor.
- Não exponha a pilha de desenvolvimento do Supabase CLI como servidor de produção na rede local.

## Interface e aplicação de campo

- Implemente interfaces responsivas de 360 px a desktop amplo.
- Atenda WCAG 2.2 AA e valide navegação por teclado, contraste, foco e tecnologias assistivas.
- Preserve a instalação e o funcionamento PWA, incluindo estados de carregamento, vazio, erro, offline e sincronização.

### Identidade visual e qualidade de UI (decidido na Spec 005)

O padrão visual da Spec 005 é a base do produto. As próximas specs **preservam e só melhoram** o que existe, sempre dentro da identidade visual (tokens, componentes, ícones, Montserrat e logotipo da Spec 003) e com aparência moderna, premium e de ótima qualidade.

- Ao criar ou alterar qualquer tela ou componente, use a skill `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/`) e as demais skills de design de front-end disponíveis. Priorize interfaces fáceis de usar, agradáveis e consistentes.
- Preserve estas decisões, salvo pedido explícito de mudança:
  - o conteúdo ocupa toda a largura da tela (sem container máximo);
  - o estado de conexão fica na barra superior, de forma discreta quando conectado, sem ocupar a área do corpo; o aviso de offline fica em faixa abaixo da barra;
  - no celular (abaixo de 768 px) o menu é um ícone de sanduíche fixado à direita, sem caixa de botão, que abre uma gaveta pela direita com a logo e vira "X" para fechar; o clique fora, o fundo escurecido e Escape também fecham;
  - a partir de 768 px o menu fica fixo na coluna lateral, com a logo no topo dela (um só `h1`);
  - telas públicas usam a moldura de marca (painel de marca) sem barra superior nem menu;
  - dados de exemplo ficam sempre marcados "Exemplo" e vêm de uma fonte substituível.
- Só tokens: nenhum valor arbitrário do Tailwind, cor literal ou transição que atrase o anel de foco (o teste `tests/contract/escalas-no-codigo.test.ts` reprova). Movimento respeita `prefers-reduced-motion`.
- Regenere as capturas visuais no Linux (`npm run test:visual:atualizar`) quando o visual mudar; nunca versione `*-win32.png`.
- Antes de rodar E2E, reconstrua o `dist` (`npm run build`): o Playwright reaproveita um servidor já aberto na porta 4173 e pode testar uma versão antiga.

## Validação humana obrigatória para finalizar a spec

Nenhuma spec é finalizada sem validação humana real. Antes de gerar o RIA, o agente **deve entrevistar** a pessoa responsável pela validação e gravar as respostas dela no registro:

- perguntas mínimas: quem validou; amostra (perfis, telas, larguras, fluxos); ambiente (navegador, sistema, dispositivo); duração; resultado (aprovado, aprovado com ajustes ou reprovado) e itens a corrigir; decisão (`utilizado`, `adaptado` ou `descartado`) com justificativa; e a confirmação de que as respostas podem ser gravadas em nome da pessoa;
- nunca presuma, infira dos testes automatizados nem preencha a validação em nome de alguém; se a pessoa não responder, interrompa o encerramento e registre a pendência;
- se houver itens a corrigir, corrija, repita os testes e pergunte de novo;
- passe as respostas ao gerador (`--revisor`, `--data-validacao`, `--amostra`, `--ambiente`, `--duracao`, `--resultado-validacao`, `--correcoes`, `--confirmacao`, `--decisao`, `--justificativa`); `npm run ia:validar` reprova o commit sem esses campos ou sem `Confirmação do responsável: sim`;
- o DOCX do RIA é gerado a partir do registro preenchido com essas respostas.

Procedimento completo em `docs/metodologia-desenvolvimento.md` e `docs/governanca-ia/README.md`.

## Gate obrigatório de registro de IA (passos)

Antes de criar o commit que encerra qualquer ciclo Spec Kit:

1. conclua a implementação e a convergência;
2. execute todos os testes aplicáveis;
3. prepare a implementação e os testes com `git add`, sem criar o commit;
4. gere um novo registro com `npm run ia:registro -- --spec NNN --ciclo NN --titulo "Título"`;
5. conduza a entrevista de validação humana acima, preencha o registro com as respostas e a confirmação da pessoa responsável, sem inventar informações, e prepare `docs/governanca-ia`;
6. execute `npm run ia:validar`;
7. inclua código, testes, `docs/governanca-ia/indice.md` e o novo RIA no mesmo commit.

Nunca inclua segredos, tokens, credenciais, dados pessoais desnecessários ou conteúdo confidencial no registro. Use sínteses sanitizadas. Se a validação humana ou o resultado dos testes não estiver disponível, interrompa o commit e solicite a informação.

Não ignore o hook com `--no-verify`. O GitHub Actions repetirá a validação no pull request.

Os novos registros seguem o padrão de conteúdo dos DOCX históricos, usam identificador sequencial `RIA-NNN` e registram a decisão humana como `utilizado`, `adaptado` ou `descartado`. Não gere RIA para uma interação isolada que não encerra um ciclo Spec Kit.

Assim que o pull request do ciclo for aprovado e mergeado, entregue o DOCX do RIA: em uma branch `docs/ria-NNN-docx`, execute `python scripts/governanca-ia/exportar-docx.py --source docs/governanca-ia/registros/RIA-NNN-<slug>.md --output docs/governanca-ia/registros/NN_<Titulo>.docx`, aponte o índice para o DOCX no formato `` `registros/NN_<Titulo>.docx` (`RIA-NNN-<slug>.md`) `` e abra um pull request só de documentação. Qualquer correção posterior do RIA exige regenerar o DOCX.

Ao preencher um RIA, escreva de forma natural e autêntica. Preserve o sentido original, elimine palavras robóticas, repetições e formalidade excessiva, mas nunca invente fatos, resultados, fontes, validações ou decisões humanas.

Se a IA gerar código, o campo `Resposta gerada pela IA` deve conter um resumo e um link para revisão pela equipe. Prefira o pull request; enquanto ele não existir, use o repositório ou a branch e registre a troca pelo link do PR como pendência obrigatória antes do merge.
