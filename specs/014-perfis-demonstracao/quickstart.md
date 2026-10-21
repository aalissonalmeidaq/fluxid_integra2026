# Roteiro de validação: Spec 014

## Pré-requisitos

- Supabase local rodando (`npx supabase start`) e `npx supabase db reset`, que carrega o seed e os acessos de demonstração.
- App local (`npm run dev`).

## 1. Login com um acesso de teste (local)

1. Abra `/login` e acione **Acessos de teste**. Confira os 5 perfis, o aviso e o foco preso no modal.
2. Em **Usar este acesso de Administrador do tenant**, o formulário fica preenchido e o foco vai para **Entrar**; nada é enviado.
3. Entre: a Visão geral é do "Oxigênio Cariri" e o menu mostra só as telas do papel. Em Cilindros, o C262 aparece em estoque.
4. Repita com os outros 4 perfis (MS-002).
5. Em 360 px, confira que o modal cabe sem rolagem horizontal.

## 1a. Dados de exemplo (RF-018)

Como administrador de demonstração, confira em Cilindros os 13 cilindros (o C274 com teste vencido), em Clientes os 3 clientes de exemplo com unidade e geocerca, em Veículos e Motoristas a frota, em Viagens as viagens concluída, em andamento e planejada, e em Lacres e Alertas os 4 lacres simulados com bateria baixa, sinal fraco, lacre aberto e desligado. Entre como Motorista: a viagem em andamento aparece para ele.

## 2. Restrições (RF-016)

1. Como administrador de demonstração, tente convidar alguém em Pessoas da empresa: aparece "Convites não estão disponíveis na empresa da demonstração".
2. Em Esqueci minha senha, informe um e-mail de demonstração: a resposta é a de sempre, e nada é enviado.
3. Tente trocar a senha pela recuperação ou pelo cliente: é recusado.

## 3. Isolamento (MS-003)

Com cada perfil de demonstração, abra `/admin/tenants`, `/admin/lacres` e `/admin/auditoria-global`: "Acesso negado". Pelas funções, peça dados da Empresa A: resposta de registro inexistente.

## 4. Script contra o local

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<chave local> npm run operacao:demonstracao -- --permitir-fora-da-nuvem
```

Rode duas vezes: a segunda responde `unchanged` em tudo (MS-004). Bloqueie um vínculo e inative o C262 pelo app, rode de novo e confira que voltaram.

## 5. Nuvem

1. A pessoa responsável roda o script com a URL e a chave da nuvem.
2. O Master real aprova o lacre `DSP-P77E49TC` para o "Oxigênio Cariri" em Lacres da plataforma.
3. Roda o script de novo: o lacre fica vinculado ao C262.
4. No site publicado, entre com o administrador de demonstração e confira a posição e a saúde do lacre no C262 (MS-006).
5. Cadastre o segredo `SUPABASE_SERVICE_ROLE_KEY` no repositório e rode o workflow **Restaurar a demonstração** à mão uma vez.

## 6. Desligar (MS-005)

Gere o build com `VITE_DEMO_ACCESS=false` e confira que `dist/` não contém nenhum e-mail `@demo.fluxid.invalid`.
