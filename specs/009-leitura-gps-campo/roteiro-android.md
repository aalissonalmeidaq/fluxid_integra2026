# Roteiro de teste em aparelho Android (T053)

**Spec**: `009-leitura-gps-campo` | **Para**: pessoa responsável pela validação (Natã Baracho) | **Complementa**: [quickstart.md](./quickstart.md)

Este roteiro diz, passo a passo, como preparar o ambiente, quais credenciais usar, o que tocar no celular e o que anotar. Câmera, NFC e GPS reais só se validam num **Android com Chrome**; os testes automatizados usam leituras simuladas e não substituem este roteiro. **Todos os dados são fictícios e ficam no Supabase local do computador.**

Tempo previsto: cerca de 1 hora e meia, com as medições.

---

## 1. O que você precisa

| Item | Detalhe |
|---|---|
| Computador | o do projeto, com Docker, Node e o repositório na branch `feat/009-leitura-gps-campo` |
| Celular Android | com **Chrome** atualizado, câmera, GPS e (para os passos de NFC) **NFC ligado** |
| Cabo USB | para ligar o celular ao computador |
| Etiquetas NFC | **ao menos 2**, graváveis ou não (só precisam ter número de série legível) |
| Segunda tela | outro monitor, tablet ou a folha impressa, para mostrar os QR Codes à câmera |
| Cronômetro | o do próprio celular |
| Aplicativo leitor de NFC | qualquer um que mostre o **UID** da etiqueta (por exemplo, "NFC Tools"), para anotar o número de série |

> **Por que cabo e não a rede Wi-Fi?** Câmera, NFC e GPS só funcionam em "contexto seguro" (HTTPS ou `localhost`). Com o cabo e o `adb reverse`, o celular enxerga o computador como `localhost`, sem certificado. Abrir o endereço da rede local (`http://192.168...`) **não serve**: o Chrome bloqueia a câmera, o NFC e o GPS.

---

## 2. Preparar o computador

Execute na raiz do repositório (PowerShell ou Git Bash):

```bash
# 1. Banco limpo e funções novas carregadas (função nova exige parar e iniciar)
npx supabase stop
npx supabase start
npx supabase db reset

# 2. Massa do roteiro: viagens, geocerca, cilindros de teste e a folha de códigos
npm run campo:semear-roteiro

# 3. Versão de produção do aplicativo
npm ci
npm run build
npm run preview -- --port 4173 --host 127.0.0.1
```

Deixe o terminal do `npm run preview` aberto.

**Posição da geocerca (opcional, recomendado).** A geocerca da unidade da parada 1 é um círculo de 150 m. Por padrão fica na Praça da Sé (São Paulo). Para você ficar **dentro** dela durante o teste, informe a sua posição ao semear (pegue as coordenadas no Google Maps, tocando e segurando no local):

```bash
# PowerShell
$env:ROTEIRO_LAT="-23.5503"; $env:ROTEIRO_LNG="-46.6339"; npm run campo:semear-roteiro
```

Se não alterar, o teste "dentro da geocerca" não será possível e o aparelho cairá em "fora da geocerca" (isso também é um resultado válido a registrar, ver passo 4).

O comando `campo:semear-roteiro` grava a **folha de códigos** em:

```
tests/support/tmp/roteiro-campo/codigos.html
```

Abra esse arquivo numa segunda tela (ou imprima). Ela traz os QR Codes, com o nome do cilindro e o valor escrito, **agrupados por finalidade** (viagem A, viagem B, consulta e isolamento). A pasta `tests/support/tmp/` não vai para o Git.

> Cada vez que rodar `campo:semear-roteiro`, ele cria viagens e cilindros **novos** (nada é apagado). Para recomeçar do zero use `npx supabase db reset` e semeie de novo.

---

## 3. Ligar o celular ao computador

1. No celular: **Configurações → Sobre o telefone**, toque 7 vezes em "Número da versão" e depois, em **Opções do desenvolvedor**, ligue **Depuração USB**.
2. Ligue o cabo e aceite "Permitir depuração USB?".
3. No computador, instale o `adb` se não tiver (Android Platform Tools) e confira:

```bash
adb devices                    # o aparelho deve aparecer como "device"
adb reverse tcp:4173 tcp:4173  # o aplicativo
adb reverse tcp:54321 tcp:54321  # o Supabase local
```

4. No Chrome do celular abra: **`http://localhost:4173`**. A tela de entrada do FluxID deve aparecer.
5. Opcional, para ver o console: no Chrome do computador abra `chrome://inspect` e inspecione a aba do celular.

