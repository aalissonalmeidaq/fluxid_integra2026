# Validação: Spec 013

Registro das medições e das rodadas de teste desta spec. As medições com o lacre físico e a validação humana entram nas seções próprias
quando acontecerem (T067 e T070).

## Firmware (T056)

Build do ambiente `esp32c3` como no CI (com `include/secrets.example.h` no lugar do `secrets.h` local), no contêiner `fluxid-pio:6.1.16`:

| Medida | Linha de base (T003) | Com o portal (19/10/2026) |
|---|---|---|
| RAM | 12,3% (40.332 de 327.680 bytes) | 12,9% (42.412 bytes) |
| Flash | 69,0% (904.918 de 1.310.720 bytes)\* | 88,5% (1.159.972 bytes) |
| Página do portal embutida | — | 11.135 bytes |
| Testes nativos (`pio test -e native`) | 57 | 94, todos passaram |

\* A linha de base foi compilada com o `secrets.h` local da bancada; a medição nova, com o modelo de segredos, como o CI. A flash ficou
abaixo do limite de alerta de 95% (`research.md`, item 10), então a partição atual continua.

## Pacote de entrada (T064)

`dist/assets/index-*.js`: **606.906 bytes**, 972 bytes (0,16%) acima da linha de base de 605.934 bytes; o limite era de mais 5%
(636.230 bytes). A tela `/admin/lacres` está no chunk próprio `platform-seals-page-*.js`, carregado por `React.lazy` só quando o Master a abre.

## Publicação no Supabase em nuvem (T068, 20/10/2026)

Publicada a partir da branch, antes do merge, por decisão do responsável (o site da `main` fica sem o cadastro manual e sem a tela
do Master até o merge):

- `db push --dry-run` e `db push`: as 8 migrations `20261019120000` a `20261019120700`, sem seed;
- `functions deploy`: `platform-seals` nova e as funções alteradas; `public-compatibility` responde 200 (`002.1`), `seal-gateway` e
  `platform-seals` respondem 401 sem credencial;
- `seal_portal_password` gravado no Vault da nuvem (8 caracteres), sem o valor aparecer em arquivo ou histórico;
- estado da nuvem antes da bancada: 1 Master, nenhum tenant, nenhum lacre da Spec 012, `fluxid-seal-watchdog` ativo;
- lacre `DSP-P77E49TC` gravado com o endereço HTTPS da nuvem: a primeira chamada falhou na conferência do certificado
  (`X509 - Failed to verify certificate`). O Supabase envia a GTS Root R4 assinada em cruz pela GlobalSign Root CA, e o
  `esp_crt_bundle` do arduino-esp32 2.0 procura só o emissor; a GlobalSign Root CA saiu da lista do Mozilla. Com ela no pacote
  (exportada do repositório de raízes do Windows, SHA-256 conferido), a chamada respondeu `202` e o pedido apareceu `pending` na nuvem.

## Rodadas automáticas

| Data | Rodada | Resultado |
|---|---|---|
| 19/10/2026 | `npx supabase test db` (Fundação, US2 e US3) | 128 arquivos, 3.228 testes, todos passaram |
| 19/10/2026 | `npm run test:live` | 31 arquivos: 27 passaram e 3 foram pulados (medição de desempenho); 1 falhou numa lista fixa do menu sem a tela nova (`navigation-permissions.live`), corrigida e repetida com 14 de 14 |
| 19/10/2026 | Playwright `lacres-plataforma`, `lacres-cadastro` (Chromium, 360 px, WebKit) | 21 de 21 e 20 de 20 |
| 19/10/2026 | Playwright `portal-lacre` (360, 768 e 1920 px e WebKit) | 36 de 36 |
| 20/10/2026 | Rodada completa (T066), depois da remoção do segundo fator | `lint` e `typecheck` sem erro; `supabase test db`: 130 arquivos, todos passaram; `test:live`: 134 passaram e 1 caiu por queda de conexão do Supabase local na suíte de volume (`SocketError: other side closed`), repetida sozinha com 9 de 9; `test:coverage`: 397 arquivos, 5.819 testes, 90,12% das instruções e 84,97% dos ramos; Playwright (Chromium 1280, 360, 768, 1920 e WebKit): 1.967 passaram e 4 falharam em testes ajustados nesta mudança (o registro do desbloqueio excepcional agora grava `aal1`), corrigidos e repetidos com 121 de 121; capturas no Linux: 285 de 285 (as três da tela de verificação em duas etapas foram removidas); firmware: 98 testes nativos e build `esp32c3` com RAM 13,0% e flash 88,8% |

## Bancada com o lacre físico (T067, 19 e 20/10/2026)

ESP32-C3 Super Mini gravado do zero (flash apagada e LittleFS vazio) com o firmware único. Código do chip `DSP-P77E49TC`, rede de
configuração `FluxID-Lacre-49TC`.

- A rede de configuração não aparecia no celular: abria com a potência máxima e o lacre varria os canais sem rede salva. Corrigido
  (8,5 dBm na rede de configuração e nenhuma varredura sem rede para tentar) e confirmado por uma varredura ativa do computador.
- Senha da rede de configuração com exatamente 8 caracteres (RF-022), gravada no firmware e no Vault.
- Rede padrão da plataforma `FluxID` (RF-023): o lacre conectou por ela sozinho (-37 a -43 dBm) e a página do portal mostra a
  conexão atual (RF-024).
- Supabase local: o pedido chegou com `HTTP 202` no primeiro envio depois de conectar, dentro de 1 minuto, e o lacre foi aprovado
  para o Tenant A. Para alcançar o computador pela rede "FluxID", a regra de firewall da porta 54321 passou a valer também no
  perfil Público e os bloqueios do Docker Desktop no perfil Público foram desativados, a pedido do responsável; os dois devem ser
  desfeitos ao fim da bancada.
- Nuvem: ver a seção "Publicação no Supabase em nuvem". O pedido do lacre chegou `pending` pela rede `FluxID`.
- Validação humana: Alisson Almeida, 40 minutos, perfis Master e administrador do Tenant A, lacre físico e celular Android no portal,
  Windows 11 e Chrome. Resultado: aprovado.
- **Não cronometrados:** MS-001 (configurar a rede pelo celular em até 3 min) e MS-003 (o lacre aparecer no tenant até 1 min
  depois da aprovação). MS-002 foi observado nos registros do lacre e do banco (o pedido chegou no primeiro envio, dentro de 1 min).
