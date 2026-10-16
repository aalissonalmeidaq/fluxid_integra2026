// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hrefDoContato, hrefDoPlano } from '../../src/pages/landing/contato';
import { EQUIPE, FRENTES, INSTITUICOES, FUNCIONALIDADES, JORNADA, MARCOS, MATERIAIS, PLANOS, PREJUIZO, SECOES, TELAS, TEXTOS, TRECHOS_DA_JORNADA, VIDEO_DA_SECAO } from '../../src/pages/landing/landing-content';

// Spec 011, T006 (RF-006, RF-007, RNF-009; contracts/conteudo-e-links.md): a lista fechada de materiais, a rastreabilidade
// do texto (cada funcionalidade vem de uma spec entregue) e a ausência de dado inventado ou de segredo no conteúdo.
const ESPERADOS: Array<[string, string]> = [
  ['documentos', 'https://drive.google.com/drive/folders/1YLRicnjdatuBTYKyWaMewX0AQ3SbIH0a?usp=drive_link'],
  ['repositorio-sistema', 'https://github.com/aalissonalmeidaq/fluxid_integra2026'],
  ['repositorio-api', 'https://github.com/NatBaracho/APIEsp32'],
  ['evidencias', 'https://drive.google.com/drive/folders/1OKMqN2ZkS4g5TztreFCycmmGjT9zEni5?usp=sharing'],
  ['canal-youtube', 'https://www.youtube.com/channel/UCdPUZsu3yPHOae_sGLkX1oQ'],
  ['video-pitch', 'https://www.youtube.com/watch?v=VBYOPnadE9M'],
  ['video-prototipo-fisico', 'https://www.youtube.com/watch?v=oZAnkLHkd2k'],
  ['video-prototipo-sistema', 'https://youtu.be/j7Qnq4MC9ZE'],
];
const DOMINIOS = ['drive.google.com', 'github.com', 'www.youtube.com', 'youtu.be'];
const todoTexto = (): string =>
  JSON.stringify({ MATERIAIS, FUNCIONALIDADES, FRENTES, JORNADA, SECOES, TEXTOS });

// Largura de um WebP pelo cabeçalho, nos três formatos de bloco (VP8 com perda, VP8L sem perda, VP8X estendido).
function larguraDoWebp(bytes: Buffer): number {
  const bloco = bytes.subarray(12, 16).toString('latin1');
  if (bloco === 'VP8X') return 1 + bytes.readUIntLE(24, 3);
  if (bloco === 'VP8L') return 1 + (bytes.readUInt16LE(21) & 0x3fff);
  return bytes.readUInt16LE(26) & 0x3fff;
}

describe('Conteúdo da landing: materiais', () => {
  it('tem exatamente os 8 destinos combinados, com id e url únicos', () => {
    expect(MATERIAIS.map((item) => [item.id, item.url])).toEqual(ESPERADOS);
    expect(new Set(MATERIAIS.map((item) => item.id)).size).toBe(8);
    expect(new Set(MATERIAIS.map((item) => item.url)).size).toBe(8);
  });

  it('toda url é https e de um domínio permitido', () => {
    for (const item of MATERIAIS) {
      const url = new URL(item.url);
      expect(url.protocol).toBe('https:');
      expect(DOMINIOS).toContain(url.hostname);
    }
  });

  it('cada material tem título e descrição; as pastas do Drive avisam que o acesso pode exigir permissão', () => {
    for (const item of MATERIAIS) {
      expect(item.titulo.trim().length).toBeGreaterThan(2);
      expect(item.descricao.trim().length).toBeGreaterThan(10);
    }
    for (const id of ['documentos', 'evidencias']) {
      expect(MATERIAIS.find((item) => item.id === id)?.descricao).toMatch(/permiss/i);
    }
  });

  it('só os vídeos têm miniatura, e os tipos são os previstos', () => {
    for (const item of MATERIAIS) {
      expect(['pasta', 'repositorio', 'canal', 'video']).toContain(item.tipo);
      expect(Boolean(item.miniatura)).toBe(item.tipo === 'video');
    }
    expect(MATERIAIS.filter((item) => item.tipo === 'video')).toHaveLength(3);
  });
});

describe('Conteúdo da landing: vídeos nas próprias seções', () => {
  it('cada vídeo toca na seção que ele comprova (pitch, trava, o que já funciona), e todas essas seções existem', () => {
    expect(VIDEO_DA_SECAO).toEqual({ pitch: 'video-pitch', trava: 'video-prototipo-fisico', funcionalidades: 'video-prototipo-sistema' });
    for (const [secao, id] of Object.entries(VIDEO_DA_SECAO)) {
      expect(MATERIAIS.find((item) => item.id === id)?.tipo).toBe('video');
      expect(SECOES.some((item) => item.id === secao)).toBe(true);
    }
  });
});

