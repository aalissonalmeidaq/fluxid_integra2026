import type React from 'react';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormSection,
  Icon,
  List,
  ListItem,
  Loading,
  Logo,
  Select,
  Simbolo,
  StatusBadge,
  SyncStatus,
  TextField,
  VisuallyHidden,
  type ColunaDaTabela,
} from '@/design-system';
import { classesDoControle } from '@/design-system/components/classes-do-controle';
import { ExemploDeDialog, Grupo } from './exemplos-auxiliares';

// Exemplos vivos de cada componente do catálogo, em todas as variantes e estados que a documentação promete.
interface Membro {
  id: string;
  nome: string;
  papel: string;
  situacao: 'ativo' | 'bloqueado';
}

const MEMBROS: Membro[] = [
  { id: '1', nome: 'Ana Souza', papel: 'Administradora', situacao: 'ativo' },
  { id: '2', nome: 'Bruno Lima', papel: 'Operador', situacao: 'ativo' },
  { id: '3', nome: 'Organização Com Um Nome Extremamente Longo Para Testar a Quebra de Texto', papel: 'Visualizador', situacao: 'bloqueado' },
];

const COLUNAS_DOS_MEMBROS: ColunaDaTabela<Membro>[] = [
  { id: 'nome', cabecalho: 'Nome', cabecalhoDaLinha: true, celula: (membro) => membro.nome },
  { id: 'papel', cabecalho: 'Papel', celula: (membro) => membro.papel },
  { id: 'situacao', cabecalho: 'Situação', celula: (membro) => <StatusBadge variant={membro.situacao === 'ativo' ? 'ativo' : 'bloqueado'}>{membro.situacao === 'ativo' ? 'Ativo' : 'Bloqueado'}</StatusBadge> },
  {
    id: 'acoes',
    cabecalho: 'Ações',
    celula: (membro) => (
      <Button variant="secundario">
        Ver <VisuallyHidden>{membro.nome}</VisuallyHidden>
      </Button>
    ),
  },
];

