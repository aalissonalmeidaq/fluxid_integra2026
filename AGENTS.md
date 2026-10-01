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

## Gate obrigatório de registro de IA

Antes de criar o commit que encerra qualquer ciclo Spec Kit:

1. conclua a implementação e a convergência;
2. execute todos os testes aplicáveis;
3. prepare a implementação e os testes com `git add`, sem criar o commit;
4. gere um novo registro com `npm run ia:registro -- --spec NNN --ciclo NN --titulo "Título"`;
5. preencha a validação humana sem inventar informações e prepare `docs/governanca-ia`;
6. execute `npm run ia:validar`;
7. inclua código, testes, `docs/governanca-ia/indice.md` e o novo RIA no mesmo commit.

Nunca inclua segredos, tokens, credenciais, dados pessoais desnecessários ou conteúdo confidencial no registro. Use sínteses sanitizadas. Se a validação humana ou o resultado dos testes não estiver disponível, interrompa o commit e solicite a informação.

Não ignore o hook com `--no-verify`. O GitHub Actions repetirá a validação no pull request.

Os novos registros seguem o padrão de conteúdo dos DOCX históricos, usam identificador sequencial `RIA-NNN` e registram a decisão humana como `utilizado`, `adaptado` ou `descartado`. Não gere RIA para uma interação isolada que não encerra um ciclo Spec Kit.

Assim que o pull request do ciclo for aprovado e mergeado, entregue o DOCX do RIA: em uma branch `docs/ria-NNN-docx`, execute `python scripts/governanca-ia/exportar-docx.py --source docs/governanca-ia/registros/RIA-NNN-<slug>.md --output docs/governanca-ia/registros/NN_<Titulo>.docx`, aponte o índice para o DOCX no formato `` `registros/NN_<Titulo>.docx` (`RIA-NNN-<slug>.md`) `` e abra um pull request só de documentação. Qualquer correção posterior do RIA exige regenerar o DOCX.

Ao preencher um RIA, escreva de forma natural e autêntica. Preserve o sentido original, elimine palavras robóticas, repetições e formalidade excessiva, mas nunca invente fatos, resultados, fontes, validações ou decisões humanas.

Se a IA gerar código, o campo `Resposta gerada pela IA` deve conter um resumo e um link para revisão pela equipe. Prefira o pull request; enquanto ele não existir, use o repositório ou a branch e registre a troca pelo link do PR como pendência obrigatória antes do merge.
