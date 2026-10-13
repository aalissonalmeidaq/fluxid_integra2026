# Roteiro de teste em aparelho Android (T075)

**Spec**: `010-fila-offline-fotos-assinatura` | **Para**: pessoa responsável pela validação (Natã Baracho) | **Complementa**: [quickstart.md](./quickstart.md)

Este roteiro diz como preparar o ambiente, o que tocar no celular e o que anotar. **Foto pela câmera, perda e retorno de sinal e instalação do aplicativo** só se validam em um **Android com Chrome**; os testes automáticos cortam a rede e simulam a câmera e **não substituem** este roteiro. Todos os dados são fictícios e ficam no Supabase local.

Tempo previsto: cerca de 2 horas, com as medições. O preparo do ambiente (parte 1 a 3) é o mesmo do roteiro da Spec 009 (`specs/009-leitura-gps-campo/roteiro-android.md`): cabo USB, `adb reverse` e a massa `npm run campo:semear-roteiro`.

> **Instalação**: o Chrome só oferece "Instalar app" em **HTTPS com certificado confiável**. Pelo cabo (`localhost` por `adb reverse`) e por `npm run dev:rede` o aplicativo abre, mas **não instala**. Para os passos 19 e 20 use o endereço HTTPS de homologação combinado em T068 (registre-o em `validation.md`). Sem ele, esses dois passos ficam como pendência explícita.

## 1. Preparar

```bash
npx supabase stop
npx supabase start
npx supabase db reset
npm run campo:semear-roteiro
npm ci
npm run build
npm run preview -- --port 4173 --host 127.0.0.1
```

No celular: `adb reverse tcp:4173 tcp:4173` e `adb reverse tcp:54321 tcp:54321`; abra `http://localhost:4173` no Chrome. Entre com `reg-g-admin@example.invalid` e a senha `Local-only-020!`.

Para **cortar o sinal** no meio do teste use o modo avião do celular (o cabo USB continua ligado e o aplicativo enxerga "sem conexão"); para religar, desligue o modo avião e, se o `adb reverse` cair, repita os dois comandos acima.

## 2. Roteiro (marque o resultado de cada passo)

Os 21 passos são os do [quickstart.md](./quickstart.md). Para cada um, anote **Passou / Passou com ajuste / Reprovou**, a observação e, onde houver número, o valor medido.

| Passo | O que fazer | Resultado | Observação |
|---|---|---|---|
| 1 | Abrir a viagem A com conexão e iniciar o carregamento (a viagem fica guardada) | | |
| 2 | Modo avião; conferir os 4 cilindros por câmera e NFC | | indicador "4 pendentes"? |
| 3 | Fechar o aplicativo e abrir de novo (ainda sem sinal) | | a fila continua? |
| 4 | Tentar iniciar, cancelar e concluir offline | | desabilitados com o motivo? |
| 5 | Ler um cilindro de outra viagem offline | | "Não foi possível confirmar este código sem conexão."? |
| 6 | Desfazer uma conferência pendente | | |
| 7 | Voltar o sinal com o aplicativo aberto | | envio automático, uma vez cada? |
| 8 | Viagem em andamento: chegada e entrega da parada 1 offline, com GPS | | a entrega só sai depois da chegada? |
| 9 | Cortar o sinal no meio do envio e religar | | sem duplicar? |
| 10 | Cancelar a viagem B em outra sessão e voltar o sinal | | conflito preservado? |
| 11 | Descartar o conflito com justificativa | | exige conexão? |
| 12 | Trocar de conta no mesmo aparelho | | a fila da primeira não aparece? |
| 13 | Sair com pendências | | os três botões do aviso? |
| 14 | 3 fotos pela câmera real, tentar a quarta, registrar a entrega offline | | o registro chega antes das fotos? |
| 15 | Baixar uma foto enviada e conferir que não tem EXIF nem localização | | |
| 16 | Assinar com o dedo, limpar, assinar, salvar; testar em branco | | |
| 17 | Perfil sem `trip.recipient`: vê "com assinatura" sem a imagem? | | |
| 18 | Tenant B abrindo um anexo do Tenant A | | "não encontrado"? |
| 19 | Abrir o endereço HTTPS no Chrome e **Instalar app** | | abre em tela cheia? |
| 20 | Aplicativo instalado, modo avião: abrir, conferir, registrar uma entrega e voltar o sinal | | |
| 21 | Repetir 2, 8 e 14 só com teclado (leitor de tela se tiver) | | |

## 3. Métricas a medir com a pessoa responsável

| Métrica | Como medir | Resultado |
|---|---|---|
| MS-001 | viagem de 4 cilindros e 2 paradas, toda offline, enviada ao voltar a conexão | |
| MS-004 | entrega com 3 fotos e assinatura em 4G real: cronometrar do religar até "Nada pendente" | |
| MS-007 | instalação e abertura offline do aplicativo instalado por HTTPS real | |

## 4. Itens a corrigir

Liste aqui o que reprovou ou precisa de ajuste. Cada item corrigido exige repetir os testes e voltar a perguntar antes de fechar o ciclo.

## 5. Quem validou

Nome, aparelho (marca, modelo, versão do Android e do Chrome), duração e a confirmação de que as respostas podem ser gravadas em nome da pessoa: preencha na entrevista de validação humana (T077). **Nada neste arquivo é preenchido por inferência dos testes automáticos.**
