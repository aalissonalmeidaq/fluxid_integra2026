# Constituição do projeto FluxID

## I Especificação antes do código

Toda funcionalidade deve possuir spec em português brasileiro, critérios de aceitação testáveis e escopo explícito antes da implementação.

## II TDD obrigatório

O desenvolvimento segue RED, GREEN e REFACTOR. Código de domínio, autorização, multitenancy, comandos e proximidade deve nascer com testes automatizados.

## III Multitenancy e segurança

Dados de organizações são isolados por organization_id e RLS. Nenhuma credencial privilegiada pode existir no cliente. Ações sensíveis exigem autorização, justificativa e auditoria.

## IV Estados explícitos

Estados de cilindro, viagem, parada, proximidade, comando, trava e alerta são independentes. O sistema não presume que um comando físico foi executado.

## V Experiência e acessibilidade

As interfaces seguem o design system FluxID, Tailwind, UI UX Pro Max, WCAG 2.2 AA e responsividade de 360 px a desktop amplo. O aplicativo de campo é instalável, orientado à tarefa e tolerante a operação offline.

## VI Rastreabilidade de desenvolvimento

Toda mudança relevante é ligada a issue, spec, branch e pull request. A main é protegida. Commits vazios não são usados para registrar conversas; decisões sem alteração de arquivo são registradas na issue correspondente.

## VII Qualidade verificável

Pull requests devem passar por lint, tipagem, testes, cobertura, RLS, integração, E2E, acessibilidade, build PWA e revisão humana.

## VIII Documentação viva

Documento de Visão, PRD, specs, ADRs, contratos e testes são atualizados com a implementação. Documentos canônicos são escritos em português brasileiro; identificadores de código permanecem em inglês.

## Governança

Alterações a esta constituição exigem pull request dedicado, justificativa, impacto nas specs existentes e aprovação da equipe responsável.
