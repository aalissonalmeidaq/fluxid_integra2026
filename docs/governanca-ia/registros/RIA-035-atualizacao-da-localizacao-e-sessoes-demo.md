# Registro do uso de inteligência artificial e validação humana

**FluxID | RIA-035 | Atualização da localização e sessões demo**

> Ponto de atenção: a IA apoia a equipe, mas a responsabilidade final é humana.

## Registro da interação

- Ferramenta de IA utilizada: Codex — modelo registrado pela plataforma
- Objetivo do uso: corrigir a atualização da localização do lacre parado e permitir que as contas compartilhadas da demonstração aceitem mais de três sessões simultâneas.
- Prompt utilizado, em síntese sanitizada: verificar por que a localização do lacre não aparecia a cada minuto, manter coordenadas repetidas consolidadas, mostrar a confirmação mais recente e retirar o limite simultâneo somente das contas demo.
- Resposta gerada pela IA: foram preparados testes, duas migrations e ajustes de interface. Leituras repetidas atualizam `last_seen_at` e enviam aviso em tempo real sem duplicar o ponto; contas marcadas em `private.demo_accounts` não entram no limite de três sessões, enquanto as demais regras de segurança permanecem. Revisão disponível no [pull request #54](https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/54).

Link para validação da equipe: https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/54
- Análise crítica da equipe: a exceção de sessões foi mantida estreita, baseada na marca privada das cinco contas demo. Não foram removidos o timebox de 8 horas, a inatividade de 30 minutos, o rate limit de login, a auditoria, as permissões nem o isolamento por organização. O Broadcast da localização continua sem coordenadas e leva somente os identificadores necessários para a tela refazer a consulta autorizada.
- Validação humana realizada: Alisson Almeida testou durante 26 minutos, no Chrome em Windows e em celular Android, a atualização após 1 minuto, a coordenada repetida atualizando somente o horário e quatro ou mais acessos simultâneos na mesma conta demo. O resultado informado foi aprovado, sem correções.
- Decisão final: utilizado
- Justificativa: Os fluxos necessários deste ciclo foram utilizados e aprovados sem correções.
- Fontes verificadas: documentação oficial do Supabase sobre [sessões de usuário](https://supabase.com/docs/guides/auth/sessions), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast) e changelog de mudanças incompatíveis consultado em 21/10/2026.
- Identificador do registro: RIA-035
- Data e hora da interação: 21/10/2026, 12:19:51 - America/Fortaleza

## Rastreabilidade técnica do ciclo

- Repositório: fluxid
- Branch: fix/014-localizacao-lacre-um-minuto
- Spec: 014
- Ciclo: 02
- Commit-base: 44f95f0e24131b47ea9db232d806810f70c660e3
- Hash do diff funcional preparado: 4f14046885c9902943b1f2dce73dd95be96208691571f14a3f74f0c3a3d5311e
- Arquivos e áreas afetadas:

- `specs/014-perfis-demonstracao/spec.md`
- `specs/014-perfis-demonstracao/tasks.md`
- `specs/014-perfis-demonstracao/validation.md`
- `src/pages/cylinders/components/cylinder-seal-block.test.tsx`
- `src/pages/cylinders/components/cylinder-seal-block.tsx`
- `src/pages/seals/components/seal-position-history.tsx`
- `src/pages/seals/seal-detail-page.test.tsx`
- `src/pages/seals/seal-detail-page.tsx`
- `tests/e2e/visual/lacres.visual.spec.ts-snapshots/lacres-detalhe-360-visual-chromium-linux.png`
- `tests/e2e/visual/lacres.visual.spec.ts-snapshots/lacres-detalhe-768-visual-chromium-linux.png`
- `tests/e2e/visual/lacres.visual.spec.ts-snapshots/lacres-detalhe-1920-visual-chromium-linux.png`
- `supabase/migrations/20261021141347_confirmar_localizacao_repetida.sql`
- `supabase/migrations/20261021145741_remover_limite_sessoes_demo.sql`
- `supabase/tests/012_ingest_dedupe.test.sql`
- `supabase/tests/014_demo_markers.test.sql`
- `supabase/tests/014_demo_restore.test.sql`

## Testes e evidências

- Comando(s): `npm run lint`; `npm run typecheck`; `npm run build`; testes Vitest direcionados de lacres e sessões; `npx supabase db reset --local --yes`; pgTAP direcionado; `npx supabase test db --local`.
- Resultado: aprovado nos testes aplicáveis. A suíte Vitest completa não encerrou em duas tentativas, após 5 e 10 minutos, sem relatar teste reprovado; as suítes direcionadas passaram.
- Evidência: 31 testes direcionados de localização e tempo real; 134 testes ampliados de lacres; 15 testes de contrato de sessão; 109 testes pgTAP direcionados; suíte pgTAP completa com 135 arquivos e 3.402 testes; lint, tipos e build aprovados. O banco local foi recriado com as duas migrations. A primeira execução visual da PR aprovou 285 casos e identificou três referências Linux desatualizadas na tela de detalhe do lacre; as capturas de 360, 768 e 1920 px foram atualizadas a partir do artefato do runner Linux e reenviadas para nova validação.

## Decisões e dados pendentes

- Publicar as duas migrations no Supabase cloud e confirmar o deploy do frontend após aprovação e merge do pull request.
- Gerar o DOCX do RIA-035 depois do merge, em PR exclusivo de documentação.

## Validação humana

- Responsável pela revisão da equipe: Alisson Almeida
- Data da validação humana: 21/10/2026
- Amostra validada: Atualização da localização do lacre e do cilindro após 1 minuto; coordenada repetida atualizando somente o horário; quatro ou mais acessos simultâneos usando a mesma conta de demonstração, sem afetar contas comuns.
- Ambiente da validação: Google Chrome no Windows e celular Android.
- Duração da validação: 26 minutos
- Resultado da validação humana: Aprovado
- Itens a corrigir apontados pela pessoa responsável: Nenhuma.
- Confirmação do responsável: sim; Alisson autorizou registrar as respostas em seu nome.
- Observações: o responsável informou aprovação sem itens a corrigir e pediu que os fluxos necessários fossem identificados e registrados.

## Regras de preenchimento

- A validação humana é obrigatória para encerrar a spec. As respostas da seção acima vêm da pessoa responsável, em entrevista conduzida pelo agente de IA, e nunca são inventadas nem presumidas.
- Registrar apenas interações relevantes para o projeto.
- Escrever de forma natural, como uma pessoa explicaria o trabalho para outra. Preservar o sentido original, retirar palavras robóticas, frases repetitivas e formalidade excessiva, sem inventar fatos nem esconder riscos.
- Quando o resultado incluir código, preencher “Resposta gerada pela IA” com um resumo objetivo do que foi produzido e um link para validação pela equipe. Preferir o pull request; se ele ainda não existir, usar o repositório ou a branch e registrar como pendência a inclusão do link do PR antes do merge.
- Não apresentar conteúdo da IA como autoria exclusiva da equipe sem revisão.
- Registrar a decisão como decisão da equipe, mas identificar a pessoa responsável pela revisão. Não atribuir aprovação a uma pessoa sem sua confirmação explícita.
- Validar informações técnicas, legais, financeiras ou científicas em fontes confiáveis.
- Evitar dados pessoais, sigilosos ou sensíveis.
- Explicar como a equipe decidiu utilizar, adaptar ou descartar o resultado.

## Checklist final

- [x] Ferramentas de IA identificadas.
- [x] Prompts relevantes registrados por síntese sanitizada.
- [x] Respostas ou resultados documentados.
- [x] Texto revisado para soar natural, claro e autêntico, sem alterar o sentido original.
- [x] Quando houve geração de código, a resposta contém resumo e link para o repositório, branch ou, preferencialmente, pull request.
- [x] Validação humana explicada.
- [x] Fontes verificadas quando necessário.
- [x] Decisão ou pendência registrada.
- [x] O registro não contém segredos, credenciais ou tokens.
- [x] Dados pessoais foram removidos ou minimizados.
