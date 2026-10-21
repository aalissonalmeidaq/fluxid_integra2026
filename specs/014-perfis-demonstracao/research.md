# Pesquisa: Spec 014, perfis de demonstração e acessos de teste

Decisões técnicas do plano, cada uma com a decisão, o motivo e o que foi descartado.

## 1. Uma só fonte para os acessos de demonstração

- **Decisão:** um arquivo JSON versionado, `src/domain/demo/acessos-demonstracao.json`, com o tenant (id, nomes), o cilindro C262, o código do lacre de bancada e os 5 perfis (id fixo, nome, papel, descrição curta, e-mail e senha). O script da nuvem lê o JSON; a tela de login o importa; o seed local tem um arquivo próprio (`supabase/seeds/demonstracao.sql`), e um teste de contrato reprova o CI se o SQL e o JSON divergirem (RF-002).
- **Motivo:** o seed é SQL e não lê JSON; gerar o SQL num passo de build esconderia o que entra no banco. Um teste de paridade é simples e pega qualquer divergência.
- **Descartado:** gerar o seed a partir do JSON (mais uma ferramenta e um arquivo gerado para revisar); manter as credenciais em três lugares sem teste (divergem com o tempo).

## 2. Ids iguais nos dois ambientes

- **Decisão:** o tenant usa o id que já existe na nuvem (`5478e9e3-155b-482f-b843-3513e0938dd6`, "Oxigênio Cariri"). Os 5 usuários e os vínculos têm ids fixos no JSON, criados com esses ids nos dois ambientes (o Admin API do Auth aceita `id` na criação).
- **Motivo:** o mesmo id faz testes, auditoria e suporte falarem da mesma coisa no local e na nuvem.
- **Descartado:** buscar por nome (frágil se alguém renomear o tenant).

## 3. Como o servidor reconhece a demonstração (RN-004)

- **Decisão:** duas tabelas privadas, sem acesso pelo cliente: `private.demo_tenant` (o tenant da demonstração, uma linha) e `private.demo_accounts` (os usuários de demonstração e a senha publicada). Uma função `private.is_demo_account(user_id)` e outra `private.is_demo_tenant(organization_id)` respondem às regras.
- **Motivo:** a marca fica no banco, então vale em qualquer caminho (tela, função, chamada direta). Guardar a senha publicada não é segredo (RN-001) e permite conferir a troca de senha (item 5).
- **Descartado:** marcar pelo domínio do e-mail (qualquer um poderia criar um e-mail parecido); coluna nova em `organizations` (mexe em tabela lida por todo o sistema por uma regra local).

## 4. Convites e devolução do lacre (RF-016 a, d)

- **Decisão:** `reserve_tenant_invitation`, `invite_first_tenant_admin` e `return_device` passam a responder `DEMO_RESTRICTED` quando o tenant é o da demonstração, antes de qualquer efeito, e registram a negação na auditoria. As funções de borda mapeiam `DEMO_RESTRICTED` para 403. A tela mostra a explicação no lugar da mensagem genérica.
- **Motivo:** a regra fica no banco, onde as outras regras de acesso já ficam, e a borda só traduz o código.
- **Descartado:** esconder os botões (não protege nada; constituição, princípio III).

## 5. Troca de senha (RF-016 b)

- **Decisão:** gatilho `before update of encrypted_password on auth.users` que, para usuários de `private.demo_accounts`, só aceita a nova senha se ela conferir com a senha publicada (`crypt(publicada, nova) = nova`). O script sempre grava a publicada, então passa; qualquer outra senha é recusada.
- **Motivo:** o app troca a senha direto no Auth (`updateUser`), sem passar por função nossa; o gatilho é o único ponto que vale para qualquer caminho, inclusive chamada feita à mão com a sessão do visitante. Gatilhos em `auth.users` são o padrão documentado do Supabase para regras de usuário.
- **Descartado:** só a restauração diária (a senha ficaria trocada por até 24 h); Auth Hooks (não há gancho para troca de senha).
- **Risco:** o Auth devolve erro genérico quando o gatilho recusa; o bloqueio não tem tela, porque a recuperação não envia link a contas de demonstração. A recusa aborta a transação do Auth, então não há registro em `audit_logs` para essa negação: fica o log do Auth.

