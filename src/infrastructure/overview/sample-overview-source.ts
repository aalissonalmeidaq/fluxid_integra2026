import type { OverviewSource } from '@/application/overview/overview-source';
import type { OverviewBlockId, OverviewContentMap } from '@/domain/overview/overview-types';

// Única origem dos números e textos de exemplo da Visão geral (RF-017, RN-001). Resolve em memória, sem rede, sem cliente
// Supabase e sem ler tenant, pessoa, sessão ou armazenamento: o resultado é o mesmo para qualquer pessoa. Os textos são
// indicadores e eventos, nunca afirmam que uma entrega, um comando ou uma trava aconteceu (RN-004).
const numero = new Intl.NumberFormat('pt-BR');

const SITUACAO = [
  { id: 'cheios', label: 'Cheios', value: 574 },
  { id: 'com-clientes', label: 'Com clientes', value: 372 },
  { id: 'vazios', label: 'Vazios', value: 241 },
  { id: 'em-manutencao', label: 'Em manutenção', value: 61 },
] as const;
const TOTAL = SITUACAO.reduce((soma, categoria) => soma + categoria.value, 0);

// Maior resto: os percentuais inteiros sempre fecham 100%.
function percentuais(valores: readonly number[]): number[] {
  const total = valores.reduce((soma, valor) => soma + valor, 0);
  const base = valores.map((valor) => Math.floor((valor * 100) / total));
  let faltam = 100 - base.reduce((soma, valor) => soma + valor, 0);
  const ordem = valores
    .map((valor, indice) => ({ indice, resto: (valor * 100) % total }))
    .sort((a, b) => b.resto - a.resto);
  for (const { indice } of ordem) {
    if (faltam <= 0) break;
    base[indice] = (base[indice] ?? 0) + 1;
    faltam -= 1;
  }
  return base;
}

const ENTRADAS = [38, 42, 35, 47, 51, 29, 24, 44, 49, 40, 46, 53, 31, 27];
const SAIDAS = [31, 36, 40, 39, 45, 33, 21, 38, 43, 41, 42, 48, 35, 22];

function rotuloDoDia(indice: number): string {
  // Dias de exemplo fixos (sem relógio): 18/09 a 01/10.
  const data = new Date(Date.UTC(2026, 8, 18 + indice));
  return `${String(data.getUTCDate()).padStart(2, '0')}/${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

const CONTEUDO: OverviewContentMap = {
  indicadores: {
    items: [
      { id: 'cadastrados', icon: 'cilindro', tone: 'cadastro', label: 'Cilindros cadastrados', value: numero.format(TOTAL), note: 'Total no cadastro' },
      { id: 'em-viagem', icon: 'rota', tone: 'viagem', label: 'Em viagem', value: numero.format(138), note: 'Cilindros em rotas' },
      { id: 'alertas-criticos', icon: 'alerta', tone: 'critico', label: 'Alertas críticos', value: numero.format(7), note: 'Eventos a tratar' },
      { id: 'lacres', icon: 'lacre', tone: 'sucesso', label: 'Lacres conectados', value: numero.format(1086), note: 'Lacres com sinal' },
    ],
  },
  mapa: {
    message: 'O rastreamento das rotas e dos cilindros no mapa chega em uma fase futura. Por enquanto o mapa mostra só a região de exemplo.',
    center: { latitude: -23.55052, longitude: -46.633308, span: 0.6 },
  },
  movimentacao: {
    series: [
      { id: 'entradas', label: 'Entradas' },
      { id: 'saidas', label: 'Saídas' },
    ],
    days: ENTRADAS.map((entradas, indice) => ({ label: rotuloDoDia(indice), values: { entradas, saidas: SAIDAS[indice] ?? 0 } })),
  },
  situacao: {
    total: TOTAL,
    categories: (() => {
      const pcts = percentuais(SITUACAO.map((categoria) => categoria.value));
      return SITUACAO.map((categoria, indice) => ({ ...categoria, percent: pcts[indice] ?? 0 }));
    })(),
  },
  alertas: {
    items: [
      { id: 'EX-A-01', text: 'Lacre com sinal de violação registrado no cilindro EX-0412', type: 'Lacre', when: 'há 12 minutos', isNew: true, severity: 'critico', cylinderId: 'EX-0412', occurrence: 'O lacre do cilindro EX-0412 registrou um sinal de violação durante a custódia no armazém EX-ARM-01.', status: 'Em análise' },
      { id: 'EX-A-02', text: 'Saída da geocerca registrada na rota EX-R-07', type: 'Geocerca', when: 'há 47 minutos', isNew: true, severity: 'atencao', cylinderId: 'EX-0733', occurrence: 'O cilindro EX-0733 saiu da geocerca prevista para a rota EX-R-07 e ficou fora dela por alguns minutos.', status: 'Aberto' },
      { id: 'EX-A-03', text: 'Teste hidrostático a vencer em 15 dias para o cilindro EX-0188', type: 'Teste hidrostático', when: 'há 2 horas', isNew: false, severity: 'informativo', cylinderId: 'EX-0188', occurrence: 'O prazo do teste hidrostático do cilindro EX-0188 vence em 15 dias e precisa ser reprogramado.', status: 'Aberto' },
      { id: 'EX-A-04', text: 'Custódia sem confirmação de recebimento no armazém EX-ARM-02', type: 'Custódia', when: 'ontem', isNew: false, severity: 'atencao', cylinderId: 'EX-0291', occurrence: 'A transferência do cilindro EX-0291 para o armazém EX-ARM-02 ainda não teve o recebimento confirmado.', status: 'Tratado' },
    ],
  },
  cilindros: {
    items: [
      { id: 'EX-0412', gas: 'Oxigênio medicinal', status: 'Com clientes' },
      { id: 'EX-0188', gas: 'Nitrogênio', status: 'Cheio' },
      { id: 'EX-0733', gas: 'Argônio', status: 'Em manutenção' },
      { id: 'EX-0291', gas: 'Dióxido de carbono', status: 'Vazio' },
    ],
  },
  desempenho: {
    items: [
      { id: 'teste-em-dia', label: 'Cilindros com teste hidrostático em dia', value: numero.format(96.4), unit: '%' },
      { id: 'retorno', label: 'Tempo médio de retorno de cilindros', value: numero.format(6.3), unit: 'dias' },
      { id: 'tratados', label: 'Alertas tratados', value: numero.format(88), unit: '%' },
    ],
  },
};

export const sampleOverviewSource: OverviewSource = {
  load<K extends OverviewBlockId>(blockId: K): Promise<OverviewContentMap[K]> {
    return Promise.resolve(structuredClone(CONTEUDO[blockId]));
  },
};
