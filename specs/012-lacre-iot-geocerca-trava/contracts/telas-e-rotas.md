# Contrato: telas, rotas e notificações

**Atende**: RF-011, RF-024, RF-025, RF-031 a RF-036d, RF-042, RF-043, RNF-001, RNF-005, RNF-006, CA-005, MS-008, MS-009

Todas as telas seguem o padrão visual da Spec 005 e as decisões do `AGENTS.md` (largura total, menu lateral a partir de 768 px, gaveta no celular, só tokens, foco visível, `prefers-reduced-motion`), com a skill `ui-ux-pro-max`. Rotas carregadas por `React.lazy` numa área nova, `SealsArea`, como `TripsArea`. O mapa usa `src/components/maps` (Leaflet sob demanda) e sempre tem a lista de posições como alternativa em texto. A saúde, a trava e a severidade nunca dependem só de cor: ícone e texto sempre juntos.

## Rotas

| Rota | Tela | Permissão |
|---|---|---|
| `/lacres` | Lista de lacres: tabela a partir de 768 px, cartões abaixo; filtros por saúde, trava e "sem cilindro"; botão "Cadastrar dispositivo" (`seal.admin`) | `seal.read` |
| `/lacres/:id` | Detalhe do dispositivo: saúde, trava, bateria, rede em uso, redes guardadas, vínculo, últimas posições (mapa e lista), comandos e alertas; ações conforme a permissão | `seal.read` |
| `/alertas` | Lista real de alertas (substitui a fonte de exemplo): filtros por situação, severidade e tipo; detalhe com a última posição no mapa; reconhecer e encerrar | `seal.read` |
| `/alertas/:id` | Detalhe do alerta, destino do toque na notificação (depois do login e respeitando a permissão, RF-036c) | `seal.read` |

## Blocos em telas existentes

| Tela | Bloco novo |
|---|---|
| Detalhe do cilindro (Spec 006) | "Lacre": última posição no mapa, idade em texto ("há 2 minutos"), qualidade, bateria, saúde, trava física e comando em curso; vincular ou desvincular (`seal.operate`); travar e destravar com justificativa |
| Detalhe da viagem (Spec 008) | coluna "Trava física" ao lado do bloqueio lógico, por cilindro ("travada", "destravada", "travamento pendente" até 30 min, "não confirmada", "travada por violação de geocerca", "travada por perda de comunicação", "sem lacre"); mapa com a última posição dos cilindros com lacre e o caminho recente |
| Entrega (Spec 008) | depois de salvar, a explicação de por que o destravamento não foi automático (fora da geocerca, sem posição que comprove, unidade sem geocerca) e o atalho para o destravamento excepcional |
| Perfil (`/perfil`) | "Notificações deste aparelho": ativar ou desativar, com o estado da permissão do navegador e a explicação para iPhone (instalar na tela de início) |

## Modais

- **Cadastrar dispositivo**: rótulo e intervalo; depois de salvar, mostra o código e a chave **uma vez**, com "Copiar" e o aviso de que ela não aparece de novo; fechar exige confirmar que copiou. A chave nunca vai para o armazenamento local nem para a fila offline.
- **Gerar chave nova**: confirmação com o aviso de que a chave atual para de funcionar na hora.
- **Vincular lacre**: escolher o cilindro pela leitura do identificador (Spec 009) ou pela lista, ou escolher o lacre na lista de lacres ativos sem cilindro.
- **Travar / Destravar**: justificativa; quando é exceção, pede o segundo fator como o desbloqueio excepcional da Spec 008.
- **Adicionar rede Wi-Fi**: nome e senha (campo de senha, sem guardar nem mostrar de novo) ou "rede aberta"; aviso de risco com viagem ou vigilância; limite de 5 redes.
- **Encerrar alerta**: observação obrigatória.

## Estados de tela

| Estado | Comportamento |
|---|---|
| Carregando | esqueleto do bloco, sem saltos de layout |
| Vazio | "Nenhum lacre cadastrado", "Nenhum alerta aberto", "Cilindro sem lacre" com a próxima ação |
| Erro | mensagem com "Tentar de novo", sem detalhe técnico |
| Offline | última informação conhecida com o horário; comandos desabilitados com o motivo; nada entra na fila offline da Spec 010 (RF-043) |
| Tempo real | aviso discreto "Atualizado há X s"; mudança anunciada por região `aria-live="polite"` sem roubar o foco (História 1, cenário 7; História 6, cenário 7) |
| Tempo real indisponível | consulta a cada 30 s e mostra "Atualização automática a cada 30 s" |

## Notificação push (RF-036a a RF-036d)

| Item | Regra |
|---|---|
| Quando | `possible_loss` (só em viagem ou vigilância), e todo alerta alto ou crítico; uma por aparelho por alerta; uma de retorno quando o lacre volta |
| Título | "FluxID — possível extravio", "FluxID — violação de geocerca", etc. |
| Texto | tipo, código do cilindro e horário; **sem** coordenada, cliente ou nome de pessoa (CA-010) |
| Toque | abre `/alertas/:id`; sem sessão, passa pelo login e volta |
| Serviço | `public/push-sw.js`, importado pelo service worker gerado (`workbox.importScripts`) |