**Confira antes de começar:**
- o aplicativo abre e mostra a entrada;
- o aviso de conexão **não** indica "Sem conexão" depois de entrar (se indicar, repita o `adb reverse tcp:54321 tcp:54321`);
- em **Configurações do site** do Chrome (cadeado ao lado do endereço) a **câmera**, a **localização** e o **NFC** estão como "Perguntar" ou "Permitir".

---

## 4. Credenciais

Todas são sintéticas do ambiente local e valem só no Supabase local.

| Uso | E-mail | Senha | Organização |
|---|---|---|---|
| **Principal do roteiro** (administrador, vê viagens, cilindros, recebedor) | `reg-g-admin@example.invalid` | `Local-only-020!` | Tenant G Sintético |
| Isolamento (só a semente usa; o cilindro dele é lido no passo 2) | `reg-h-admin@example.invalid` | `Local-only-021!` | Tenant H Sintético |
| Perfil de motorista, para conferir o que **não** aparece | `reg-g-driver@example.invalid` | `Local-only-023!` | Tenant G Sintético |

- Entre com a conta **principal** em todos os passos, exceto onde dito.
- **Auditor (passo 11):** o ambiente local não traz um usuário com o papel de auditor. A consulta do auditor sem ação de escrita já é coberta por `tests/e2e/campo-consulta.spec.ts`. Se você tiver um usuário auditor, use-o; senão anote "coberto por teste automatizado, não validado em aparelho".
- Se o aplicativo pedir segundo fator, anote: nessas contas locais não deve pedir.

---

## 5. Antes do passo 1: etiquetas NFC

Os QR Codes já vêm cadastrados. As etiquetas NFC precisam ser cadastradas por você, porque o número de série é o da **sua** etiqueta.

1. Com o aplicativo leitor de NFC, encoste a etiqueta e anote o **UID em hexadecimal** (ex.: `04:A2:3B:1C:5D:6E:80`).
2. No FluxID, entre com a conta principal, abra **Cilindros**, procure `ROT-` e abra um cilindro da **viagem A** (use os dois cilindros da **parada 1**).
3. No detalhe, em identificadores, toque em **Acrescentar identificador**, escolha o tipo **Etiqueta NFC** com o UID **sem os dois-pontos e em maiúsculas** (ex.: `04A23B1C5D6E80`). Toque em **Salvar identificador**.
4. Repita com a segunda etiqueta no outro cilindro da parada 1.

Esses dois cilindros serão lidos **por NFC**; os outros dois da viagem A serão lidos **pela câmera**.

Para o **passo 10** (formato errado), cadastre numa terceira etiqueta (num cilindro livre, por exemplo `CONS-…`) o UID **em decimal** (ex.: `1234567890`) em vez do hexadecimal.

---

## 6. Roteiro

Marque cada item e anote o resultado. Os textos entre aspas são os que a tela deve mostrar.

### Parte A: conferir lendo (história 1)

**Passo 1. Conferir o carregamento lendo.**
1. Abra **Viagens** → a **viagem A** (4 cilindros, 2 paradas) → **Iniciar carregamento**.
2. Toque em **Ler cilindro**. A janela abre, com os modos **Câmera** e **NFC**. Aceite a permissão da câmera.
3. Na **Câmera**, aponte para os QR Codes dos 2 cilindros da **parada 2** (folha de códigos, grupo "Viagem A").
4. Troque para **NFC** e encoste as 2 etiquetas (cilindros da parada 1).
- **Esperado:** cada leitura mostra "Cilindro … conferido." na hora; a contagem chega a **"4 de 4 conferidos"**; ao fechar a janela, os 4 aparecem conferidos e o histórico da viagem mostra o método ("conferido por câmera" e "conferido por NFC"). Nenhum valor lido aparece no histórico.

**Passo 2. Recusas.** Reabra **Ler cilindro** e leia, um a um:
- um cilindro da **viagem B** (outra viagem);
- um cilindro da viagem A **já conferido**;
- o cilindro de **outra organização** (grupo "Isolamento");
- o **código inexistente** (grupo "Isolamento").
- **Esperado:** "Cilindro … não pertence a esta viagem." (primeiro; com `trip.read` acrescenta "Está reservado na viagem n.º …"), "Cilindro … já estava conferido." sem evento novo (segundo); os dois últimos mostram **exatamente o mesmo texto**: **"Cilindro não encontrado."** (o do outro tenant não pode ser distinguido do inexistente). A contagem não muda.

**Passo 3. Desfazer e repetir.**
1. Feche a janela e **desfaça** a conferência de um cilindro.
2. Abra **Ler cilindro** e leia esse cilindro duas vezes seguidas, rápido.
- **Esperado:** volta a "conferido" e **conta uma vez só** (contagem sobe 1, não 2).

