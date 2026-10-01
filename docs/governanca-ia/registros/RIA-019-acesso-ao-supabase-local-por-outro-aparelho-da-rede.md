# Registro do uso de inteligência artificial e validação humana

**FluxID | RIA-019 | Acesso ao Supabase local por outro aparelho da rede**

> Ponto de atenção: a IA apoia a equipe, mas a responsabilidade final é humana.

## Registro da interação

- Ferramenta de IA utilizada: Claude Code (Anthropic), modelo Claude Sonnet 5.5
- Objetivo do uso: Permitir testar o aplicativo em um celular na mesma rede: em desenvolvimento, quando a página é aberta por outro aparelho, o destino do Supabase local passa a ser alcançado pelo próprio servidor do Vite, sem expor o Supabase CLI à rede.
- Prompt utilizado, em síntese sanitizada: Ao validar a Spec 003 em um celular, o responsável viu o aplicativo sem conexão com o banco, porque o endereço local do Supabase aponta para o próprio celular. Ele pediu que o ambiente passasse a usar o endereço da rede de forma automática. O assistente investigou, constatou que o firewall do Windows e a rede corporativa provavelmente bloqueariam a porta do Supabase e propôs repassar as chamadas pelo servidor do Vite, na porta que já abre no celular. O responsável testou e aprovou.
- Resposta gerada pela IA: A IA criou a regra de adaptação (src/config/dev-network.ts), ligada ao provedor de conectividade, o repasse do servidor de desenvolvimento em vite.config.ts, o script npm run dev:rede, os testes (10 da regra e 1 de integração) e a documentação em docs/arquitetura-conectividade-supabase.md e .env.example. A primeira versão trocava o endereço pelo IP da máquina; foi substituída pelo repasse pelo Vite depois de a IA perceber que isso expunha o Supabase CLI à rede e dependia do firewall.

Link para validação da equipe: https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/10
- Análise crítica da equipe: A análise crítica mudou a solução: a versão inicial reescrevia o host para o IP da máquina e o teste local passava, mas a rede é corporativa (domínio) e o Docker tem regra de firewall de bloqueio, então o celular não alcançaria a porta 54321. O teste do contrato de URLs também pegou um endereço de exemplo em um comentário. A regra nova só reescreve quando o destino local é loopback e a origem da página não é, e recusa origens inválidas.
- Validação humana realizada: O responsável testou em um celular Android com Chrome, na mesma rede do computador: depois de recarregar a página, o aviso passou de Sem conexão para Conectado e o login funcionou. Amostra: uma pessoa. Duração: até 10 minutos. Não houve teste em outras redes, em iOS nem com firewall diferente.
- Decisão final: adaptado
- Justificativa: A primeira solução funcionava no computador, mas exigia abrir a porta do Supabase CLI para a rede e dependia do firewall; o AGENTS.md proíbe expor essa pilha. Adaptei a abordagem para o repasse pelo Vite, que mantém o Supabase fechado e só usa a porta 3000. A regra só vale em desenvolvimento e nunca no build de produção.
- Fontes verificadas: Nenhuma fonte externa consultada. As decisões partiram do AGENTS.md, de docs/arquitetura-conectividade-supabase.md e da configuração do repositório.
- Identificador do registro: RIA-019
- Data e hora da interação: 01/10/2026, 16:42:08 - America/Fortaleza

## Rastreabilidade técnica do ciclo

- Repositório: fluxid
- Branch: feat/003-ajuste-ip-rede-local
- Spec: 003
- Ciclo: 02
- Commit-base: 7b329be5052a0df1fadbdc9df3c2e9996c7b68f1
- Hash do diff funcional preparado: c5cb48ddd8e65e16863373b59a799b51db67d081c290cf436c6242c14eb00e52
- Arquivos e áreas afetadas:

- `.env.example`
- `docs/arquitetura-conectividade-supabase.md`
- `package.json`
- `src/app/providers.test.tsx`
- `src/app/providers.tsx`
- `src/config/dev-network.test.ts`
- `src/config/dev-network.ts`
- `vite.config.ts`

## Testes e evidências

- Comando(s): npm run lint; npm run typecheck; npm run test; teste manual em celular Android (Chrome) com npm run dev:rede
- Resultado: aprovado
- Evidência: lint e typecheck sem erros; 103 arquivos e 1.397 testes aprovados, incluindo os 11 novos e o contrato que proíbe URLs externas em src/; as chamadas de autenticação e de compatibilidade responderam 200 pelo endereço do Vite; teste manual no celular aprovado pelo responsável.

## Decisões e dados pendentes

Testar em outra rede e em iOS, se houver oportunidade.

## Validação humana

- Responsável pela revisão da equipe: Alisson Almeida
- Data da validação humana: 01/10/2026
- Observações: O repasse vale só com o servidor de desenvolvimento (npm run dev ou dev:rede); o build de produção e o vite preview não o usam. Recuperação de senha e convite continuam apontando para 127.0.0.1 e não abrem no celular. A parte de publicação do banco na nuvem não faz parte deste ajuste e depende de decisões do responsável.

## Regras de preenchimento

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
