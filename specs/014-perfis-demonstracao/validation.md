# Validação da Spec 014

Data técnica: 20–21/10/2026.

## Validação automatizada

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run test:coverage` | Aprovado: 405 arquivos e 5.877 testes; 90,13% statements, 84,95% branches, 88,70% functions e 93,34% lines |
| `npx supabase db reset --local --yes` | Aprovado; migrations e seeds reaplicados |
| `npx supabase test db` | Aprovado: 135 arquivos e 3.397 testes |
| `npm run test:live` | Aprovado: 29 arquivos aprovados, 3 ignorados; 151 testes aprovados, 3 ignorados |
| `npm run build` | Aprovado |
| E2E da Spec 014 | Aprovado: 15 testes nos projetos desktop Chromium, tablet WebKit, 768 px, 1920 px e celular 360 px |
| E2E completo | Aprovado no GitHub Actions das PRs #54 e #55 |
| Capturas visuais | Aprovadas no Chromium do Linux nas PRs #54 e #55; referências de 360, 768 e 1920 px atualizadas |

O Playwright ficou preso ao encerrar os servidores auxiliares no Windows. Para o recorte da Spec 014, os previews dos builds atuais foram iniciados separadamente e reutilizados pelo runner; assim os 15 casos encerraram normalmente em 18,8 segundos.

## Publicação no Supabase cloud

- `db push --dry-run --include-all`: confirmou somente as migrations `20261020170000` a `20261020170400`.
- `db push --include-all`: as cinco migrations foram aplicadas com sucesso.
- Edge Functions `password-recovery`, `invite-user`, `manage-organizations` e `manage-seals`: publicadas com sucesso.
- Restauração das contas e da amostra: concluída com chave moderna mantida somente em memória. Resultado: empresa sem mudança, cinco perfis sem mudança, C262 sem mudança e lacre de bancada ainda não destinado.
- GitHub: `SUPABASE_SERVICE_ROLE_KEY` atualizado com a chave moderna e `SUPABASE_CLOUD_URL` confirmado no repositório `aalissonalmeidaq/fluxid_integra2026`; nenhum valor secreto foi exibido.
- Aprovação Master do lacre `DSP-P77E49TC`: confirmada pela pessoa responsável com captura da mensagem de sucesso para a empresa Oxigênio Cariri.
- Segunda restauração: concluída; o resumo confirmou `lacre de bancada: bound`, vinculando o dispositivo aprovado ao C262.
- Teste dos cinco perfis no site publicado: aprovado por Alisson Almeida em 21/10/2026.
- MS-001: entrada concluída em 5 segundos, abaixo do limite de 30 segundos.
- MS-006: C262 e lacre visíveis; confirmação da localização em 60 segundos, dentro do limite de 1 minuto.
- MS-007: execução manual do workflow de restauração aprovada; o segredo do GitHub foi confirmado como atualizado.

## Segurança

Os testes de contrato que limitam as senhas públicas da demonstração passaram. Uma chave legada privilegiada apareceu na saída de uma consulta administrativa durante a operação; o valor não foi gravado no repositório nem é repetido neste registro. Alisson Almeida confirmou em 21/10/2026 que a chave antiga foi rotacionada e que o segredo `SUPABASE_SERVICE_ROLE_KEY` do GitHub foi atualizado. O contrato `tests/contract/client-secrets.test.ts` foi executado novamente no ciclo de convergência: 22 testes aprovados.

A auditoria de dependências encontrou dois avisos altos no ferramental de build. `vite` foi atualizado de 8.3.1 para 8.3.5 e `source-map-js` foi fixado em 1.2.2; lint, tipos, 46 testes de contrato/domínio, build e nova auditoria passaram, com zero vulnerabilidades conhecidas.

## Validação humana

- **Responsável:** Alisson Almeida.
- **Data:** 21/10/2026.
- **Amostra informada:** perfil Master; fluxo de atualização e aprovação do lacre `DSP-P77E49TC` para a empresa Oxigênio Cariri. A evidência enviada mostra a aprovação concluída. Não foram informadas larguras exatas nem validação dos outros quatro perfis.
- **Ambiente:** Google Chrome no Windows e celular Android.
- **Duração:** 26 minutos.
- **Resultado:** aprovado.
- **Itens a corrigir informados:** nenhum.
- **Decisão:** utilizado.
- **Justificativa:** o fluxo está sendo testado e, até agora, funciona corretamente.
- **Confirmação do responsável:** sim; Alisson autorizou registrar as respostas em seu nome.

## Ciclo 02 — confirmação da localização a cada minuto

Data técnica: 21/10/2026.

| Verificação | Resultado |
| --- | --- |
| Testes direcionados de interface e tempo real | Aprovado: 31 testes |
| Suíte ampliada de lacres | Aprovado: 14 arquivos e 134 testes |
| `npx supabase db reset --local --yes` | Aprovado; migration e seeds reaplicados |
| pgTAP direcionado de consolidação | Aprovado: 18 testes |
| `npx supabase test db --local` | Aprovado: suíte completa |
| `npm run lint` | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run build` | Aprovado |
| `npm run test` | Inconclusivo: o runner não encerrou em duas tentativas, após 5 e 10 minutos, sem relatar teste reprovado |

