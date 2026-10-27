import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { hrefDoContato, hrefDoPlano } from '../contato';
import { EQUIPE, FRENTES, INSTITUICOES, FUNCIONALIDADES, JORNADA, MARCOS, MATERIAIS, PLANOS, PREJUIZO, PREVIAS, ROTULO_DA_SITUACAO, TELAS, TEXTOS, TRECHOS_DA_JORNADA, VIDEO_DA_SECAO } from '../landing-content';
import { calcularPrejuizo, formatarReais } from '../prejuizo';
import { Causa } from './causa';
import { ChamadaFinal } from './chamada-final';
import { Equipe } from './equipe';
import { Funcionalidades } from './funcionalidades';
import { Historia } from './historia';
import { Piloto } from './piloto';
import { Planos } from './planos';
import { Pitch } from './pitch';
import { Prejuizo } from './prejuizo';
import { Solucao } from './solucao';
import { Trava } from './trava';

// Spec 011, T024 (RF-005, História 2) e adaptação ao pitch: cada seção tem um h2 que a nomeia, sem salto de nível, e o texto vem de
// landing-content.ts.
const SECOES: Array<[string, string, ComponentType, string]> = [
  ['historia', 'Historia', Historia, TEXTOS.historia.titulo],
  ['prejuizo', 'Prejuizo', Prejuizo, TEXTOS.prejuizo.titulo],
  ['pitch', 'Pitch', Pitch, TEXTOS.pitch.titulo],
  ['causa', 'Causa', Causa, TEXTOS.causa.titulo],
  ['solucao', 'Solucao', Solucao, TEXTOS.solucao.titulo],
  ['trava', 'Trava', Trava, TEXTOS.trava.titulo],
  ['funcionalidades', 'Funcionalidades', Funcionalidades, TEXTOS.funcionalidades.titulo],
  ['piloto', 'Piloto', Piloto, TEXTOS.piloto.titulo],
  ['planos', 'Planos', Planos, TEXTOS.planos.titulo],
  ['equipe', 'Equipe', Equipe, TEXTOS.equipe.titulo],
  ['chamada-final', 'ChamadaFinal', ChamadaFinal, TEXTOS.chamadaFinal.titulo],
];

// O Testing Library normaliza o espaço não separável do valor em reais para um espaço comum.
const reais = (valor: number): string => formatarReais(valor).replace(/\s/g, ' ');

