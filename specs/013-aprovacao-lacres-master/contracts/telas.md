# Contrato: telas

## `/admin/lacres` — Lacres da plataforma (Master, `platform.manage`; sem segundo fator, RF-021)

- Item "Lacres da plataforma" no menu, ao lado de "Organizações".
- Abas por situação: Aguardando (padrão), Em operação, Devolvidos, Recusados, Expirados. Cada aba mostra a contagem. Filtro "Só com conflito".
- **Tabela**, que vira cartões abaixo de 768 px: código, situação com ícone e texto, marca de conflito ("Outro aparelho com este código"), primeira e última chamada, chamadas, sinal em texto, rede e firmware. Em "Em operação" também aparece o tenant.
- **Ações por linha:**
  - **Aprovar:** diálogo com o seletor de tenant, o código em destaque para conferir ("Confira se é o código do lacre em mãos") e a justificativa (5 a 500).
  - **Recusar:** diálogo com justificativa.
  - **Retirar de operação:** diálogo com justificativa e a escolha entre "Manter a rede principal (aprovar de novo no mesmo tenant)", a opção padrão, e "Esquecer todas as redes (destinar a outro tenant)".
  - **Destinar de novo:** em Devolvidos, o mesmo diálogo de Aprovar. Em Recusados, "Reconsiderar e aprovar", também com o mesmo diálogo.
  - **Resolver conflito:** diálogo que explica as duas saídas ("Aceitar a chave do aparelho novo", indicada para lacre reinstalado, e "Manter a chave atual") com justificativa. Num lacre em operação, a ação explica que é preciso retirá-lo antes.
  - **Esquecer todas as redes:** nos pedidos fora de operação que ainda têm redes do tenant anterior. O diálogo pede justificativa e explica que, sem rede configurada no novo local, o lacre volta ao portal.
  - Aprovar fica desabilitado com conflito, e o motivo aparece em texto.
  - **Redes de outro tenant:** se o tenant escolhido for diferente do último e o lacre ainda não tiver confirmado o esquecimento das redes, o diálogo avisa "Este lacre ainda pode ter redes do tenant [nome do último tenant]. Use 'Esquecer todas as redes' e configure a rede no novo local." e Aprovar fica desabilitado. A linha mostra "Aguardando o lacre esquecer as redes" enquanto o pedido de esquecimento estiver aberto.
- **Bloco "Rede de configuração":** o padrão do nome (`FluxID-Lacre-` + 4 últimos caracteres do código), o passo a passo do primeiro contato e o botão "Mostrar a senha", que pede o motivo da consulta (5 a 500), revela com auditoria e mostra a senha num campo copiável. Sem botão de troca; o texto diz que a senha é fixa no firmware.
- **Estados:** carregando, vazio por aba ("Nenhum lacre aguardando aprovação"), erro com "Tentar novamente" e sem conexão. A lista atualiza a cada 30 s e anuncia novos pedidos por `aria-live="polite"`, sem mover o foco.

## `/lacres` (tenant), mudanças

- Sai o botão "Cadastrar dispositivo". Entra um aviso quando não há lacres: "Os lacres chegam pelo Master da plataforma. Peça a destinação de um lacre ao seu tenant."
- Marca "Pronto para vincular" (ícone e texto) nos lacres ativos sem cilindro, com a data da aprovação.
- Filtro novo: "Só prontos para vincular".
- A lista recarrega sozinha com o aviso em tempo real `device` (aprovação, retirada ou devolução), sem mover o foco; a consulta a cada 30 s continua como reserva (MS-003).

## `/lacres/:id` (tenant), mudanças

- Saem "Gerar chave nova" e "Desativar". Entra "Devolver à plataforma" (`seal.admin`), num diálogo com justificativa. Com o cilindro em viagem, o botão fica desabilitado e o motivo aparece em texto.
- Fatos novos: "Aprovado em" e "Origem: aprovado pelo Master" (ou "cadastro manual (Spec 012)" nos lacres antigos).

## Padrão visual

Spec 005 e design system: só tokens, Montserrat, ícones do projeto e WCAG 2.2 AA, de 360 px a desktop. A página do portal do lacre segue as cores e a tipografia de sistema, mas mora no firmware e tem contrato próprio (`portal-do-lacre.md`).
