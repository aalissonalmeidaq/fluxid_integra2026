import React from 'react';
import { Card, DataTable, type ColunaDaTabela } from '@/design-system';
import { contrastRatio } from '@/design-system/contrast';
import { cores, gradientes, usosDeCor, type Finalidade, type NomeDeCor } from '@/design-system/tokens';
import { MINIMO_POR_FINALIDADE } from '@/design-system/verificar-contraste';

const USO_DA_COR: Record<NomeDeCor, string> = {
  'azul-profundo': 'Marca, ação principal e início do gradiente profundidade.',
  'azul-royal': 'Interação, links e anel de foco.',
  'azul-ciano': 'Decoração e elementos grandes. Nunca texto sobre fundo claro.',
  'ciano-acessivel': 'Texto, ícone e link em ciano sobre fundo claro.',
  'verde-vivo': 'Decoração e logotipo. Texto só sobre navy.',
  'verde-escuro': 'Ícones e estado ativo dos ícones (3:1).',
  'verde-acessivel': 'Texto de sucesso e botão de confirmação.',
  navy: 'Títulos e superfícies institucionais.',
  grafite: 'Texto de corpo e ícones.',
  branco: 'Superfície principal.',
  'cinza-gelo': 'Fundo da aplicação e áreas secundárias.',
  'texto-secundario': 'Legendas e textos de ajuda.',
  'borda-controle': 'Borda de campo e de seletor (3:1).',
  'borda-suave': 'Divisor decorativo, nunca único indicador.',
  erro: 'Texto, borda e ícone de erro.',
  'erro-fundo': 'Fundo suave de mensagens de erro.',
  'alerta-texto': 'Texto de alerta sobre o fundo suave.',
  'alerta-fundo': 'Fundo suave de mensagens de alerta.',
  'alerta-faixa': 'Faixa de alerta, sempre com texto grafite.',
  'sucesso-fundo': 'Fundo suave de mensagens de sucesso.',
  'info-fundo': 'Fundo suave de mensagens informativas.',
};

const ROTULO_DA_FINALIDADE: Record<Finalidade, string> = {
  'texto-normal': 'Texto normal',
  'texto-grande': 'Texto grande, ícone e gráfico',
  componente: 'Componente de interface',
  decorativo: 'Só decorativo e logotipo',
};

interface LinhaDeUso {
  texto: NomeDeCor;
  fundo: NomeDeCor;
  finalidade: Finalidade;
  razao: number;
  minimo: number;
}

// Amostra gráfica, sem texto: mostra o par de cores sem criar texto real que o axe avaliaria; a razão vem escrita ao lado.
function Amostra({ texto, fundo }: { texto: NomeDeCor; fundo: NomeDeCor }): React.JSX.Element {
  return (
    <span aria-hidden="true" className="inline-flex h-8 w-16 shrink-0 items-center justify-center rounded-controle border border-borda-suave" style={{ backgroundColor: cores[fundo] }}>
      <span className="block h-2 w-8 rounded-controle" style={{ backgroundColor: cores[texto] }} />
    </span>
  );
}

const formatar = (valor: number): string => valor.toFixed(2).replace('.', ',');

function colunasDeUso(): ColunaDaTabela<LinhaDeUso>[] {
  return [
    { id: 'texto', cabecalho: 'Cor', cabecalhoDaLinha: true, celula: (linha) => linha.texto },
    { id: 'fundo', cabecalho: 'Sobre', celula: (linha) => linha.fundo },
    {
      id: 'amostra',
      cabecalho: 'Amostra',
      celula: (linha) => (
        <Amostra texto={linha.texto} fundo={linha.fundo} />
      ),
    },
    { id: 'razao', cabecalho: 'Razão', celula: (linha) => `${formatar(linha.razao)}:1` },
    { id: 'minimo', cabecalho: 'Mínimo', celula: (linha) => (linha.minimo > 0 ? `${String(linha.minimo).replace('.', ',')}:1` : 'sem mínimo') },
    { id: 'finalidade', cabecalho: 'Uso permitido', celula: (linha) => ROTULO_DA_FINALIDADE[linha.finalidade] },
    { id: 'situacao', cabecalho: 'Situação', celula: (linha) => (linha.minimo === 0 ? 'Decorativo' : linha.razao >= linha.minimo ? 'Atende' : 'Reprovado') },
  ];
}

// Combinações que a prancha de cores chama de "aprovadas", com o contraste real e a restrição de uso (RF-006A).
const COMBINACOES_DA_PRANCHA: ReadonlyArray<{ texto: NomeDeCor; fundo: NomeDeCor; restricao: string }> = [
  { texto: 'branco', fundo: 'azul-profundo', restricao: 'Texto e componentes.' },
  { texto: 'azul-royal', fundo: 'branco', restricao: 'Texto e componentes.' },
  { texto: 'verde-vivo', fundo: 'navy', restricao: 'Texto e componentes sobre fundo escuro.' },
  { texto: 'azul-ciano', fundo: 'navy', restricao: 'Só texto grande, ícones e elementos gráficos.' },
  { texto: 'verde-vivo', fundo: 'azul-profundo', restricao: 'Só texto grande, ícones e elementos gráficos.' },
  { texto: 'azul-ciano', fundo: 'azul-profundo', restricao: 'Só texto grande, ícones e elementos gráficos.' },
  { texto: 'verde-vivo', fundo: 'cinza-gelo', restricao: 'Somente logotipo e elementos decorativos.' },
];

const PROPORCAO: ReadonlyArray<{ nome: string; percentual: number; cor: NomeDeCor }> = [
  { nome: 'Neutros', percentual: 60, cor: 'cinza-gelo' },
  { nome: 'Azuis', percentual: 25, cor: 'azul-profundo' },
  { nome: 'Verdes', percentual: 10, cor: 'verde-escuro' },
  { nome: 'Ciano', percentual: 5, cor: 'azul-ciano' },
];