describe.each(SECOES)('Seção #%s (%s)', (id, _nome, Componente, titulo) => {
  it('é uma região com id e nomeada pelo seu h2', () => {
    const { container } = render(<Componente />);
    const secao = container.querySelector(`section#${id}`);
    expect(secao).not.toBeNull();
    const rotulo = secao?.getAttribute('aria-labelledby') ?? '';
    const cabecalho = container.querySelector(`#${rotulo}`);
    expect(cabecalho?.tagName).toBe('H2');
    expect(cabecalho).toHaveTextContent(titulo);
  });

  it('tem um único h2 e nenhum h1 nem salto de nível', () => {
    render(<Componente />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    // Sem pular nível: depois do h2, cada título desce no máximo um nível (a jornada, dentro da solução, chega ao h4).
    const niveis = screen.getAllByRole('heading').map((titulo) => Number(titulo.tagName.slice(1)));
    for (let indice = 1; indice < niveis.length; indice += 1) expect(niveis[indice]! - niveis[indice - 1]!).toBeLessThanOrEqual(1);
  });

  it('as ilustrações são decorativas e ficam fora da leitura', () => {
    const { container } = render(<Componente />);
    for (const elemento of container.querySelectorAll('[data-decorativo]')) expect(elemento).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Conteúdo das seções', () => {
  it('as seções editoriais alinham título e introdução em colunas no desktop', () => {
    const { container } = render(<Causa />);
    expect(container.querySelector('[data-cabecalho-secao]')).toHaveClass('desktop:grid-cols-5');
    expect(container.querySelector('[data-introducao-secao]')).toHaveClass('desktop:col-span-3');
  });

  it('História conta as cenas do C-262 em ordem, faz a pergunta do pitch e lista as dúvidas', () => {
    const { container } = render(<Historia />);
    const cenas = within(screen.getAllByRole('list')[0]!).getAllByRole('listitem');
    expect(cenas).toHaveLength(TEXTOS.historia.cenas.length);
    TEXTOS.historia.cenas.forEach((cena, indice) => expect(cenas[indice]).toHaveTextContent(cena.hora));
    expect(screen.getByText(TEXTOS.historia.pergunta)).toBeInTheDocument();
    for (const duvida of TEXTOS.historia.duvidas) expect(screen.getByText(duvida)).toBeInTheDocument();
    expect(container.querySelector('.landing-interrogacao text:last-child')).toHaveTextContent('PERDIDO');
    expect(container.querySelector('.landing-interrogacao text:last-child')).not.toHaveTextContent('SINAL PERDIDO');
  });

  it('Prejuízo mostra os totais calculados da fonte, com a ressalva e a fonte da estimativa', () => {
    const { container } = render(<Prejuizo />);
    const calculo = calcularPrejuizo(PREJUIZO.custos, PREJUIZO.perdidosNoAno);
    // Sem IntersectionObserver (jsdom), o número já aparece no valor final; o leitor de tela recebe o valor final em texto.
    for (const valor of [reais(calculo.porMes), reais(calculo.porAno), reais(calculo.patrimonioMedio)]) {
      expect(screen.getAllByText(valor).length).toBeGreaterThan(0);
    }
    expect(container.querySelector('[data-contador="130"]')).not.toBeNull();
    for (const custo of PREJUIZO.custos) expect(screen.getByText(reais(custo.valor))).toBeInTheDocument();
    expect(screen.getByText(TEXTOS.prejuizo.ressalva)).toBeInTheDocument();
    // A fonte dos números fica à vista, logo abaixo da introdução.
    expect(container.querySelector('[data-fonte]')).toHaveTextContent(PREJUIZO.fonte);
    // A perda fica em vermelho: o cartão dos cilindros perdidos e o do prejuízo anual.
    const perdas = container.querySelectorAll('[data-perda]');
    expect(perdas).toHaveLength(2);
    expect(perdas[0]).toHaveClass('bg-erro-fundo', 'text-erro');
    expect(perdas[0]).toHaveTextContent(String(PREJUIZO.perdidosNoAno));
    expect(perdas[1]).toHaveClass('bg-erro', 'text-branco');
    expect(perdas[1]).toHaveTextContent(reais(calculo.porAno));
    // A leitura do slide segue uma sequência semântica clara, em vez de quatro cartões concorrentes.
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.prejuizo.rotuloCustos })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Custos indiretos não contabilizados' })).toBeInTheDocument();
    expect(container.querySelector('[data-resumo-prejuizo]')).toHaveClass('desktop:grid-cols-12');
    expect(container.querySelector('[data-detalhes-prejuizo]')).toHaveClass('desktop:grid-cols-12');
  });

  it('Causa mostra a cadeia manual em ordem, os efeitos e a pergunta que leva à solução', () => {
    render(<Causa />);
    for (const etapa of TEXTOS.causa.etapas) expect(screen.getByRole('heading', { level: 3, name: etapa.titulo })).toBeInTheDocument();
    for (const efeito of TEXTOS.causa.efeitos) expect(screen.getByText(efeito)).toBeInTheDocument();
    expect(screen.getByText(TEXTOS.causa.pergunta)).toBeInTheDocument();
  });

  it('Solução mostra as quatro frentes, cada uma com a situação escrita (plataforma ou piloto)', () => {
    const { container } = render(<Solucao />);
    // Sem números de seção (01 a 04): a ordem das frentes não carrega informação.
    expect(container).not.toHaveTextContent(/\b0[1-4]\b/);
    expect(FRENTES.map((frente) => frente.titulo)).toEqual(['Identificar', 'Conectar', 'Monitorar', 'Proteger']);
    for (const frente of FRENTES) {
      const cartao = screen.getByRole('heading', { level: 3, name: frente.titulo }).closest('li') as HTMLElement;
      expect(cartao).toHaveTextContent(ROTULO_DA_SITUACAO[frente.situacao]);
    }
  });

  it('A solução traz a jornada: as sete etapas em três trechos de até três etapas, cada um dizendo onde está o C-262', () => {
    const { container } = render(<Solucao />);
    expect(container.querySelector('#jornada')).not.toBeNull();
    const trechos = [...container.querySelectorAll<HTMLElement>('[data-trecho]')];
    expect(trechos.map((trecho) => trecho.getAttribute('data-trecho'))).toEqual(TRECHOS_DA_JORNADA.map((trecho) => trecho.id));
    for (const trecho of trechos) expect(within(trecho).getAllByRole('listitem').length).toBeLessThanOrEqual(3);
    expect(trechos.flatMap((trecho) => within(trecho).getAllByRole('listitem')).map((item) => item.textContent)).toHaveLength(JORNADA.length);
    JORNADA.forEach((etapa) => expect(screen.getByText(etapa.titulo)).toBeInTheDocument());
    TRECHOS_DA_JORNADA.forEach((trecho, indice) => expect(trechos[indice]).toHaveTextContent(`C-262: ${TEXTOS.jornada.c262.estados[trecho.estado]}`));
  });

  it('A solução: as regras que protegem o registro ficam abertas para visualização', () => {
    const { container } = render(<Solucao />);
    const regras = container.querySelector('details') as HTMLDetailsElement;
    expect(regras.open).toBe(true);
    for (const regra of TEXTOS.jornada.regras) expect(screen.getByText(regra)).toBeInTheDocument();
  });

  it('Trava é marcada como protótipo e mostra os três momentos por botões alternáveis, com o texto anunciado', () => {
    const { container } = render(<Trava />);
    expect(screen.getByText(TEXTOS.trava.selo)).toBeInTheDocument();
    const grupo = screen.getByRole('group', { name: TEXTOS.trava.rotuloEstados });
    const botoes = within(grupo).getAllByRole('button');
    expect(botoes).toHaveLength(3);
    expect(botoes[0]).toHaveAttribute('aria-pressed', 'true');
    const anuncio = container.querySelector('[data-momentos]') as HTMLElement;
    // Os três textos ocupam a mesma célula (a caixa não pula de altura); só o do momento atual é lido e visível.
    const ativo = (): HTMLElement => anuncio.querySelector('[data-ativo]') as HTMLElement;
    expect(anuncio.querySelectorAll('p')).toHaveLength(3);
    expect(anuncio.querySelectorAll('p[aria-hidden="true"]')).toHaveLength(2);
    expect(ativo()).toHaveTextContent(TEXTOS.trava.estados[0].titulo);
    fireEvent.click(botoes[1]!);
    expect(botoes[1]).toHaveAttribute('aria-pressed', 'true');
    expect(botoes[0]).toHaveAttribute('aria-pressed', 'false');
    expect(ativo()).toHaveTextContent(TEXTOS.trava.estados[1].titulo);
    expect(container.querySelector('[data-recuado]')).not.toBeNull();
    fireEvent.click(botoes[2]!);
    expect(ativo()).toHaveTextContent(TEXTOS.trava.estados[2].titulo);
    expect(container.querySelector('[data-recuado]')).toBeNull();
    // Os seis componentes começam à vista (pedido de 15/10/2026); o resumo diz quantos são e continua recolhendo o bloco.
    const dentro = container.querySelector('details') as HTMLDetailsElement;
    expect(dentro.open).toBe(true);
    expect(dentro.querySelector('summary')).toHaveTextContent(TEXTOS.trava.componentesContagem);
    expect(within(dentro).getAllByRole('listitem')).toHaveLength(TEXTOS.trava.componentes.length);
    for (const componente of TEXTOS.trava.componentes) expect(screen.getByText(componente)).toBeInTheDocument();
    // O que já está na tela não é refeito ao trocar de momento: o bloco continua como a pessoa deixou.
    dentro.open = false;
    fireEvent.click(botoes[0]!);
    expect(dentro.open).toBe(false);
  });

  it('Piloto calcula o patrimônio preservado pelas perdas evitadas (10 perdas, R$ 37.666; 1 perda, R$ 3.766)', () => {
    render(<Piloto />);
    const faixa = screen.getByRole('slider', { name: new RegExp(TEXTOS.piloto.simuladorRotulo) });
    expect(faixa).toHaveValue('10');
    const medio = calcularPrejuizo(PREJUIZO.custos, PREJUIZO.perdidosNoAno).patrimonioMedio;
    expect(screen.getByText(reais(10 * medio))).toBeInTheDocument();
    expect(reais(10 * medio)).toMatch(/37\.666$/);
    expect(screen.getByText(TEXTOS.piloto.simuladorSelo)).toBeInTheDocument();
    expect(screen.getByText(TEXTOS.piloto.simuladorBase)).toBeInTheDocument();
    expect(faixa).toHaveAttribute('aria-valuetext', '10 perdas evitadas de 130');
    fireEvent.change(faixa, { target: { value: '1' } });
    expect(faixa).toHaveAttribute('aria-valuetext', '1 perda evitada de 130');
    expect(screen.getAllByText(reais(medio)).length).toBeGreaterThan(0);
    for (const etapa of TEXTOS.piloto.etapas) expect(screen.getByText(etapa.titulo)).toBeInTheDocument();
  });

  it('Equipe mostra os seis integrantes com foto descrita pelo nome, função e formação, e os marcos já cumpridos com data', () => {
    const { container } = render(<Equipe />);
    for (const pessoa of EQUIPE) {
      expect(screen.getByRole('heading', { level: 3, name: pessoa.nome })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: `Foto de ${pessoa.nome}` })).toHaveAttribute('src', pessoa.foto);
      expect(screen.getByText(pessoa.funcao)).toBeInTheDocument();
      // A formação fica à vista no cartão, sem precisar virar nem clicar (polimento de 16/10/2026).
      const cartao = container.querySelector(`[data-integrante="${pessoa.id}"]`) as HTMLElement;
      for (const item of pessoa.formacao) expect(within(cartao).getByText(item)).toBeVisible();
    }
    // Os seis cabem na tela: nada de carrossel, setas, pontos ou cartão que vira.
    expect(screen.queryByRole('button', { name: /integrante|Ir para/i })).not.toBeInTheDocument();
    expect(container.querySelector('#equipe [aria-pressed]')).toBeNull();
    // Os textos da seção vêm de landing-content: concluído e agendado em texto, sem legenda inventada por marco.
    expect(container.querySelectorAll(`[data-situacao="cumprido"]`).length).toBe(MARCOS.filter((marco) => marco.situacao === 'cumprido').length);
    for (const item of container.querySelectorAll('[data-situacao="cumprido"]')) expect(item).toHaveTextContent(TEXTOS.equipe.cumprido);
    expect(container).not.toHaveTextContent(/consolidada|Linha do Tempo/);
    const datas = [...container.querySelectorAll('time')].map((item) => item.getAttribute('datetime'));
    expect(datas).toEqual(MARCOS.map((marco) => marco.data));
    // O título não promete "cumpridos": o marco que ainda vem leva o selo "Agendado", em texto.
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.equipe.marcosTitulo })).toBeInTheDocument();
    for (const marco of MARCOS) {
      const item = container.querySelector(`[data-marco="${marco.data}"]`) as HTMLElement;
      expect(item).toHaveAttribute('data-situacao', marco.situacao);
      if (marco.situacao === 'agendado') expect(item).toHaveTextContent(TEXTOS.equipe.agendado);
      else expect(item).not.toHaveTextContent(TEXTOS.equipe.agendado);
    }
  });

  it('Planos: três faixas pelo tamanho da operação, e termina com o contato para começar', () => {
    const { container } = render(<Planos />);
    const slides = container.querySelectorAll('[data-slide]');
    expect(slides).toHaveLength(1);
    const cartoes = container.querySelectorAll('[data-plano]');
    expect(cartoes).toHaveLength(PLANOS.length);
    for (const [indice, plano] of PLANOS.entries()) {
      const cartao = cartoes[indice] as HTMLElement;
      expect(within(cartao).getByRole('heading', { level: 3, name: plano.nome })).toBeInTheDocument();
      if (plano.implantacao !== null && plano.mensalidade !== null) {
        expect(cartao).toHaveTextContent(reais(plano.implantacao));
        expect(cartao).toHaveTextContent(reais(plano.mensalidade));
        expect(cartao).toHaveTextContent(TEXTOS.planos.porMes);
      } else {
        expect(cartao).toHaveTextContent(TEXTOS.planos.personalizado);
      }
      expect(within(cartao).getByRole('link', { name: new RegExp(plano.nome) })).toHaveAttribute('href', hrefDoPlano(plano));
    }
    // Valor de referência, dito na página.
    expect(container).toHaveTextContent(TEXTOS.planos.referencia);
    // A seção termina no contato para começar.
    expect(screen.getByRole('link', { name: TEXTOS.contato.acao })).toHaveAttribute('href', hrefDoContato());
    expect(screen.getByText(TEXTOS.contato.email)).toBeInTheDocument();
    expect(within(slides[0] as HTMLElement).getAllByRole('link', { name: /Falar sobre o plano/ })).toHaveLength(PLANOS.length);
  });

  it('o Piloto traz valor, simulação, as fases e o modelo de contratação no slide 13', () => {
    render(<Piloto />);
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.piloto.etapasTitulo })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.planos.modeloRotulo })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.planos.implantacaoRotulo })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.planos.assinaturaRotulo })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: TEXTOS.planos.titulo })).not.toBeInTheDocument();
    expect(screen.getByText(/Medição contínua com indicadores/)).toHaveClass('text-corpo');
  });

  it('Equipe fecha com as logos institucionais e parceiras (SENAI Ceará, Saga SENAI de Inovação, Integra SENAI e Oxigênio Cariri), cada uma descrita pelo nome e com medidas', () => {
    const { container } = render(<Equipe />);
    const lista = screen.getByRole('list', { name: TEXTOS.equipe.instituicoes });
    expect(container.querySelectorAll('[data-lista-instituicoes]')).toHaveLength(1);
    for (const item of INSTITUICOES) {
      const logo = within(lista).getByRole('img', { name: item.nome });
      expect(logo).toHaveAttribute('src', item.arquivo);
      expect(logo).toHaveAttribute('width', String(item.largura));
      expect(logo).toHaveAttribute('height', String(item.altura));
    }
  });

  it('Pitch: o vídeo do pitch toca na própria seção, sem repetir título e descrição embaixo, e leva aos materiais', () => {
    const { container } = render(<Pitch />);
    const pitch = MATERIAIS.find((item) => item.id === VIDEO_DA_SECAO.pitch)!;
    expect(container.querySelector(`#assistir-${pitch.id}`)).not.toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`Assistir: ${pitch.titulo}`) })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: pitch.titulo })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: TEXTOS.pitch.verMateriais })).toHaveAttribute('href', '#materiais');
    expect(screen.getByRole('heading', { level: 3, name: 'Neste pitch' })).toBeInTheDocument();
    expect(container.querySelector('[data-roteiro-pitch]')).toHaveClass('border-y');
    expect(container.querySelectorAll('[data-capitulo-pitch]')).toHaveLength(3);
    expect(container).not.toHaveTextContent('Duração:');
    expect(container).not.toHaveTextContent('Apresentação oficial');
  });

  it('cada vídeo toca na seção que ele comprova: o protótipo físico na trava e o protótipo do sistema no que já funciona', () => {
    const { container: trava } = render(<Trava />);
    expect(trava.querySelector(`#assistir-${VIDEO_DA_SECAO.trava}`)).not.toBeNull();
    // A capa do protótipo físico tem título, como as outras: o lado vazio do palco diz o que o vídeo mostra.
    expect(trava.querySelector(`#assistir-${VIDEO_DA_SECAO.trava}`)).toHaveTextContent(TEXTOS.video.capaFisico);
    const { container: funciona } = render(<Funcionalidades />);
    expect(funciona.querySelector(`#assistir-${VIDEO_DA_SECAO.funcionalidades}`)).not.toBeNull();
  });

  it('Funcionalidades mostra todas as funcionalidades de landing-content', () => {
    render(<Funcionalidades />);
    for (const item of FUNCIONALIDADES) expect(screen.getByRole('heading', { level: 3, name: item.titulo })).toBeInTheDocument();
  });

  it('Funcionalidades abre com o palco das telas reais: duas figuras com imagem descrita, marcadas "Exemplo", antes dos cartões', () => {
    const { container } = render(<Funcionalidades />);
    const palco = container.querySelector('[data-palco-telas]');
    expect(palco).not.toBeNull();
    expect(palco?.querySelectorAll('figure')).toHaveLength(2);
    expect(within(palco as HTMLElement).getAllByText('Exemplo')).toHaveLength(2);
    for (const tela of TELAS) expect(within(palco as HTMLElement).getByRole('img', { name: tela.alt })).toHaveAttribute('src', tela.arquivo);
    // O palco vem antes do primeiro cartão de funcionalidade, na ordem de leitura e de foco.
    const primeiroCartao = screen.getByRole('heading', { level: 3, name: FUNCIONALIDADES[0]!.titulo });
    expect(palco!.compareDocumentPosition(primeiroCartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Mockup (polimento de 16/10/2026): o notebook e o celular sobreposto numa composição só; a introdução já diz que são telas reais com
    // dados de exemplo, então o palco não repete a frase, e cada tela leva o seu selo "Exemplo".
    expect(palco).toHaveAttribute('data-mockup');
    expect(palco?.querySelector('[data-dispositivo="computador"] [data-moldura="notebook"]')).not.toBeNull();
    expect(palco?.querySelector('[data-dispositivo="celular"] [data-moldura="celular"]')).not.toBeNull();
  });

  it('apresenta os benefícios das telas como conteúdo acessível e uma ação com alvo confortável', () => {
    render(<Funcionalidades />);
    const beneficios = screen.getByRole('list', { name: 'O que as telas comprovam' });
    expect(within(beneficios).getAllByRole('listitem')).toHaveLength(TELAS.length);
    for (const tela of TELAS) expect(beneficios).toHaveTextContent(tela.titulo);
    expect(screen.getByRole('link', { name: 'Assistir ao protótipo do sistema em ação' })).toHaveClass(
      'min-h-alvo',
      'rounded-controle',
      'text-corpo',
    );
  });

  it('O que já funciona fica só com o que a jornada e as telas não mostram: o funcionamento sem sinal e a segurança, com a prévia da fila de envio', () => {
    const { container } = render(<Funcionalidades />);
    expect(FUNCIONALIDADES.map((item) => item.id)).toEqual(['offline', 'seguranca']);
    expect(screen.getByRole('img', { name: PREVIAS.fila.descricao })).toBeInTheDocument();
    const slideDasTelas = container.querySelector('[data-palco-telas]')?.closest('[data-slide]');
    expect(slideDasTelas).not.toBeNull();
    for (const item of FUNCIONALIDADES) {
      expect(within(slideDasTelas as HTMLElement).getByRole('heading', { level: 3, name: item.titulo })).toBeInTheDocument();
    }
    expect(within(slideDasTelas as HTMLElement).getByRole('img', { name: PREVIAS.fila.descricao })).toBeInTheDocument();
    const resumo = container.querySelector('[data-resumo-operacional]');
    expect(resumo).toHaveClass('desktop:grid-cols-2');
    expect(resumo?.querySelectorAll('[data-capacidade]')).toHaveLength(3);
  });

  it('a chamada final traz a frase do pitch, repete o botão por sessão e o caminho para os materiais', () => {
    const { container } = render(<ChamadaFinal />);
    expect(screen.getByRole('heading', { level: 3, name: TEXTOS.chamadaFinal.frase })).toBeInTheDocument();
    expect(container.querySelector('[data-grade-fecho]')).toHaveClass('desktop:grid-cols-12');
    expect(container.querySelector('[data-acoes-fecho]')).toBeInTheDocument();
    expect(container).not.toHaveTextContent('Missão FluxID');
    expect(container).not.toHaveTextContent('Próximo Passo');
    // Fecha o arco do C-262: a resposta com evidências, em dados de exemplo, com o cartão no último estado.
    const cartao = document.querySelector('[data-cartao-rastreio]') as HTMLElement;
    expect(cartao).toHaveTextContent('Exemplo');
    expect(cartao.querySelector('[data-etapa="atual"]')).toHaveTextContent(TEXTOS.jornada.c262.estados.at(-1)!);
    for (const linha of TEXTOS.chamadaFinal.resposta) expect(cartao).toHaveTextContent(linha.valor);
    expect(screen.getByRole('link', { name: 'Entrar no sistema' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: TEXTOS.chamadaFinal.acaoPrincipal })).toHaveAttribute('href', '#assistir-video-pitch');
    // Para quem decide (crítica de 15/10/2026): o contato vem primeiro, antes do pitch, na ordem de leitura e de foco.
    const contato = screen.getByRole('link', { name: TEXTOS.contato.acao });
    expect(contato).toHaveAttribute('href', hrefDoContato());
    const pitch = screen.getByRole('link', { name: TEXTOS.chamadaFinal.acaoPrincipal });
    expect(contato.compareDocumentPosition(pitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
