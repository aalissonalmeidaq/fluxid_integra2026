import { TEXTOS, type PlanoDeAssinatura } from './landing-content';

// Endereço do contato para o piloto (crítica de 15/10/2026): e-mail da equipe com o assunto já preenchido, para quem decide ter um próximo
// passo. Fica fora do componente para o teste de contrato conferir o formato.
export function hrefDoContato(): string {
  return `mailto:${TEXTOS.contato.email}?subject=${encodeURIComponent(TEXTOS.contato.assunto)}`;
}

// Contato de um plano (Planos e investimento, 16/10/2026): o mesmo e-mail, com o plano e a faixa no assunto.
export function hrefDoPlano(plano: PlanoDeAssinatura): string {
  return `mailto:${TEXTOS.contato.email}?subject=${encodeURIComponent(`FluxID: ${plano.nome} (${plano.faixa})`)}`;
}
