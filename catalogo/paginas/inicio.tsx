import React from 'react';
import { Card, List, ListItem } from '@/design-system';

const SECOES_RESUMO: ReadonlyArray<{ id: string; titulo: string; texto: string }> = [
  { id: 'cores', titulo: 'Cores', texto: 'Paleta da identidade, combinações permitidas com o contraste medido e os gradientes oficiais.' },
  { id: 'tipografia', titulo: 'Tipografia', texto: 'Montserrat nos pesos 300 a 800, com a escala de 12 a 64 px.' },
  { id: 'layout', titulo: 'Layout', texto: 'Escala de espaçamento, grade de 12, 8 e 4 colunas, containers, raios e sombras.' },
  { id: 'componentes', titulo: 'Componentes', texto: 'Botões, campos, alertas, diálogo, tabela e estados, em todas as variantes.' },
  { id: 'icones', titulo: 'Ícones', texto: 'Os 30 ícones nos tamanhos 16, 24, 32 e 48 px, nos quatro estados e nas quatro variantes.' },
  { id: 'logotipo', titulo: 'Logotipo', texto: 'As nove versões da marca, a área de proteção, a redução mínima e os usos incorretos.' },
];

export function PaginaInicio(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-h2 font-extrabold text-navy tablet:text-h1">Catálogo do design system FluxID</h1>
        <p className="max-w-padrao text-corpo text-grafite">
          Rastreabilidade que protege. Inteligência que conecta. Este catálogo documenta os tokens, os componentes, os ícones e o
          logotipo que toda tela do FluxID usa. Telas novas só podem usar o que está aqui; qualquer exceção precisa ser registrada na
          página Exceções.
        </p>
      </header>

      <section aria-labelledby="secoes" className="flex flex-col gap-4">
        <h2 id="secoes" className="text-h3 font-semibold text-navy">
          O que há no catálogo
        </h2>
        <List variant="cartoes">
          {SECOES_RESUMO.map((secao) => (
            <ListItem key={secao.id}>
              <a href={`#/${secao.id}`} className="inline-flex min-h-alvo items-center text-corpo font-semibold text-azul-profundo">
                {secao.titulo}
              </a>
              <p className="text-corpo text-grafite">{secao.texto}</p>
            </ListItem>
          ))}
        </List>
      </section>

      <Card as="section" aria-labelledby="regras">
        <h2 id="regras" className="text-h3 font-semibold text-navy">
          Regras do padrão
        </h2>
        <ul className="mt-4 flex list-disc flex-col gap-2 pl-6 text-corpo text-grafite">
          <li>Texto normal exige contraste de 4,5:1; texto grande e componentes de interface, 3:1.</li>
          <li>O ciano e o verde vivo da prancha são decorativos; para texto e ícones existem variantes acessíveis.</li>
          <li>Nenhuma informação depende só da cor: sempre há texto ou ícone junto.</li>
          <li>Todo controle interativo tem alvo de toque de 44 por 44 px e foco visível.</li>
          <li>Nenhum recurso vem de domínio de terceiros: fonte, ícones e logotipo são hospedados no aplicativo.</li>
        </ul>
      </Card>
    </div>
  );
}
