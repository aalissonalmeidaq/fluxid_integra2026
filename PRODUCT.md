# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Gestor logístico e estoquista, no desktop: planejam frota, viagens e paradas, conferem entradas e saídas e tratam divergências.
- Motorista, no celular (a partir de 360 px): executa a rota, lê cilindros e confirma entregas, com cobertura móvel variável e uso offline.
- Também usam o produto: administrador FluxID, administrador do tenant, técnico e auditor, ainda sem prioridade de design própria.

## Product Purpose

O FluxID é uma plataforma multitenant de identidade e rastreabilidade de cilindros de gases medicinais e industriais. Substitui pranchetas e planilhas por identificação individual, histórico de custódia, operação móvel, geocercas, frota, alertas e comandos para lacres inteligentes. Sucesso: cilindros com identificação válida, menos divergências e ajustes manuais, entregas confirmadas com evidência e adoção pelos operadores.

## Positioning

Custódia individual de cada cilindro com auditoria imutável: quem tem o cilindro, onde ele esteve e o que aconteceu com ele ficam registrados como evidência. Nenhum cilindro é excluído fisicamente.

## Operating Context

- Estoque, pátio e entregas em campo, com GPS impreciso, PWA sem segundo plano confiável e sinal móvel instável.
- Dados isolados por tenant (`organization_id` e RLS); ações sensíveis exigem autorização e geram auditoria.
- Empresa de referência do problema: Oxigênio Cariri.

## Capabilities and Constraints

- PWA instalável e responsivo de 360 px a desktop amplo; Android via Capacitor depois.
- Estados de carregamento, vazio, erro, offline e sincronização sempre tratados.
- Conectividade Supabase local, LAN ou cloud conforme `docs/arquitetura-conectividade-supabase.md`.
- Dados de exemplo sempre marcados "Exemplo" e vindos de fonte substituível.
- Interface em português brasileiro.

## Brand Commitments

- Nome FluxID, slogan "Rastreabilidade que protege. Inteligência que conecta."
- Logotipo, tokens, componentes, ícones e Montserrat da Spec 003; padrão visual da Spec 005 é a base e só pode ser preservado e melhorado (ver AGENTS.md).

## Evidence on Hand

- `docs/prd.md`, `docs/documento-visao.md` e `specs/`.
- Não há depoimentos, clientes, métricas ou preços reais; nada disso pode ser inventado.

## Product Principles

1. Confiança acima de enfeite: cada tela deixa claro o estado, o responsável e a evidência.
2. Campo primeiro: o que o motorista faz com uma mão, ao sol e sem sinal tem de funcionar sem esforço.
3. Rastro sempre visível: ações sensíveis mostram autorização e auditoria.
4. Dado honesto: exemplo marcado como exemplo, nunca número ou cliente inventado.
5. Preservar e refinar: evoluir a identidade existente, sem recomeçar.

## Accessibility & Inclusion

WCAG 2.2 AA obrigatório: navegação por teclado, contraste, foco visível, tecnologias assistivas e movimento reduzido.