describe('Conteúdo da landing: telas reais do sistema', () => {
  it('cada tela aponta para um arquivo WebP local que existe, leve e com descrição que cita os dados de exemplo', () => {
    expect(TELAS.map((tela) => tela.id)).toEqual(['viagem-desktop', 'campo-celular']);
    for (const tela of TELAS) {
      expect(tela.arquivo).toMatch(/^\/landing\/telas\/[a-z0-9-]+\.webp$/);
      const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'public', tela.arquivo));
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
      expect(bytes.length).toBeLessThanOrEqual(150 * 1024);
      expect(tela.alt).toMatch(/dados de exemplo/i);
      expect(tela.largura).toBeGreaterThan(0);
      expect(tela.altura).toBeGreaterThan(0);
    }
  });
});

describe('Conteúdo da landing: fidelidade ao produto', () => {
  it('cada funcionalidade cita a spec de origem entre 002 e 010 e tem ícone, título e texto', () => {
    // Um bloco só, com dois itens (distill de 15/10/2026: cadastro e viagens já estão na jornada e nas telas reais logo acima).
    expect(FUNCIONALIDADES).toHaveLength(2);
    expect(new Set(FUNCIONALIDADES.map((item) => item.id)).size).toBe(FUNCIONALIDADES.length);
    for (const item of FUNCIONALIDADES) {
      expect(item.origem).toMatch(/^(00[2-9]|010)$/);
      expect(item.titulo.trim()).not.toBe('');
      expect(item.texto.trim()).not.toBe('');
      expect(item.icone.trim()).not.toBe('');
    }
  });

  it('a jornada tem 7 etapas, em ordem de 1 a 7; o que está na plataforma cita a spec de origem', () => {
    expect(JORNADA.map((etapa) => etapa.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const item of [...JORNADA, ...FRENTES]) {
      if (item.situacao === 'plataforma') expect(item.origem).toMatch(/^(00[2-9]|010)$/);
    }
  });

  it('a jornada se divide em 3 trechos de até 3 etapas, e cada trecho aponta um estado existente do cartão do C-262', () => {
    expect(TRECHOS_DA_JORNADA.map((trecho) => trecho.id)).toEqual(['preparar', 'entregar', 'proteger']);
    for (const trecho of TRECHOS_DA_JORNADA) {
      expect(JORNADA.filter((etapa) => etapa.grupo === trecho.id).length).toBeLessThanOrEqual(3);
      expect(TEXTOS.jornada.c262.estados[trecho.estado]).toBeTruthy();
    }
    expect(JORNADA.every((etapa) => TRECHOS_DA_JORNADA.some((trecho) => trecho.id === etapa.grupo))).toBe(true);
  });

  it('os 8 destinos aparecem na página: os 5 externos nos 2 blocos de materiais e os 3 vídeos nas próprias seções, sem repetir nenhum', () => {
    const ids = TEXTOS.materiais.blocos.flatMap((bloco) => [...bloco.materiais]);
    expect(TEXTOS.materiais.blocos).toHaveLength(2);
    expect([...ids, ...Object.values(VIDEO_DA_SECAO)].sort()).toEqual(MATERIAIS.map((item) => item.id).sort());
  });

  it('a equipe tem os cinco integrantes da apresentação, cada um com foto local que existe, função e formação', () => {
    expect(EQUIPE.map((pessoa) => pessoa.nome)).toEqual(['Natã Baracho', 'Carlos Augusto', 'John Walter', 'Simão Bastos', 'Kauan Evangelista']);
    for (const pessoa of EQUIPE) {
      expect(pessoa.foto).toMatch(/^\/landing\/equipe\/[a-z-]+\.webp$/);
      const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'public', pessoa.foto));
      expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
      expect(bytes.length).toBeLessThanOrEqual(20 * 1024);
      // Fotos padronizadas (scripts/landing/padronizar-fotos-equipe.mjs): 384 px na principal e 192 px na menor, para o srcset.
      const pequena = readFileSync(join(import.meta.dirname, '..', '..', 'public', pessoa.foto.replace(/\.webp$/, '-192.webp')));
      expect(pequena.subarray(8, 12).toString('latin1')).toBe('WEBP');
      expect(larguraDoWebp(pequena)).toBe(192);
      expect(larguraDoWebp(bytes)).toBe(384);
      expect(pessoa.funcao.trim()).not.toBe('');
      expect(pessoa.formacao.length).toBeGreaterThan(0);
    }
  });

  it('as logos institucionais e parceiras são SENAI Ceará, Saga SENAI de Inovação, Integra SENAI e Oxigênio Cariri, em WebP local, leve e com as medidas reais', () => {
    expect(INSTITUICOES.map((item) => item.nome)).toEqual([
      'SENAI Ceará',
      'Saga SENAI de Inovação',
      'Integra SENAI',
      'Oxigênio Cariri',
    ]);
    for (const item of INSTITUICOES) {
      expect(item.arquivo).toMatch(/^\/landing\/instituicoes\/[a-z-]+\.webp$/);
      const bytes = readFileSync(join(import.meta.dirname, '..', '..', 'public', item.arquivo));
      expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
      expect(bytes.length).toBeLessThanOrEqual(40 * 1024);
      // Largura e altura (as do recorte, impressas pelo script) evitam salto de layout enquanto a imagem carrega.
      expect(item.largura).toBeGreaterThan(0);
      expect(item.altura).toBeGreaterThan(0);
    }
  });

  it('os marcos estão em ordem de data, com data no formato ISO e rótulo legível', () => {
    expect(MARCOS.length).toBeGreaterThan(0);
    const datas = MARCOS.map((marco) => marco.data);
    expect([...datas].sort()).toEqual(datas);
    for (const marco of MARCOS) {
      expect(marco.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(marco.rotulo).toMatch(/2026/);
    }
  });

  it('nenhum marco aparece como cumprido antes de acontecer: o que ainda vem fica "agendado" (crítica de 15/10/2026)', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    for (const marco of MARCOS) {
      expect(['cumprido', 'agendado']).toContain(marco.situacao);
      // Num marco de vários dias, vale o último dia.
      if (marco.situacao === 'cumprido') expect((marco.fim ?? marco.data) <= hoje, marco.texto).toBe(true);
    }
    expect(MARCOS.find((marco) => marco.texto === 'Validação do protótipo')?.situacao).toBe('agendado');
  });

  it('o contato para o piloto é o e-mail da equipe, com assunto pronto (crítica de 15/10/2026)', () => {
    expect(TEXTOS.contato.email).toBe('fluxid2026@gmail.com');
    expect(hrefDoContato()).toMatch(/^mailto:fluxid2026@gmail\.com\?subject=[^&\s]+$/);
  });

  it('a trava física e o alerta de geocerca, ainda em protótipo, nunca aparecem como prontos na plataforma', () => {
    expect(FRENTES.find((frente) => frente.id === 'proteger')?.situacao).toBe('piloto');
    expect(FRENTES.find((frente) => frente.id === 'monitorar')?.situacao).toBe('piloto');
    expect(JORNADA.find((etapa) => etapa.titulo === 'Permanência na geocerca')?.situacao).toBe('piloto');
    expect(TEXTOS.trava.selo).toMatch(/protótipo/i);
  });

  it('as seções seguem a ordem planejada e a abertura é escura', () => {
    expect(SECOES.map((secao) => secao.id)).toEqual([
      'inicio', 'historia', 'prejuizo', 'causa', 'solucao', 'trava', 'funcionalidades', 'piloto', 'planos', 'equipe', 'materiais', 'pitch', 'chamada-final',
    ]);
    expect(SECOES[0]?.tema).toBe('escuro');
    expect(new Set(SECOES.map((secao) => secao.id)).size).toBe(SECOES.length);
  });

  // Planos e investimento (pedido de 16/10/2026, que muda o "fora de escopo: área de preços" da spec): os valores são de referência, ficam
  // numa fonte única (PLANOS, em números) e a página os formata; nenhum valor em reais é digitado nos textos.
  it('os planos são três faixas pelo tamanho da operação, com implantação única e assinatura mensal, e o último é personalizado', () => {
    expect(PLANOS.map((plano) => [plano.ateCilindros, plano.implantacao, plano.mensalidade])).toEqual([
      [250, 3500, 2000],
      [600, 7000, 4000],
      [null, null, null],
    ]);
    expect(TEXTOS.planos.referencia).toMatch(/refer[êe]ncia/i);
    expect(TEXTOS.planos.implantacaoNota).toMatch(/único/i);
    expect(TEXTOS.planos.assinaturaNota).toMatch(/m[êe]s/i);
    for (const plano of PLANOS) expect(hrefDoPlano(plano)).toMatch(/^mailto:fluxid2026@gmail\.com\?subject=[^&\s]+$/);
  });

  it('nenhum texto traz número de clientes, depoimento, preço nem "em breve"', () => {
    const texto = todoTexto();
    expect(texto).not.toMatch(/depoimento|\bR\$\s?\d|\d+\s*(clientes|empresas|usuários)|em breve|\bpreço|\bplano[s]? pago/i);
  });

  it('os valores do prejuízo vêm de uma única fonte declarada (roteiro do pitch), e os totais são calculados, não digitados', () => {
    expect(PREJUIZO.fonte).toMatch(/levantadas com/i);
    expect(PREJUIZO.perdidosNoAno).toBe(130);
    expect(PREJUIZO.custos.map((custo) => custo.valor)).toEqual([2800, 4000, 4500]);
    // Os totais do pitch (R$ 3.766, R$ 40.805 e R$ 489.666) não estão escritos em nenhum texto: a página os calcula (prejuizo.ts).
    expect(todoTexto()).not.toMatch(/3\.766|40\.805|489\.666|37\.666/);
  });

  it('nenhum valor lembra segredo, token ou credencial privilegiada', () => {
    const texto = todoTexto();
    expect(texto).not.toMatch(/service_role|eyJ[A-Za-z0-9_-]{10,}|sb_secret|api[_-]?key|password|senha:/i);
  });

  it('o módulo de conteúdo não importa nada de rede nem de terceiros', () => {
    const fonte = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'pages', 'landing', 'landing-content.ts'), 'utf8');
    expect(fonte).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|import\s+.*from\s+['"](?!\.|@\/)/);
  });
});