export const EXEMPLOS: Record<string, React.ReactNode> = {
  Button: (
    <div className="flex flex-col gap-4">
      {(['primario', 'secundario', 'perigoso'] as const).map((variante) => (
        <Grupo key={variante} titulo={variante}>
          <Button variant={variante}>Normal</Button>
          <Button variant={variante} disabled>
            Desabilitado
          </Button>
          <Button variant={variante} loading loadingLabel="Salvando…">
            Carregando
          </Button>
        </Grupo>
      ))}
    </div>
  ),
  Field: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
      <Field label="Justificativa" help="Descreva o motivo com pelo menos 10 caracteres.">
        {(controle) => <textarea {...controle} rows={3} className={classesDoControle(false)} />}
      </Field>
      <Field label="Justificativa" error="Descreva o motivo com pelo menos 10 caracteres.">
        {(controle) => <textarea {...controle} rows={3} className={classesDoControle(true)} />}
      </Field>
    </div>
  ),
  TextField: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
      <TextField label="Nome de exibição" help="Como você aparece para os colegas." />
      <TextField label="E-mail" type="email" placeholder="nome@empresa.com.br" />
      <TextField label="Senha" type="password" />
      <TextField label="Foto de perfil" type="file" help="Imagem de até 2 MB." />
      <TextField label="Campo com erro" error="Informe um valor válido." defaultValue="abc" />
      <TextField label="Campo desabilitado" disabled defaultValue="Somente leitura" />
    </div>
  ),
  Select: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
      <Select label="Papel" help="Define as permissões.">
        <option value="">Selecione</option>
        <option value="admin">Administrador</option>
        <option value="operador">Operador</option>
      </Select>
      <Select label="Papel com erro" error="Selecione um papel.">
        <option value="">Selecione</option>
      </Select>
      <Select label="Papel desabilitado" disabled>
        <option>Operador</option>
      </Select>
    </div>
  ),
  StatusBadge: (
    <div className="flex flex-wrap gap-2">
      <StatusBadge variant="ativo">Ativo</StatusBadge>
      <StatusBadge variant="conectado">Conectado</StatusBadge>
      <StatusBadge variant="pendente">Convite pendente</StatusBadge>
      <StatusBadge variant="bloqueado">Bloqueado</StatusBadge>
      <StatusBadge variant="erro">Falha de sincronização</StatusBadge>
    </div>
  ),
  Alert: (
    <div className="flex flex-col gap-4">
      <Alert variant="informacao" title="Informação">Você está vendo os dados da organização ativa.</Alert>
      <Alert variant="sucesso" title="Salvo">As alterações foram confirmadas pelo servidor.</Alert>
      <Alert variant="alerta" title="Atenção">Esta ação afeta todos os membros da organização.</Alert>
      <Alert variant="erro" title="Não foi possível salvar">Verifique a conexão e tente novamente.</Alert>
    </div>
  ),
  Dialog: <ExemploDeDialog />,
  Card: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-3">
      <Card variant="informativo">Cartão informativo: agrupa conteúdo relacionado.</Card>
      <Card variant="indicador">
        <p className="text-legenda text-texto-secundario">Membros ativos</p>
        <p className="text-h2 font-bold text-navy">128</p>
      </Card>
      <Card variant="alerta">Cartão de alerta: algo precisa de atenção.</Card>
    </div>
  ),
  List: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
      <List>
        <ListItem>Primeiro item da lista simples</ListItem>
        <ListItem>Segundo item da lista simples</ListItem>
      </List>
      <List variant="cartoes">
        <ListItem>Primeiro cartão</ListItem>
        <ListItem>Segundo cartão com um texto bem mais longo para mostrar a quebra de palavras sem estourar o contêiner</ListItem>
      </List>
    </div>
  ),
  ListItem: (
    <List variant="cartoes">
      <ListItem>Item que assume a aparência da lista (aqui, em cartões).</ListItem>
    </List>
  ),
  FormSection: (
    <FormSection legend="Dados pessoais" description="Informações do seu perfil.">
      <TextField label="Nome de exibição" />
      <TextField label="E-mail" type="email" />
    </FormSection>
  ),
  DataTable: (
    <div className="flex flex-col gap-8">
      <DataTable legenda="Membros da organização" colunas={COLUNAS_DOS_MEMBROS} linhas={MEMBROS} chaveDaLinha={(membro) => membro.id} />
      <DataTable legenda="Sem membros" colunas={COLUNAS_DOS_MEMBROS} linhas={[]} chaveDaLinha={(membro) => membro.id} vazio={{ title: 'Nenhum membro encontrado', description: 'Convide a primeira pessoa para a organização.' }} />
      <DataTable legenda="Carregando" colunas={COLUNAS_DOS_MEMBROS} linhas={[]} chaveDaLinha={(membro) => membro.id} carregando textoDeCarregamento="Carregando membros" />
    </div>
  ),
  Loading: (
    <div className="flex flex-col gap-2">
      <Loading label="Carregando a página" variant="pagina" />
      <Loading label="Carregando a seção" variant="secao" />
      <Loading label="Enviando" variant="botao" />
    </div>
  ),
  EmptyState: (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
      <EmptyState title="Nenhum evento encontrado" description="Ajuste os filtros para ver outros eventos." action={{ label: 'Limpar filtros', onClick: () => undefined }} headingLevel={3} />
      <EmptyState title="Nenhum papel criado" description="Crie o primeiro papel da organização." headingLevel={3} />
    </div>
  ),
  ErrorState: (
    <div className="flex flex-col gap-4">
      <ErrorState title="Não foi possível carregar" message="Verifique a conexão e tente de novo." onRetry={() => undefined} />
      <ErrorState variant="sem-permissao" title="Acesso negado" message="Você não tem permissão para acessar esta área." />
    </div>
  ),
  SyncStatus: (
    <div className="flex flex-wrap gap-4">
      <SyncStatus state="sincronizado" />
      <SyncStatus state="sincronizando" />
      <SyncStatus state="offline" detail="Suas alterações ficam guardadas até a conexão voltar." />
      <SyncStatus state="conflito" />
    </div>
  ),
  SkipLink: (
    <p className="max-w-padrao text-corpo text-grafite">
      O link "Pular para o conteúdo principal" fica oculto até receber o foco. Pressione Tab ao carregar esta página para vê-lo no topo.
    </p>
  ),
  VisuallyHidden: (
    <div className="flex items-center gap-2">
      <Button variant="secundario">
        <Icon name="filtros" />
        <VisuallyHidden>Abrir filtros</VisuallyHidden>
      </Button>
      <p className="text-corpo text-grafite">O botão tem só um ícone; o texto "Abrir filtros" existe para leitores de tela.</p>
    </div>
  ),
  Icon: (
    <div className="flex flex-wrap items-center gap-4">
      {(['escudo', 'cilindro', 'caminhao', 'nuvem', 'mapa', 'usuario'] as const).map((nome) => (
        <Icon key={nome} name={nome} size={32} label={nome} />
      ))}
      <a href="#/icones" className="inline-flex min-h-alvo items-center text-corpo font-semibold text-azul-profundo">
        Ver os 30 ícones
      </a>
    </div>
  ),
  Logo: (
    <div className="flex flex-wrap items-center gap-8">
      <Logo variant="horizontal" width={240} />
      <Logo variant="vertical" width={160} />
      <a href="#/logotipo" className="inline-flex min-h-alvo items-center text-corpo font-semibold text-azul-profundo">
        Ver todas as versões
      </a>
    </div>
  ),
  Simbolo: (
    <div className="flex flex-wrap items-end gap-4">
      {([256, 64, 32, 16] as const).map((tamanho) => (
        <figure key={tamanho} className="flex flex-col items-center gap-1">
          <Simbolo size={tamanho} />
          <figcaption className="text-legenda text-texto-secundario">{tamanho} px</figcaption>
        </figure>
      ))}
    </div>
  ),
};