### Parte B: GPS (história 2)

**Passo 4. Iniciar e chegar com GPS.**
1. **Iniciar viagem**.
2. Na **parada 1**, toque em **Chegada com a posição**, depois em **Usar minha posição** e **Permitir** a localização.
- **Esperado:** aparecem latitude, longitude, **precisão**, hora e "Origem: GPS". Se você semeou com a sua posição, "**dentro** da geocerca" com a distância; senão, "**fora** da geocerca". Registre a chegada: a parada fica "No local" e, se fora da cerca, isso é **aceito e destacado em texto**.
- **Anote:** a precisão mostrada (em metros) e se a geocerca bateu com o esperado.

**Passo 5. Entregar lendo.**
1. Na parada 1, **Registrar entrega**.
2. Toque em **Ler cilindro** dentro da entrega e leia os 2 cilindros previstos (câmera ou NFC): eles marcam "entregue". Leia também um cilindro da parada 2: deve ser **recusado** ("Cilindro … não está previsto nesta parada.").
3. Informe nome e função do recebedor, toque em **Usar minha posição** e **salve**.
- **Esperado:** parada "entregue", método por cilindro, origem **GPS** e precisão no histórico; **nenhuma coordenada** nos textos do histórico para quem não tem acesso. A leitura **nunca salva sozinha**: só o botão salva.

**Passo 6. Precisão ruim e posição velha.**
1. Na parada 2, **Chegada com a posição** → **Usar minha posição** **em ambiente fechado** (ou com o GPS em modo economia) até a precisão ficar pior que **100 m**. Se não conseguir, anote "não reproduzido".
2. Esperado: aviso "Precisão baixa (cerca de … m). Você pode salvar mesmo assim." e o registro **é permitido**.
3. Em outra leitura, aguarde **mais de 2 minutos** com a posição já lida e salve.
- **Esperado:** a posição velha é **descartada e lida de novo**, com aviso, antes de salvar.

**Passo 7. Permissão negada.**
1. Em **Configurações do site → Localização**, **bloqueie** a localização.
2. Toque em **Usar minha posição**.
- **Esperado:** texto com o motivo, botão **Tentar de novo** e as alternativas: coordenadas digitadas e (só na **entrega**) "no endereço da unidade". Os outros campos do formulário **não se perdem**. Libere a localização de novo ao terminar.

**Passo 8. Coordenadas digitadas.**
1. Digite coordenadas nos campos e toque em **Usar minha posição**.
- **Esperado:** pede **confirmação** antes de substituir; ao aceitar, origem **GPS**. Depois edite um número: a origem passa a **"informada"**.

### Parte C: situações especiais

**Passo 9. Sem suporte.** No **computador** (Chrome ou Firefox desktop, sem câmera), abra `http://localhost:4173`, entre e abra a conferência de uma viagem.
- **Esperado:** o botão **Ler cilindro** não aparece (ou a janela só oferece o que existe), o texto explica "indisponível neste aparelho. Digite o código ou use um leitor", e a **conferência manual**, o código digitado e o leitor tipo teclado seguem completos.

**Passo 10. NFC fora do formato.** No celular, abra **Ler cilindro** e encoste a etiqueta cadastrada em **decimal** (preparada na seção 5).
- **Esperado:** "Cilindro não encontrado." **com a dica** "Confira o formato do valor cadastrado." Anote o formato do UID que o seu aparelho entrega (se vem com `:` e em maiúsculas).

**Passo 11. Consultar (história 3).**
1. **Cilindros** → **Ler cilindro** e leia, do grupo "Consulta":
   - o cilindro **ativo** (`CONS-…`): abre o **detalhe** certo;
   - o identificador **desativado** (`CONSDESAT-…`): "Este identificador foi desativado." e indica o cilindro a que valia;
   - o cilindro **inativo** (`CONSINAT-…`): abre o **detalhe** do cilindro, que mostra a situação **inativo**
2. Se houver um usuário auditor, repita como auditor: a consulta funciona e **nenhuma ação de escrita** aparece.

### Parte D: acessibilidade, offline e leitor parado (história 4)

**Passo 12. Teclado e offline.**
- **Teclado:** no computador, em janelas de 360, 768 e 1920 px de largura, repita os passos 1, 4 e 5 **só com o teclado** (Tab, Shift+Tab, Enter, Escape). Esperado: foco preso na janela de leitura, **Escape fecha e devolve o foco ao botão**, resultado anunciado, **sem rolagem horizontal**.
- **Offline:** no celular, com a janela de uma conferência aberta, **desligue o túnel**: `adb reverse --remove tcp:54321` (isso derruba só o Supabase). Esperado: a barra mostra "Sem conexão"; a leitura e a posição ainda abrem, mas **confirmar, conferir e salvar ficam desabilitados com o motivo**; nada é gravado. Religue com `adb reverse tcp:54321 tcp:54321` e confirme que volta a funcionar.