const GRADIENTES: ReadonlyArray<{ id: keyof typeof gradientes; nome: string }> = [
  { id: 'azul-digital', nome: 'Azul digital' },
  { id: 'conexao-segura', nome: 'Conexão segura' },
  { id: 'profundidade', nome: 'Profundidade' },
];

export function PaginaCores(): React.JSX.Element {
  const usos: LinhaDeUso[] = usosDeCor.map((uso) => {
    const texto = uso.texto as NomeDeCor;
    const fundo = uso.fundo as NomeDeCor;
    return { texto, fundo, finalidade: uso.finalidade, razao: contrastRatio(cores[texto], cores[fundo]), minimo: MINIMO_POR_FINALIDADE[uso.finalidade] };
  });
  const prancha: LinhaDeUso[] = COMBINACOES_DA_PRANCHA.map(({ texto, fundo }) => ({
    texto,
    fundo,
    finalidade: 'texto-normal',
    razao: contrastRatio(cores[texto], cores[fundo]),
    minimo: MINIMO_POR_FINALIDADE['texto-normal'],
  }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Cores</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Cada cor de texto ou de componente tem combinações permitidas explícitas. Uma verificação automática falha se qualquer
          combinação ficar abaixo de 4,5:1 (texto normal) ou 3:1 (texto grande e componentes).
        </p>
      </header>

      <section aria-labelledby="paleta" className="flex flex-col gap-4">
        <h2 id="paleta" className="text-h3 font-semibold text-navy">
          Paleta
        </h2>
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {(Object.entries(cores) as Array<[NomeDeCor, string]>).map(([nome, valor]) => (
            <li key={nome}>
              <Card className="flex h-full gap-4 p-4">
                <span aria-hidden="true" className="size-12 shrink-0 rounded-controle border border-borda-suave" style={{ backgroundColor: valor }} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-corpo font-semibold text-navy">{nome}</span>
                  <span className="text-legenda text-texto-secundario">{valor}</span>
                  <span className="text-legenda text-grafite">{USO_DA_COR[nome]}</span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="combinacoes" className="flex flex-col gap-4">
        <h2 id="combinacoes" className="text-h3 font-semibold text-navy">
          Combinações permitidas
        </h2>
        <DataTable legenda="Combinações de cor permitidas, com o contraste medido" colunas={colunasDeUso()} linhas={usos} chaveDaLinha={(l) => `${l.texto}-${l.fundo}-${l.finalidade}`} />
      </section>

      <section aria-labelledby="prancha" className="flex flex-col gap-4">
        <h2 id="prancha" className="text-h3 font-semibold text-navy">
          Combinações aprovadas pela prancha, com o contraste real
        </h2>
        <p className="max-w-padrao text-corpo text-grafite">
          A prancha de cores aprova algumas combinações que não atendem a WCAG para texto normal. Nesses casos vale a WCAG para
          texto e componentes; a prancha continua valendo para o logotipo e para elementos decorativos.
        </p>
        <ul role="list" className="flex flex-col gap-2">
          {prancha.map((linha, indice) => (
            <li key={`${linha.texto}-${linha.fundo}`} className="flex flex-wrap items-center gap-4 rounded-card border border-borda-suave bg-branco p-4">
              <Amostra texto={linha.texto} fundo={linha.fundo} />
              <span className="text-corpo font-semibold text-navy">
                {linha.texto} sobre {linha.fundo}
              </span>
              <span className="text-corpo text-grafite">
                {formatar(linha.razao)}:1, {linha.razao >= 4.5 ? 'atende texto normal' : 'não atende texto normal'}
              </span>
              <span className="text-corpo text-texto-secundario">{COMBINACOES_DA_PRANCHA[indice]?.restricao}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="gradientes" className="flex flex-col gap-4">
        <h2 id="gradientes" className="text-h3 font-semibold text-navy">
          Gradientes oficiais
        </h2>
        <p className="max-w-padrao text-corpo text-grafite">
          Os gradientes são decorativos. Nenhum texto essencial depende deles sem contraste verificado sobre o ponto mais crítico.
        </p>
        <ul role="list" className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
          {GRADIENTES.map(({ id, nome }) => (
            <li key={id} className="flex flex-col gap-2">
              <div aria-hidden="true" className="h-16 rounded-card" style={{ backgroundImage: `var(--gradiente-${id})` }} />
              <p className="text-corpo font-semibold text-navy">{nome}</p>
              <p className="text-legenda text-texto-secundario">
                {gradientes[id].textoSobre.length > 0 ? `Admite texto: ${gradientes[id].textoSobre.join(', ')}.` : 'Não admite texto.'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="proporcao" className="flex flex-col gap-4">
        <h2 id="proporcao" className="text-h3 font-semibold text-navy">
          Proporção de uso
        </h2>
        <p className="max-w-padrao text-corpo text-grafite">Orientação para equilibrar as telas: 60% neutros, 25% azuis, 10% verdes e 5% ciano.</p>
        <div role="img" aria-label="Proporção de uso das cores: 60% neutros, 25% azuis, 10% verdes e 5% ciano" className="flex h-8 overflow-hidden rounded-controle border border-borda-suave">
          {PROPORCAO.map((faixa) => (
            <span key={faixa.nome} style={{ width: `${faixa.percentual}%`, backgroundColor: cores[faixa.cor] }} />
          ))}
        </div>
        <ul role="list" className="flex flex-wrap gap-4 text-corpo text-grafite">
          {PROPORCAO.map((faixa) => (
            <li key={faixa.nome}>
              {faixa.nome}: {faixa.percentual}%
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
