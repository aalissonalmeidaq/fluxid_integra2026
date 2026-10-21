# Contrato: botão e modal "Acessos de teste" na tela de login

## Onde aparece

- Na tela de login (`/login` e na entrada pela Visão geral sem sessão), dentro da moldura pública, abaixo do formulário.
- Só quando `VITE_DEMO_ACCESS` não for `false`. Ausente ou qualquer outro valor: aparece. `false`: nem o botão nem os dados entram no pacote publicado.

## Botão

- Rótulo: **"Acessos de teste"**, botão secundário, área de toque de 44 px.
- Abre o modal e guarda o foco para devolver ao fechar.

## Modal

- Título: **"Acessos de teste"** (anunciado como nome do diálogo).
- Texto de abertura: "Use um destes acessos para conhecer o FluxID como cada perfil da empresa Oxigênio Cariri."
- Aviso (alerta neutro): "Estes acessos são públicos e valem só para a empresa da demonstração. Os dados podem ser alterados por outros visitantes: não cadastre dados reais."
- Lista dos 5 perfis, na ordem do JSON. Cada item:
  - nome do papel (título do item);
  - descrição curta;
  - e-mail e senha em texto visível, selecionáveis;
  - botão **"Usar este acesso"**, com nome acessível "Usar este acesso de <papel>" (o papel vai só para o leitor de tela; o nome contém o texto visível, WCAG 2.5.3).
- Rodapé: botão **"Fechar"**.

## Comportamento

| Ação | Resultado |
|---|---|
| "Usar este acesso" | preenche e-mail e senha do formulário, fecha o modal, foco no botão "Entrar"; não envia |
| Escape, clique fora ou "Fechar" | fecha sem mudar o formulário; foco volta ao botão "Acessos de teste" |
| Tab | o foco fica dentro do modal |

## Acessibilidade e layout

- WCAG 2.2 AA: contraste, foco visível, `role="dialog"` com nome, lista com itens nomeados.
- 360 px a desktop sem rolagem horizontal; em 360 px os itens ficam um abaixo do outro e o modal rola por dentro.
- Só tokens do design system (Spec 005), sem valor arbitrário.

## Mensagens das restrições (RF-016)

| Situação | Texto |
|---|---|
| Convite na empresa da demonstração | "Convites não estão disponíveis na empresa da demonstração." |
| Devolver o lacre de bancada | "Este lacre faz parte da demonstração e não pode ser devolvido à plataforma." |

A troca de senha de uma conta de demonstração não tem tela: a página de nova senha só abre por um link de recuperação, que não é enviado a contas de demonstração. O bloqueio fica no gatilho do Auth e é testado pela suíte `.live`.

> Textos visíveis: desde 20/10/2026 o sistema diz "empresa" no lugar de "tenant" (pedido do responsável, T043). Os códigos (`tenant_admin`, `scope = 'tenant'`) não mudam.