A validação humana do ciclo 02 foi concluída. Na primeira execução visual da PR, 285 casos passaram e as três referências Linux da tela de detalhe do lacre foram atualizadas, em 360, 768 e 1920 px, para refletir os textos aprovados de confirmação da localização e o rótulo GSM/Telemetria. As execuções seguintes do gate visual passaram nas PRs #54 e #55. As migrations foram publicadas no Supabase cloud, o workflow da Vercel concluiu com sucesso e `https://fluxid.tec.br/` respondeu HTTP 200.

### Sessões simultâneas das contas demo

- Banco local reaplicado com a migration `20261021145741_remover_limite_sessoes_demo.sql`.
- Testes direcionados aprovados: 109 cenários pgTAP de marcação, restauração e governança de sessões.
- Suíte pgTAP completa aprovada: 135 arquivos e 3.402 testes.
- Testes de contrato de sessão aprovados: 15 testes.
- `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- Confirmado automaticamente: a quarta sessão simultânea de conta demo é aceita; conta comum permanece limitada a três; timebox de 8 horas, inatividade de 30 minutos e rate limit de login não foram removidos.
- Publicação: concluída no Supabase cloud após o merge da PR #54.

### Validação humana do ciclo 02

- **Responsável:** Alisson Almeida.
- **Data:** 21/10/2026.
- **Amostra registrada:** atualização da localização do lacre/cilindro após 1 minuto; confirmação de coordenada repetida atualizando somente o horário; quatro ou mais acessos simultâneos usando a mesma conta de demonstração, sem afetar o limite das contas comuns.
- **Ambiente:** Google Chrome no Windows e celular Android.
- **Duração:** 26 minutos.
- **Resultado:** aprovado.
- **Itens a corrigir:** nenhum.
- **Decisão:** utilizado.
- **Justificativa:** os fluxos necessários deste ciclo foram utilizados e aprovados sem correções.
- **Confirmação do responsável:** sim; Alisson autorizou registrar essas respostas em seu nome.

## Ciclo 03 — convergência documental e encerramento

Data técnica: 21/10/2026.

- **Responsável:** Alisson Almeida.
- **Amostra registrada:** os cinco perfis publicados; entrada até a Visão geral; C262 e lacre; atualização da localização; workflow manual de restauração; rotação da chave antiga e atualização do segredo do GitHub.
- **Ambiente previamente informado para a validação da Spec 014:** Google Chrome no Windows e celular Android.
- **Duração previamente informada para a validação:** 26 minutos.
- **Resultado:** aprovado.
- **Medições:** entrada em 5 segundos; atualização da localização em 60 segundos.
- **Segurança:** chave antiga rotacionada e segredo do GitHub atualizado, conforme confirmação do responsável; nenhum valor foi registrado.
- **Itens a corrigir:** nenhum.
- **Decisão:** utilizado.
- **Justificativa:** os fluxos publicados foram aprovados e as pendências documentais puderam ser encerradas.
- **Confirmação do responsável:** sim; Alisson autorizou registrar essas respostas em seu nome.

### Rastreabilidade do encerramento

- Implementação principal e publicação: PR #52; DOCX do RIA-034: PR #53.
- Atualização de localização e sessões demo: PR #54; DOCX do RIA-035: PR #55.
- Testes completos, banco/RLS, firmware, regressão visual e governança passaram nos gates das PRs.