## 6. Recuperação de senha (RF-016 c)

- **Decisão:** a função `password-recovery` consulta `private.is_demo_email(email)` e, sendo de demonstração, responde o mesmo 202 genérico sem emitir o link, e registra a entrega como `not_applicable` em `record_password_recovery_delivery` (valor já aceito), sem migration nova. A coluna `result` de `audit_logs` só aceita `success`, `denied` e `failed`.
- **Motivo:** a fronteira pública nunca revela se a conta existe; o comportamento visível é igual ao de sempre.

## 7. Restauração reaproveitando as operações do domínio

- **Decisão:** o script cria ou atualiza os usuários pelo Admin API do Auth (id fixo, senha publicada, e-mail confirmado) e depois chama uma única função do banco, `public.demo_restore(p_manifest jsonb)`, executável só pela chave de serviço. Ela, numa transação:
  1. confere que o tenant não tem vínculos fora da demonstração (senão devolve `DEMO_FOREIGN_MEMBERS` e não altera nada);
  2. reativa o tenant, os perfis, os vínculos e um papel por usuário;
  3. abre uma sessão de serviço do administrador de demonstração, marcada como `service`, que não conta para o limite de 3 sessões nem encerra as dos visitantes, e usa as operações do próprio domínio (`save_cylinder_type`, `create_cylinder`, `stock_in_cylinder`, `reactivate_cylinder`, `bind_seal`) para criar, devolver ao estoque e vincular o C262, com histórico e auditoria iguais aos de uma pessoa;
  4. encerra essa sessão e grava `demo.restore` na auditoria da plataforma, sem senha.

  A restauração tem duas fases: `markers` (marcas e senhas publicadas) antes de mexer no Auth, e `state` depois. Assim o gatilho de senha (item 5) sempre compara com a senha publicada atual, inclusive quando ela muda no JSON.
- **Motivo:** usar as operações do domínio mantém o histórico do cilindro coerente e passa pelas mesmas validações; nada de inserção direta que pule regra.
- **Descartado:** inserir direto nas tabelas (pula validações e eventos); restaurar dados criados pelos visitantes (fora do escopo).
- **Limites:** se o C262 estiver numa viagem em andamento, a restauração do cilindro é pulada com aviso; o lacre só é vinculado se estiver destinado ao tenant (RF-014).

## 8. Rotina diária (RF-017)

- **Decisão:** workflow `.github/workflows/restaurar-demonstracao.yml`, `schedule` diário às 06:23 UTC (03:23 de Brasília) e `workflow_dispatch`, rodando `npm run operacao:demonstracao` com `SUPABASE_URL` (variável) e `SUPABASE_SERVICE_ROLE_KEY` (segredo do repositório). Sem o segredo, falha com mensagem do que falta.
- **Motivo:** mesmo modelo da limpeza de retenção (Spec 002). A chave fica só no GitHub.
- **Descartado:** `pg_cron` no banco (o banco não cria usuários no Auth nem acerta senhas).

## 9. Botão e modal no login

- **Decisão:** componente `TestAccessesButton` + `TestAccessesDialog` no login, carregados por `React.lazy` só quando `VITE_DEMO_ACCESS` não for `false`. O valor é lido em tempo de build: desligado, o Vite elimina o import e as credenciais não entram em nenhum arquivo publicado (MS-005). O `Dialog` do design system já cuida de foco preso, Escape, clique fora e devolução do foco.
- **Motivo:** cumpre "desligar sem mexer no código" e garante que as senhas nem cheguem ao navegador quando desligado.
- **Descartado:** variável lida em tempo de execução (as credenciais ficariam no pacote mesmo desligado).

## 10. Senhas e e-mails publicados

- **Decisão:** e-mails no domínio reservado `.invalid` (`<papel>@demo.fluxid.invalid`), que nunca entrega e-mail; senhas no formato `FluxID-Demo-NN!` (15 caracteres, com minúsculas, maiúsculas, números e símbolo), conforme a política atual de senha (12+, os 4 tipos).
- **Motivo:** o domínio reservado não colide com pessoas reais e não gera e-mail perdido; a senha passa nas validações existentes.
