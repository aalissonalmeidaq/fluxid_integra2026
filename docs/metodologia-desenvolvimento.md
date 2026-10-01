# Metodologia oficial de desenvolvimento do FluxID

## Finalidade

Este documento define o processo obrigatório para especificar, construir, testar, revisar e entregar o FluxID. O projeto adotará Spec Driven Development com GitHub Spec Kit, Test Driven Development, GitHub Flow e governança de UI UX orientada pela identidade visual FluxID.

## Princípios obrigatórios

1. Toda funcionalidade começa por uma especificação em português brasileiro.
2. Nenhuma implementação começa sem critérios de aceitação testáveis.
3. Testes são escritos antes do código de produção sempre que a unidade for testável.
4. As regras de negócio residem no domínio e não nos componentes React.
5. O isolamento multitenant é validado por políticas RLS e testes com pelo menos dois tenants.
6. Toda ação sensível gera auditoria.
7. A interface atende WCAG 2.2 AA, desktop, tablet, mobile e instalação PWA.
8. Estados de hardware são assíncronos e somente mudam após confirmação do dispositivo.
9. A branch main é protegida e alterações entram por pull request.
10. Documentação, testes e código são atualizados no mesmo pull request.
11. Cada ciclo Spec Kit concluído gera um novo Registro de Uso de IA após os testes e antes do commit de encerramento.
12. A conectividade local, LAN e cloud do Supabase é testada sem confundir indisponibilidade com falhas de autenticação, autorização ou RLS.

## Fluxo Spec Kit

Constituição uma vez por projeto. Para cada funcionalidade: especificar, esclarecer, planejar, decompor tarefas, analisar consistência, implementar e convergir.

```text
/speckit.constitution
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
/speckit.analyze
/speckit.implement
```

## Encerramento obrigatório do ciclo e registro de IA

Um ciclo somente pode ser encerrado quando a implementação convergiu, os testes foram aprovados e o registro de uso de IA foi criado. A ordem é obrigatória:

1. concluir implementação e convergência da spec;
2. executar a suíte de testes e registrar o resultado;
3. preparar com `git add` a implementação e os testes aprovados, sem criar o commit;
4. executar `npm run ia:registro -- --spec NNN --ciclo NN --titulo "Título"`;
5. revisar o novo arquivo em `docs/governanca-ia/registros/` e completar a validação humana;
6. preparar o índice e o registro com `git add docs/governanca-ia`;
7. executar `npm run ia:validar`;
8. criar o commit de encerramento e abrir o pull request;
9. depois do merge do pull request, entregar o DOCX do RIA com `scripts/governanca-ia/exportar-docx.py`, apontar o índice para ele e abrir um pull request só de documentação.

O registro usa o SHA do commit-base e o hash do diff funcional preparado, pois o commit de encerramento ainda não existe. O conteúdo deve ser sanitizado: segredos, credenciais, dados pessoais e informações confidenciais não podem ser copiados para o documento.

Há duas camadas de aplicação da regra:

- `pre-commit`: bloqueia localmente alterações funcionais sem novo RIA e índice atualizado;
- GitHub Actions: repete a verificação no pull request e impede o merge se o hook local tiver sido ignorado.

Documentação editorial sem mudança de escopo, código, teste ou spec não exige novo RIA. Toda mudança executada como parte de um ciclo Spec Kit exige.

O conteúdo dos novos registros segue o padrão dos DOCX históricos: objetivo, prompt sanitizado, resposta, análise crítica, validação humana, decisão, justificativa, fontes, pendências e checklist final. A numeração é sequencial no formato `RIA-NNN`.

## TDD

O ciclo obrigatório é RED, GREEN e REFACTOR. As tarefas devem colocar testes de domínio, autorização, persistência e contrato antes da implementação correspondente.

## Gates de qualidade

| Gate | Condição |
|---|---|
| Especificação | Objetivo, atores, escopo, regras e critérios aceitos |
| Plano | Arquitetura, dados, segurança, UX e testes definidos |
| Tarefas | Dependências e sequência RED GREEN REFACTOR explícitas |
| Implementação | Testes automatizados aprovados |
| Registro de IA | Novo RIA criado, índice atualizado e validação humana preenchida |
| Pull request | CI, revisão humana, acessibilidade e documentação aprovadas |

## Cobertura mínima

| Área | Linhas e funções | Branches |
|---|---:|---:|
| Projeto global | 85% | 80% |
| Domínio e máquinas de estado | 95% | 95% |
| Comandos IoT | 95% | 95% |
| Proximidade e autorização | 100% dos cenários | 100% dos cenários |

## GitHub Flow

- main protegida e sem push direto;
- branches feature/NNN-descricao, fix/NNN-descricao e chore/descricao;
- commits convencionais com texto em português;
- uma issue por spec;
- comentários registram decisões sem criar commits vazios;
- squash merge após CI e revisão humana;
- PR referencia a spec, issue, testes e critérios de aceitação.

## UI UX

UI UX Pro Max será uma dependência local versionada. O design system FluxID será persistido em design-system/fluxid/MASTER.md, com tokens Tailwind, componentes acessíveis e complementos por página. Toda tela deverá possuir estados de carregamento, vazio, erro, offline, sincronização e permissão negada.

## Definition of Ready

- spec aprovada;
- critérios de aceitação testáveis;
- regras de negócio e estados definidos;
- permissões identificadas;
- modelo de dados e contratos definidos;
- riscos e estratégia de testes registrados;
- referência visual disponível quando houver interface.

## Definition of Done

- critérios de aceitação atendidos;
- testes escritos e aprovados;
- cobertura mínima alcançada;
- RLS e isolamento multitenant testados;
- responsividade e acessibilidade validadas;
- documentação atualizada;
- registro de uso de IA do ciclo criado e validado;
- CI aprovada;
- revisão humana concluída;
- merge realizado na main.
