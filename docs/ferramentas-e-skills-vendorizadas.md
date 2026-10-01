# Ferramentas e skills vendorizadas

Este inventário cobre o conteúdo de `.agents/skills/` na Spec 001. As informações vêm de `skills-lock.json` e dos próprios arquivos; quando não há evidência local, elas são marcadas como não verificadas.

| Nome | Origem | Versão/commit | Licença | Finalidade | Execução | Necessidade de versionamento | Processo de atualização |
|---|---|---|---|---|---|---|---|
| design-mobile-apps | `designed-by-ai/skills` | hash `f4cc…7274` | não verificado | orientação para interfaces móveis | desenvolvimento | preserva a orientação usada no projeto | atualizar a origem, revisar diffs e renovar o lock |
| frontend-ui-engineering | `addyosmani/agent-skills` | hash `caad…4343` | não verificado | qualidade e acessibilidade de interface | desenvolvimento | evita variação entre ciclos | mesmo processo |
| security-and-hardening | `addyosmani/agent-skills` | hash `1e0c…021d` | não verificado | revisão de segurança e cadeia de suprimentos | desenvolvimento | mantém controles revisáveis | mesmo processo |
| supabase | `supabase/agent-skills` | 0.1.2; hash `9d45…9014` | não verificado | orientação para Supabase | desenvolvimento | necessária enquanto houver Supabase | atualizar após validar mudanças da CLI/SDK |
| supabase-postgres-best-practices | `supabase/agent-skills` | 1.1.1; hash `128f…ba59` | MIT | regras para PostgreSQL/Supabase | desenvolvimento | necessária para futuras migrações | atualizar com revisão de licença e compatibilidade |
| ui-ux-pro-max | `nextlevelbuilder/ui-ux-pro-max-skill` | hash `b0f5…a0ef` | não verificado | apoio ao sistema de design e UX | desenvolvimento | necessária pela metodologia | atualizar a origem e revisar o `MASTER.md` resultante |
| speckit-analyze | não verificado | não verificado | não verificado | análise de consistência de artefatos | desenvolvimento | parte do fluxo Spec Kit | atualizar junto do processo Spec Kit |
| speckit-checklist | não verificado | não verificado | não verificado | listas de verificação da spec | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-clarify | não verificado | não verificado | não verificado | esclarecimento de requisitos | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-constitution | não verificado | não verificado | não verificado | manutenção da constituição | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-converge | não verificado | não verificado | não verificado | convergência entre código e tarefas | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-implement | não verificado | não verificado | não verificado | execução das tarefas | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-plan | não verificado | não verificado | não verificado | planejamento técnico | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-specify | não verificado | não verificado | não verificado | criação de especificações | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |
| speckit-tasks e speckit-taskstoissues | não verificado | não verificado | não verificado | tarefas e rastreabilidade em issues | desenvolvimento | parte do fluxo Spec Kit | mesmo processo |

Nenhuma dessas skills participa do runtime do navegador, do bundle de produção ou da execução do Supabase. Elas são ferramentas de desenvolvimento. A falta de origem, versão ou licença verificável nos itens marcados é uma pendência de cadeia de suprimentos para ser resolvida antes de uma atualização ou remoção.

## Riscos e controles

- Um conteúdo vendorizado pode ficar desatualizado ou divergir da origem. Toda atualização precisa registrar origem, revisão e hash em `skills-lock.json`.
- Dependências de ferramentas não devem ser tratadas como dependências de runtime. O pacote de produção continua definido por `package.json` e `package-lock.json`.
- Nenhum arquivo de terceiros deve ser removido sem confirmar consumidores e sem revisão humana.

## Skills do Spec Kit para o Claude Code

`.claude/skills/` guarda as dez skills do fluxo Spec Kit (`speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-analyze`, `speckit-implement`, `speckit-converge`, `speckit-checklist`, `speckit-constitution` e `speckit-taskstoissues`) na versão para o Claude Code. O conteúdo é o mesmo de `.agents/skills/`; muda apenas a sintaxe de invocação dos comandos (`/speckit-...` aqui, `$speckit-...` lá).

- Finalidade: permitir o fluxo obrigatório da metodologia (`docs/metodologia-desenvolvimento.md`) a quem usa o Claude Code.
- Execução: somente desenvolvimento; não participa do bundle nem do runtime.
- Cuidado: a pasta não deve receber configuração local (`settings.local.json`), segredos nem credenciais. Ao atualizar o Spec Kit, atualize as duas pastas juntas.

## Fonte Montserrat hospedada no aplicativo (Spec 003)

Dependência de runtime, diferente das ferramentas acima: a fonte entra no pacote de produção.

| Item | Valor |
|---|---|
| Pacote | `@fontsource-variable/montserrat` |
| Versão | 5.3.0 (versão exata, fixada em `package.json` e `package-lock.json`) |
| Licença | OFL-1.1 (SIL Open Font License), que permite hospedar e redistribuir a fonte com o aplicativo |
| Uso | somente o arquivo `montserrat-latin-wght-normal.woff2` (fonte variável, pesos 300 a 800, cobre o português do Brasil), declarado em `src/styles/globals.css`; os demais subconjuntos do pacote não são importados |
| Motivo | atender RF-003, RNF-001 e RF-030: tipografia da identidade FluxID, funcionando offline e sem requisição a domínio de terceiros |
| Verificação | `npm audit` sem vulnerabilidades em 01/10/2026; o teste `tests/contract/no-external-assets.test.ts` confirma que nenhuma URL externa é carregada |
| Atualização | trocar a versão exata, rodar `npm audit`, as suítes de contrato e a comparação visual da Spec 003 |
