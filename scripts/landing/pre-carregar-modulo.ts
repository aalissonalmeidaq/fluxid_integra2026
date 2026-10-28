// Spec 015 (T130; orçamento de LCP da Spec 011): o módulo da landing desenha a abertura, que é o LCP. Carregado sob demanda, ele só começava
// a baixar depois de o pacote de entrada chegar e rodar (cascata). No build, o marcador do index.html vira a lista do módulo da landing, dos
// módulos que ele importa (menos o de entrada, que já está no HTML) e do estilo dele; o script inline pede tudo junto com o pacote de entrada,
// só na landing do navegador. No servidor de desenvolvimento o marcador fica vazio e nada é pedido.
export const MARCADOR_DOS_MODULOS = '[] /* MODULOS_DA_LANDING */';

interface Pedaco {
  type: 'chunk' | 'asset';
  fileName: string;
  name?: string;
  isEntry?: boolean;
  imports?: readonly string[];
  viteMetadata?: { importedCss: ReadonlySet<string> };
}

export function injetarModulosDaLanding(html: string, pacote: Readonly<Record<string, Pedaco>>, base: string): string {
  if (html.split(MARCADOR_DOS_MODULOS).length !== 2) throw new Error(`index.html: o marcador ${MARCADOR_DOS_MODULOS} deve aparecer uma vez.`);
  const pedacos = Object.values(pacote);
  const landing = pedacos.find((pedaco) => pedaco.type === 'chunk' && pedaco.name === 'landing-page');
  if (!landing) throw new Error('Build sem o módulo landing-page: o pré-carregamento da landing não tem o que pedir.');
  const entrada = new Set(pedacos.filter((pedaco) => pedaco.isEntry).map((pedaco) => pedaco.fileName));
  const arquivos = [
    landing.fileName,
    ...(landing.imports ?? []).filter((arquivo) => !entrada.has(arquivo)),
    ...(landing.viteMetadata?.importedCss ?? []),
  ];
  return html.replace(MARCADOR_DOS_MODULOS, JSON.stringify(arquivos.map((arquivo) => `${base}${arquivo}`)));
}
