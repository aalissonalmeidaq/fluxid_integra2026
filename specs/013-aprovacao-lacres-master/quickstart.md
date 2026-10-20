# Roteiro de validação: Aprovação e destinação de lacres pelo Master

## Pré-requisitos

- Supabase local com as migrations da Spec 013 (`npx supabase db reset`) e as funções servidas de novo (`npx supabase stop` e `npx supabase start`).
- Senha padrão local no Vault (uma vez por reset), sem gravar em arquivo versionado:
  ```sql
  select vault.create_secret('<senha-padrão-de-teste>', 'seal_portal_password', 'Spec 013: senha da rede de configuração');
  ```
- Firmware com `include/secrets.h` contendo só `FLUXID_URL` e `FLUXID_PORTAL_SENHA` (a mesma do Vault). Sem código, chave nem rede.
- Usuário Master do seed (`master@example.invalid`) (só e-mail e senha, RF-021), e o administrador do Tenant A.

## 1. Automático

```bash
npm run lint && npm run typecheck
npm test
npx supabase test db          # 013_*: pedidos, aprovação, devolução, dois tenants, auditoria
npm run test:live             # simulador pedindo aprovação, Master aprovando, tenant vendo
npm run build && npm run test:e2e
cd firmware && pio test -e native && pio run -e esp32c3
```

## 2. Simulador

1. `node scripts/lacre/simulador.mjs --cenario pedir-aprovacao --device DSP-NOVO0001 --key fxk_teste-local`: a resposta é `202 pending_approval`, e o pedido aparece em `/admin/lacres`, aba Aguardando, em até 1 minuto (MS-002).
2. O Master aprova para o Tenant A, com justificativa. Na chamada seguinte, o simulador recebe `200`. Em `/lacres` do Tenant A, o lacre aparece como "Pronto para vincular" em até 1 minuto (MS-003). O Tenant B não o vê.
3. Repetir o pedido com o mesmo código e outra chave: `401` e a marca de conflito em `/admin/lacres`. Em "Resolver conflito", manter a chave atual: a marca some e o simulador original segue recebendo `200`.
4. O administrador do Tenant A devolve o lacre com justificativa: ele sai de `/lacres` e aparece em Devolvidos. Antes de o simulador chamar de novo, tentar destinar ao Tenant B: Aprovar fica desabilitado com o aviso das redes do tenant anterior (`NETWORKS_NOT_CLEARED`). Na chamada seguinte (cenário `devolucao`), o simulador recebe `forget_networks: "all"` e responde com `networks_forgotten`. Destinar ao Tenant B: o B o vê sem nenhum histórico do A.
5. Retirar o lacre do B com "Manter a rede principal": o simulador recebe `forget_networks: "extras"`. Usar "Esquecer todas as redes" na linha do pedido e conferir que, depois do `networks_forgotten`, o lacre pode ir para o Tenant A.

## 3. Lacre físico

1. Gravar o firmware novo (um só para todos os lacres). Ao ligar sem rede salva, a rede `FluxID-Lacre-XXXX` aparece.
2. O Master abre `/admin/lacres` → Mostrar a senha, informando o motivo. No celular, entrar na rede com essa senha: a página abre sozinha com o código do lacre e as redes ao alcance. Cronometrar até o "Conectado" (MS-001: até 3 minutos).
3. Testar com a senha errada: a página diz "senha errada" e nada é guardado.
4. Aprovar no `/admin/lacres` e vincular a um cilindro no Tenant A: as posições aparecem com a geocerca, como na Spec 012.
5. Segurar o botão BOOT por 5 s: a rede de configuração reabre e o lacre continua usando a rede atual até uma nova ser testada. A página de sucesso diz "Conectado. O lacre voltou a operar com a nova rede".
6. Devolver o lacre com ele ligado: ele apaga as redes e abre a rede de configuração. Desligar, configurar outra rede pelo portal e conferir em `/admin/lacres` que o esquecimento foi confirmado.