**Passo 13. Leitor parado.** Abra **Ler cilindro** e **não leia nada por 2 minutos** (cronometre).
- **Esperado:** a câmera e o NFC **desligam** (a luz da câmera apaga), a tela avisa em texto e oferece **Continuar lendo**; a janela e os resultados já lidos **continuam**; ao tocar em **Continuar lendo**, a leitura volta.

---

## 7. Medições (preencher com tempo real)

Cada medição com a **pessoa que vai usar de verdade**, sem treino prévio quando indicado. Ressalve na observação qualquer repetição ou falha.

| Métrica | Como medir | Meta | Tempo medido | Resultado | Observações |
|---|---|---|---|---|---|
| **MS-001** | **Viagem B (10 cilindros)**: abrir **Ler cilindro** e cronometrar até "10 de 10 conferidos", lendo os 10 QR Codes | até **3 min** | | | |
| **MS-002** | Chegada **e** entrega completas com GPS numa parada, do toque em "Chegada com a posição" até a entrega salva | até **90 s** | | | |
| **MS-007** | **Uma pessoa que nunca usou** o app: de "Cilindros" até o detalhe do cilindro certo, lendo o código | até **20 s** | | | |

**Limites a confirmar no aparelho** (a spec os fixou, aqui eles se validam):

| Limite | Valor da spec | Confirmado? | Observações |
|---|---|---|---|
| Posição válida | 2 minutos | | |
| Tempo máximo de leitura do GPS | 15 segundos | | |
| Precisão que gera aviso | pior que 100 m | | |
| Leitor para sozinho | 2 minutos sem leitura | | |

**Confirmações do aparelho:**

| Verificação | Resultado |
|---|---|
| Modelo do aparelho, versão do Android e do Chrome | |
| Leitura por câmera funcionou (os QR Codes foram reconhecidos) | |
| O Chrome do aparelho tem o detector nativo de códigos (se não tiver, o botão de câmera não aparece: anotar) | |
| Leitura NFC funcionou (UID chega ao app) | |
| Formato do UID que o aparelho entrega e se casou com o cadastrado em hexadecimal | |
| Precisão típica do GPS ao ar livre / em ambiente fechado | |

---

## 8. Se algo não funcionar

| Sintoma | O que fazer |
|---|---|
| `adb devices` não lista o aparelho | trocar o cabo (precisa ser de dados), reaceitar a depuração USB |
| Página não abre no celular | conferir o `npm run preview` aberto e `adb reverse tcp:4173 tcp:4173` |
| Entrar dá erro ou "Sem conexão" | `adb reverse tcp:54321 tcp:54321`; conferir `npx supabase status` |
| "Esta conta não pode abrir mais sessões" | `npx supabase db reset` e semear de novo (as sessões somem) |
| Botão **Ler cilindro** não aparece no celular | o Chrome desse aparelho não tem o detector de códigos nem NFC: anotar o modelo e a versão (é um resultado válido) |
| Câmera pede permissão e nada abre | Configurações do site → Câmera → Permitir; feche e abra a janela de novo |
| NFC não lê | ligar o NFC no sistema, encostar a etiqueta na parte traseira, na altura da antena; algumas etiquetas não expõem UID legível |
| GPS demora ou fica ruim | sair para céu aberto; ligar a **localização de alta precisão** no Android |
| Esqueceu quais cilindros usar | abrir `tests/support/tmp/roteiro-campo/codigos.html` (ou `codigos.json`) |

---

## 9. Depois do roteiro

1. Passe os resultados desta página (passos, tempos, limites e aparelho) para o agente, que os grava em `specs/009-leitura-gps-campo/validation.md`. **Não são inferidos de testes automatizados.**
2. Se algum passo **falhar**, anote qual, o texto que apareceu e o aparelho. O item é corrigido, os testes repetem e o passo é refeito.
3. Em seguida é a **entrevista de validação humana** (quem validou; amostra de perfis, telas, larguras e fluxos; ambiente; duração; resultado e itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` com justificativa; e a confirmação de que as respostas podem ser gravadas em seu nome), que alimenta o registro de uso de IA (RIA).

Para encerrar o ambiente: `Ctrl+C` no `npm run preview`, `adb reverse --remove-all`, e (opcional) `npx supabase stop`.
