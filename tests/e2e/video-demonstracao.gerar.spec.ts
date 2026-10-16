import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Browser, type BrowserContext, type Frame, type Locator, type Page, type Route } from '@playwright/test';
import { MockBackend } from './support/mock-backend';
import { assinar, tornarApresentavel } from './support/massa-apresentavel';
import { installFieldReaders } from './support/mock-field-reading';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';
import { abrirCapitulo, apontar, capitulo, celular, clicar, definirRitmo, digitar, escolher, esperar, fecharCapitulo, instalarEstudio, legenda, modo, rolarAte, Rolo, type Capitulo, type Legenda } from './support/video-estudio';

// Gerador do vídeo de demonstração do que já funciona no FluxID. NÃO faz parte da suíte: só roda quando se pede, com
//   GERAR_VIDEO_DEMONSTRACAO=1 npx playwright test tests/e2e/video-demonstracao.gerar.spec.ts --project=desktop-chromium      (completo, ~5,5 min)
//   GERAR_VIDEO_DEMONSTRACAO=curta npx playwright test tests/e2e/video-demonstracao.gerar.spec.ts --project=desktop-chromium  (até 90 s)
// e depois se monta o MP4 com scripts/video/montar-video-demonstracao.mjs (com --versao curta para a de 90 s). Abre o aplicativo compilado (npm run build e vite preview) com o
// backend simulado e conta uma história só, com os mesmos dados do começo ao fim, por quatro perfis: a administradora prepara o acesso, o
// estoquista dá entrada nos cilindros, o gestor planeja a viagem, o estoquista confere a carga, a motorista entrega pelo celular (com GPS,
// foto, assinatura e sem sinal) e o gestor fecha o ciclo. Todos os nomes, documentos, placas e códigos são fictícios e o vídeo traz o selo
// "Dados de exemplo" do começo ao fim.
const PASTA = join(import.meta.dirname, '..', '..', 'dist-video', 'quadros');
const PASTA_CURTA = join(import.meta.dirname, '..', '..', 'dist-video', 'quadros-curta');
const ORIGEM_DO_BACKEND = 'http://127.0.0.1:54321/**';
// 1080p nativo: o screencast do Chromium entrega quadros no tamanho da janela, sem a escala de pixels.
const VIEWPORT = { width: 1920, height: 1080 };

const PESSOAS = {
  admin: { nome: 'Marina Costa', email: 'marina.costa@example.com', papel: 'Administradora', cor: '#23AFE5' },
  estoque: { nome: 'Bruno Lima', email: 'bruno.lima@example.com', papel: 'Estoquista', cor: '#37D20A' },
  gestor: { nome: 'Paulo Mendes', email: 'paulo.mendes@example.com', papel: 'Gestor de viagens', cor: '#F5B301' },
  motorista: { nome: 'Ana Ribeiro', email: 'ana.ribeiro@example.com', papel: 'Motorista', cor: '#FF8A65' },
} as const;
type Pessoa = (typeof PESSOAS)[keyof typeof PESSOAS];

const PERMISSOES: Record<keyof typeof PESSOAS, string[]> = {
  admin: [
    'audit.read', 'tenant.manage', 'cylinder.read', 'cylinder.write', 'cylinder.deactivate', 'cylinder.identifier', 'cylinder.stock_in', 'cylinder.test',
    'cylinder.history', 'customer.read', 'customer.history', 'geofence.read', 'vehicle.read', 'driver.read', 'trip.read', 'trip.history',
  ],
  estoque: ['cylinder.read', 'cylinder.write', 'cylinder.stock_in', 'cylinder.history', 'trip.read', 'trip.operate', 'trip.history'],
  gestor: [
    'cylinder.read', 'cylinder.history', 'customer.read', 'customer.history', 'geofence.read', 'vehicle.read', 'vehicle.history', 'driver.read', 'driver.history',
    'trip.read', 'trip.write', 'trip.operate', 'trip.cancel', 'trip.unlock', 'trip.exception', 'trip.history', 'trip.recipient',
  ],
  motorista: ['trip.read', 'trip.operate', 'trip.recipient', 'cylinder.read'],
};

const fala = (pessoa: Pessoa, titulo: string, texto: string): Legenda => ({ perfil: `${pessoa.papel} · ${pessoa.nome}`, cor: pessoa.cor, titulo, texto });

// Massa do vídeo: a do simulado com nomes apresentáveis (massa-apresentavel.ts). Os quatro cilindros da viagem saem do estoque, para
// chegarem a ele pela mão do estoquista no capítulo 2.
function montarBackend(): MockBackend {
  const backend = new MockBackend().asProfile('viagens-admin');
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);
  tornarApresentavel(backend);
  for (const serial of ['CIL-006', 'CIL-007', 'CIL-008', 'CIL-009']) backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.stock_status = 'out_of_stock';
  return backend;
}

// Liga o simulado a uma página. A trilha de auditoria do tenant é gerada a cada consulta com o ator de teste: troca pelo nome da
// administradora. Os blocos do mapa vêm do OpenStreetMap de verdade (o vídeo mostra o mapa).
async function ligar(backend: MockBackend, page: Page): Promise<void> {
  const tratar = (backend as unknown as { handle(route: Route): Promise<void> }).handle.bind(backend);
  await page.route(ORIGEM_DO_BACKEND, (route) => {
    const comNomes = new Proxy(route, {
      get(alvo, propriedade) {
        if (propriedade === 'fulfill') {
          return (opcoes: Parameters<Route['fulfill']>[0]) =>
            alvo.fulfill(opcoes?.json ? { ...opcoes, json: JSON.parse(JSON.stringify(opcoes.json).replaceAll('Administrador A', PESSOAS.admin.nome)) } : opcoes);
        }
        const valor = Reflect.get(alvo, propriedade) as unknown;
        return typeof valor === 'function' ? (valor as (...args: unknown[]) => unknown).bind(alvo) : valor;
      },
    });
    return tratar(comNomes);
  });
}

async function novoContexto(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', serviceWorkers: 'block',
    permissions: ['geolocation'], geolocation: { latitude: -23.55, longitude: -46.633, accuracy: 12 },
  });
}

type Tela = Page | Frame;

async function entrar(page: Page, tela: Tela, backend: MockBackend, quem: keyof typeof PESSOAS, atraso = 40): Promise<void> {
  const pessoa = PESSOAS[quem];
  backend.permissionsByOrganization = { [ORG_A]: [...PERMISSOES[quem]] };
  backend.profile.display_name = pessoa.nome;
  await expect(tela.getByLabel('E-mail')).toBeVisible();
  await digitar(page, tela.getByLabel('E-mail'), pessoa.email, atraso);
  await digitar(page, tela.getByLabel('Senha', { exact: true }), 'Exemplo-2026!', atraso);
  await clicar(page, tela.getByRole('button', { name: 'Entrar', exact: true }), 300);
  // Depois de sair, o aplicativo devolve a pessoa à última tela aberta; o vídeo recomeça cada perfil pela visão geral.
  // Pode voltar a uma tela que este perfil não acessa (sem título): o sinal de sessão aberta é o botão da conta.
  await expect(tela.getByRole('button', { name: 'Minha conta' })).toBeVisible({ timeout: 20_000 });
  const visaoGeral = tela.getByRole('heading', { level: 2, name: 'Visão geral' });
  await visaoGeral.waitFor({ timeout: 5_000 }).catch(() => undefined);
  if (!(await visaoGeral.isVisible())) await clicar(page, tela.getByRole('navigation').getByRole('link', { name: 'Visão geral', exact: true }), 300);
  await expect(visaoGeral).toBeVisible();
}

async function sair(page: Page): Promise<void> {
  await clicar(page, page.getByRole('button', { name: 'Minha conta' }), 300);
  await clicar(page, page.getByRole('button', { name: 'Sair' }), 300);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
}

async function menu(page: Page, item: string): Promise<void> {
  await clicar(page, page.getByRole('navigation').getByRole('link', { name: item, exact: true }), 700);
}

// Foto da entrega: a foto do protótipo instalado no cilindro, entregue ao campo da câmera como se viesse dela.
async function fotografar(tela: Tela | Locator): Promise<void> {
  await tela.locator('input[type="file"][capture]').first().evaluate(async (input) => {
    const imagem = new Image();
    imagem.src = '/landing/dispositivo-no-cilindro-373.webp';
    await imagem.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 640;
    const contexto = canvas.getContext('2d')!;
    contexto.fillStyle = '#1249B8';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    const escala = Math.min(canvas.width / imagem.naturalWidth, canvas.height / imagem.naturalHeight);
    contexto.drawImage(imagem, (canvas.width - imagem.naturalWidth * escala) / 2, canvas.height - imagem.naturalHeight * escala, imagem.naturalWidth * escala, imagem.naturalHeight * escala);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const transferencia = new DataTransfer();
    transferencia.items.add(new File([blob!], 'camera.jpg', { type: 'image/jpeg' }));
    (input as HTMLInputElement).files = transferencia.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// Assinatura com o dedo: um traço cursivo, com o indicador de toque acompanhando.
async function assinatura(page: Page, tela: Tela | Locator): Promise<void> {
  const area = tela.getByLabel('Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura.');
  await rolarAte(area, 'center', 700);
  const caixa = (await area.boundingBox())!;
  const ponto = (t: number) => ({
    x: caixa.x + caixa.width * (0.12 + t * 0.76),
    y: caixa.y + caixa.height * (0.55 - Math.sin(t * Math.PI * 5) * 0.22 - t * 0.08),
  });
  const inicio = ponto(0);
  await apontar(page, area, 0);
  await page.mouse.move(inicio.x, inicio.y);
  await page.mouse.down();
  for (let passo = 1; passo <= 40; passo += 1) {
    const { x, y } = ponto(passo / 40);
    await page.mouse.move(x, y, { steps: 2 });
    if (passo % 4 === 0) await page.evaluate(([px, py]) => (window as unknown as { __estudio: { cursor(x: number, y: number, i: boolean): void } }).__estudio.cursor(px!, py!, true), [x, y]);
  }
  await page.mouse.up();
  await esperar(600);
}

test.describe('Vídeo de demonstração (sob demanda)', () => {
  test.use({ actionTimeout: 15_000 });
  // Se algo falhar no meio, guarda como cada página estava, para achar o passo.
  const abertas: Page[] = [];
  // O Playwright exige o primeiro argumento desestruturado, mesmo sem fixture.
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, info) => {
    if (info.status === info.expectedStatus) return;
    for (const [indice, aberta] of abertas.entries()) await aberta.screenshot({ path: join(PASTA, '..', `erro-${indice}.png`) }).catch(() => undefined);
    abertas.length = 0;
  });
  test('o que já funciona, por quatro perfis', async ({ browser }) => {
    test.skip(process.env.GERAR_VIDEO_DEMONSTRACAO !== '1', 'Só roda quando se pede (GERAR_VIDEO_DEMONSTRACAO=1).');
    test.setTimeout(20 * 60_000);
    rmSync(PASTA, { recursive: true, force: true });
    const rolo = new Rolo(PASTA);
    const backend = montarBackend();

    const contexto = await novoContexto(browser);
    const page = await contexto.newPage();
    abertas.push(page);
    await instalarEstudio(page);
    await installFieldReaders(page, { camera: true, nfc: false });
    await ligar(backend, page);
    await page.goto('/visao-geral');
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await rolo.gravar(page);

    // Abertura.
    await capitulo(page, {
      numero: 'DEMONSTRAÇÃO', titulo: 'O que já funciona no FluxID',
      subtitulo: 'Do estoque à entrega, com rastreio de cada cilindro, por quatro pessoas da mesma distribuidora.', mascote: '/landing/mascote-768.webp',
    }, 4200);

    // 1. Administradora.
    const { admin, estoque, gestor, motorista } = PESSOAS;
    await capitulo(page, { numero: 'CAPÍTULO 1', perfil: `${admin.papel} · ${admin.nome}`, cor: admin.cor, titulo: 'Acesso seguro e controlado', subtitulo: 'Cada pessoa só vê e faz o que o papel dela permite, e tudo fica registrado.', mascote: '/landing/mascote-tablet-588.webp' }, 3200);
    await legenda(page, fala(admin, 'Entrada com e-mail e senha', 'Sessões com prazo, limite por pessoa e verificação em duas etapas nas telas administrativas.'));
    await entrar(page, page, backend, 'admin');
    await legenda(page, fala(admin, 'Visão geral da operação', 'Mapa e indicadores da distribuidora num só lugar. A organização ativa aparece no topo.'), 2600);
    await menu(page, 'Pessoas do tenant');
    await legenda(page, fala(admin, 'Pessoas da organização', 'Convidar, bloquear e inativar acessos vale só para esta organização: os dados de cada cliente ficam isolados.'), 3000);
    await menu(page, 'Papéis e permissões');
    await legenda(page, fala(admin, 'Papéis e permissões', 'Papéis fixos e personalizados. Uma permissão crítica não pode ser delegada.'), 1800);
    await clicar(page, page.getByRole('button', { name: 'Novo papel' }));
    await digitar(page, page.getByLabel('Nome do papel'), 'Auditor interno');
    await digitar(page, page.getByLabel('Descrição'), 'Consulta a trilha de auditoria');
    await clicar(page, page.getByRole('checkbox', { name: /audit\.read/ }), 300);
    await apontar(page, page.getByRole('checkbox', { name: /platform\.manage/ }), 900);
    await digitar(page, page.getByLabel('Justificativa do papel'), 'Pedido da diretoria para a auditoria trimestral');
    await clicar(page, page.getByRole('button', { name: 'Salvar papel' }), 900);
    await expect(page.getByRole('heading', { name: 'Auditor interno' })).toBeVisible();
    await legenda(page, fala(admin, 'Atribuir com justificativa', 'Toda mudança de acesso pede um motivo e entra na trilha de auditoria.'));
    await clicar(page, page.getByRole('button', { name: `Atribuir papel a ${estoque.nome}` }));
    await escolher(page, page.getByLabel('Papel', { exact: true }), { label: 'Auditor interno' });
    await digitar(page, page.getByLabel('Justificativa da alteração'), 'Apoio na conferência do estoque');
    await clicar(page, page.getByRole('button', { name: 'Confirmar atribuição' }), 1200);
    await menu(page, 'Auditoria do tenant');
    await legenda(page, fala(admin, 'Trilha de auditoria', 'Somente leitura: quem fez, o quê, quando e com qual resultado, inclusive as tentativas negadas.'), 3400);
    await sair(page);
    assinar(backend, admin.nome);

    // 2. Estoquista: entrada no estoque.
    await capitulo(page, { numero: 'CAPÍTULO 2', perfil: `${estoque.papel} · ${estoque.nome}`, cor: estoque.cor, titulo: 'Cada cilindro com identidade', subtitulo: 'Entrada no estoque por QR Code, Data Matrix, NFC ou número do casco, e histórico de cada um.', mascote: '/landing/mascote-indicando-464.webp' }, 3200);
    await legenda(page, fala(estoque, 'O menu muda com o papel', 'O estoquista entra e vê só o que usa no dia a dia: cilindros, entrada no estoque e viagens.'));
    await entrar(page, page, backend, 'estoque', 18);
    await esperar(1200);
    await menu(page, 'Entrada no estoque');
    await legenda(page, fala(estoque, 'Entrada no estoque em sequência', 'Um leitor que age como teclado envia cada código com Enter. A tela fica pronta para a próxima leitura.'), 600);
    const campo = page.getByLabel('Identificador');
    await apontar(page, campo, 200);
    for (const codigo of ['QR-006', 'QR-007', 'QR-008', 'QR-009']) {
      await campo.pressSequentially(codigo, { delay: 35 });
      await page.keyboard.press('Enter');
      await expect(page.getByText(new RegExp(`Cilindro CIL-${codigo.slice(3)} está em estoque`))).toBeVisible();
      await esperar(700);
    }
    await legenda(page, fala(estoque, 'Sem duplicar', 'Se a mesma leitura chega duas vezes, nada é duplicado: a entrada é registrada uma única vez.'), 600);
    await campo.pressSequentially('QR-006', { delay: 35 });
    await page.keyboard.press('Enter');
    await esperar(2200);
    await menu(page, 'Cilindros');
    await legenda(page, fala(estoque, 'Cilindros da organização', 'Busca por identificador ou número de série, com as situações cadastral, de estoque, do teste hidrostático e de custódia.'), 1600);
    await digitar(page, page.getByLabel('Buscar por identificador ou número de série'), 'CIL-006');
    await clicar(page, page.getByRole('button', { name: 'Buscar' }), 1000);
    await clicar(page, page.getByRole('link', { name: 'CIL-006', exact: true }), 1200);
    await legenda(page, fala(estoque, 'Histórico do cilindro', 'Cadastro, identificadores, teste hidrostático e cada movimentação, em ordem, com quem fez.'), 1200);
    await rolarAte(page.getByRole('heading', { name: /Histórico/ }).first(), 'start', 2600);
    await sair(page);
    assinar(backend, estoque.nome);

    // 3. Gestor: planejamento da viagem.
    await capitulo(page, { numero: 'CAPÍTULO 3', perfil: `${gestor.papel} · ${gestor.nome}`, cor: gestor.cor, titulo: 'Viagem planejada em minutos', subtitulo: 'Veículo, motorista, paradas e os cilindros de cada cliente, com as regras checadas antes de salvar.', mascote: '/landing/mascote-tablet-588.webp' }, 3200);
    await entrar(page, page, backend, 'gestor', 18);
    await legenda(page, fala(gestor, 'Cadastros da operação', 'Clientes com unidades e geocercas, veículos com a capacidade e motoristas com a validade da CNH.'));
    await menu(page, 'Clientes');
    await esperar(1500);
    await menu(page, 'Veículos');
    await esperar(1300);
    await menu(page, 'Motoristas');
    await esperar(1500);
    await menu(page, 'Viagens');
    await legenda(page, fala(gestor, 'Planejar a viagem', 'Data, veículo e motorista. A capacidade do veículo e a CNH do motorista são conferidas antes de a viagem sair.'));
    await clicar(page, page.getByRole('main').getByRole('link', { name: 'Planejar viagem' }).or(page.getByRole('main').getByRole('button', { name: 'Planejar viagem' })).first(), 900);
    const dialogo = page.getByRole('dialog', { name: 'Planejar viagem' });
    await escolher(page, dialogo.getByLabel('Veículo'), { label: 'ABC-1234 — 30 cilindros' });
    await escolher(page, dialogo.getByLabel('Motorista'), { label: motorista.nome });
    await legenda(page, fala(gestor, 'Paradas e cilindros', 'Cada parada é uma unidade de cliente. A lista só oferece cilindros em estoque, ativos e com o teste em dia.'));
    await escolher(page, dialogo.getByLabel('Unidade da parada 1'), { index: 1 });
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 1' }));
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-006' }), 300);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-007' }), 300);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar parada' }));
    await escolher(page, dialogo.getByLabel('Unidade da parada 2'), { index: 2 });
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 2' }));
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-008' }), 300);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-009' }), 300);
    await legenda(page, fala(gestor, 'Resumo ao vivo', 'Paradas, cilindros e quanto ainda cabe no veículo. Ao salvar, os cilindros ficam reservados para esta viagem.'));
    await apontar(page, dialogo.getByText('4 de 30'), 1400);
    await digitar(page, dialogo.getByLabel('Observações'), 'Entregar pela entrada de cargas');
    await clicar(page, dialogo.getByRole('button', { name: 'Planejar viagem' }), 1200);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    const viagem = backend.trips.trips[0]!.id as string;
    await legenda(page, fala(gestor, 'Viagem n.º 1 planejada', 'Duas paradas e quatro cilindros reservados. Um cilindro só participa de uma viagem aberta por vez.'), 600);
    await rolarAte(page.getByRole('heading', { name: 'Parada 1' }), 'start', 2800);
    await sair(page);
    assinar(backend, gestor.nome);

    // 4. Estoquista: conferência da carga.
    await capitulo(page, { numero: 'CAPÍTULO 4', perfil: `${estoque.papel} · ${estoque.nome}`, cor: estoque.cor, titulo: 'Carga conferida, um a um', subtitulo: 'A viagem só começa quando cada cilindro previsto foi lido no carregamento.', mascote: '/landing/mascote-indicando-464.webp' }, 3000);
    await entrar(page, page, backend, 'estoque', 18);
    await page.goto(`/viagens/${viagem}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await legenda(page, fala(estoque, 'Iniciar o carregamento', 'A conferência abre na própria viagem.'));
    await clicar(page, page.getByRole('button', { name: 'Iniciar carregamento' }), 900);
    await legenda(page, fala(estoque, 'Leitura pela câmera', 'O código do cilindro é lido pela câmera do aparelho. Cilindro de outra viagem ou de outra organização é recusado.'));
    await clicar(page, page.getByRole('button', { name: 'Ler cilindro' }), 900);
    const leitor = page.getByRole('dialog', { name: 'Ler cilindro' });
    await page.evaluate(() => (window as unknown as { __fluxidFake: { frames: string[][] } }).__fluxidFake.frames.push(['QR-006']));
    await expect(leitor.getByText('Cilindro CIL-006 conferido.')).toBeVisible();
    await esperar(1400);
    await page.evaluate(() => (window as unknown as { __fluxidFake: { frames: string[][] } }).__fluxidFake.frames.push(['QR-007']));
    await expect(leitor.getByText('Cilindro CIL-007 conferido.')).toBeVisible();
    await esperar(1400);
    await clicar(page, leitor.getByRole('button', { name: 'Fechar' }), 700);
    await legenda(page, fala(estoque, 'Ou pelo código digitado', 'Sem câmera, o código vale do mesmo jeito. O servidor guarda como cada cilindro foi conferido.'));
    await digitar(page, page.getByLabel('Código do cilindro'), 'QR-008', 40);
    await clicar(page, page.getByRole('button', { name: 'Conferir código' }), 900);
    await digitar(page, page.getByLabel('Código do cilindro'), 'QR-009', 40);
    await clicar(page, page.getByRole('button', { name: 'Conferir código' }), 900);
    await expect(page.getByText('4 de 4 conferidos')).toBeVisible();
    await legenda(page, fala(estoque, 'Viagem iniciada', 'Os quatro cilindros passam a "em trânsito" e ficam bloqueados no sistema até a entrega.'));
    await clicar(page, page.getByRole('button', { name: 'Iniciar viagem' }), 1200);
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
    await rolarAte(page.getByRole('heading', { name: 'Parada 1' }), 'start', 2600);
    await sair(page);
    assinar(backend, estoque.nome);

    // 5. Motorista no celular.
    await capitulo(page, { numero: 'CAPÍTULO 5', perfil: `${motorista.papel} · ${motorista.nome}`, cor: motorista.cor, titulo: 'A entrega, com evidência', subtitulo: 'No celular: chegada com GPS e geocerca, recebedor, foto, assinatura e registro mesmo sem sinal.', mascote: '/landing/mascote-procurando-323.webp' }, 3200);
    await rolo.parar();
    const contextoCelular = await novoContexto(browser);
    const estudio = await contextoCelular.newPage();
    abertas.push(estudio);
    await instalarEstudio(estudio);
    await ligar(backend, estudio);
    await estudio.goto('/__video/celular');
    await expect(celular(estudio).getByLabel('E-mail')).toBeVisible();
    await estudio.evaluate(() => document.fonts.ready);
    await modo(estudio, 'lateral', true);
    await legenda(estudio, fala(motorista, 'O aplicativo de campo', 'O mesmo sistema, no celular da motorista, instalável como aplicativo.'));
    await rolo.gravar(estudio);
    await esperar(800);
    const fone = celular(estudio);
    await entrar(estudio, fone, backend, 'motorista', 18);
    await esperar(900);
    await legenda(estudio, fala(motorista, 'A viagem do dia', 'A motorista abre a viagem que vai fazer, com as paradas em ordem.'));
    await fone.evaluate((id) => { window.history.pushState(null, '', `/viagens/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }, viagem);
    await expect(fone.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await esperar(1200);
    await legenda(estudio, fala(motorista, 'Chegada com a posição', 'O GPS informa a posição e a precisão, e o sistema diz se ela está dentro da geocerca do cliente.'));
    await clicar(estudio, fone.getByRole('button', { name: /Chegada com a posição da parada 1/ }), 800);
    await clicar(estudio, fone.getByRole('button', { name: 'Usar minha posição' }), 1200);
    await clicar(estudio, fone.getByRole('button', { name: 'Registrar chegada com a posição' }), 900);
    await expect(fone.getByText('Dentro da geocerca da unidade.')).toBeVisible();
    await rolarAte(fone.getByText('Dentro da geocerca da unidade.'), 'center', 2200);
    await legenda(estudio, fala(motorista, 'Registro da entrega', 'Quem recebeu, a função, até três fotos e a assinatura. A foto é reduzida e perde os metadados antes do envio.'));
    await clicar(estudio, fone.getByRole('button', { name: 'Registrar entrega da parada 1' }), 800);
    const entrega = fone.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await digitar(estudio, entrega.getByLabel('Nome de quem recebeu'), 'Juliana Prado', 40);
    await digitar(estudio, entrega.getByLabel('Função (opcional)'), 'Enfermeira', 40);
    await apontar(estudio, entrega.getByRole('button', { name: 'Tirar foto' }), 100);
    await estudio.evaluate(() => (window as unknown as { __estudio: { clique(): void } }).__estudio.clique());
    await fotografar(entrega);
    await expect(entrega.getByText('1 de 3')).toBeVisible();
    await rolarAte(entrega.getByAltText('Foto 1 da entrega'), 'center', 1600);
    await assinatura(estudio, entrega);
    await clicar(estudio, entrega.getByRole('button', { name: 'Registrar entrega' }), 1500);
    await expect(fone.getByText('Situação da parada: Entregue')).toBeVisible();
    await rolarAte(fone.getByText('Situação da parada: Entregue'), 'center', 2400);
    assinar(backend, motorista.nome);

    // Sem sinal: a chegada à parada 2 fica na fila e vai sozinha quando a conexão volta.
    await expect.poll(() => fone.evaluate(async () => {
      const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const pedido = indexedDB.open('fluxid-local'); pedido.onsuccess = () => resolve(pedido.result); pedido.onerror = () => reject(pedido.error); });
      const total = await new Promise<number>((resolve) => { const pedido = aberto.transaction('local_trips').objectStore('local_trips').count(); pedido.onsuccess = () => resolve(pedido.result); pedido.onerror = () => resolve(0); });
      aberto.close();
      return total;
    })).toBeGreaterThan(0);
    await rolo.parar();
    await fone.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(fone.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
    await fone.evaluate(() => window.history.back());
    await expect(fone.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await rolarAte(fone.getByRole('heading', { name: 'Parada 2' }), 'start', 400);
    await legenda(estudio, fala(motorista, 'Sem sinal na estrada', 'Sem conexão, o registro fica guardado no aparelho, numa fila, com a hora em que aconteceu.'));
    await rolo.gravar(estudio);
    await esperar(1200);
    await contextoCelular.setOffline(true);
    await esperar(1800);
    await clicar(estudio, fone.getByRole('button', { name: /Registrar chegada à parada 2/ }), 1000);
    await expect(fone.getByText('Situação da parada: No local, pendente de envio')).toBeVisible();
    await rolarAte(fone.getByText('Situação da parada: No local, pendente de envio'), 'center', 2400);
    await legenda(estudio, fala(motorista, 'O sinal voltou', 'A fila é enviada sozinha, em ordem e uma vez só. Nada se perde e nada se duplica.'));
    await esperar(800);
    await contextoCelular.setOffline(false);
    const parada2 = () => backend.trips.stopsOf(viagem).find((parada) => parada.position === 2)!.status;
    await expect.poll(parada2, { timeout: 20_000 }).toBe('on_site');
    await esperar(1200);
    // A tela da viagem não relê o servidor sozinha depois do envio: a fila vazia aparece na Sincronização e, de volta à viagem, a chegada.
    await fone.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(fone.getByText('Nada pendente. Tudo foi enviado.')).toBeVisible({ timeout: 20_000 });
    await esperar(2600);
    await fone.evaluate((id) => { window.history.pushState(null, '', `/viagens/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }, viagem);
    await expect(fone.getByText('Situação da parada: No local', { exact: true })).toBeVisible({ timeout: 20_000 });
    await rolarAte(fone.getByRole('heading', { name: 'Parada 2' }), 'start', 1800);
    await clicar(estudio, fone.getByRole('button', { name: 'Registrar entrega da parada 2' }), 800);
    const entrega2 = fone.getByRole('dialog', { name: 'Registrar entrega · Parada 2' });
    await digitar(estudio, entrega2.getByLabel('Nome de quem recebeu'), 'Marcos Teixeira', 35);
    await clicar(estudio, entrega2.getByRole('button', { name: 'Registrar entrega' }), 1500);
    await expect(fone.getByText('Situação da parada: Entregue')).toHaveCount(2);
    await esperar(1500);
    assinar(backend, motorista.nome);
    await rolo.parar();
    await contextoCelular.close();

    // 6. Gestor fecha o ciclo.
    await modo(page, 'rodape', false);
    await legenda(page, null);
    await rolo.gravar(page);
    await capitulo(page, { numero: 'CAPÍTULO 6', perfil: `${gestor.papel} · ${gestor.nome}`, cor: gestor.cor, titulo: 'Onde está cada cilindro?', subtitulo: 'A pergunta passa a ter resposta com evidências: quando saiu, com quem, para onde e quem recebeu.', mascote: '/landing/mascote-cilindro-749.webp' }, 3200);
    await entrar(page, page, backend, 'gestor', 18);
    await page.goto(`/viagens/${viagem}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await legenda(page, fala(gestor, 'A entrega chega ao escritório', 'Recebedor, horário, posição, foto e assinatura, registrados no celular, aparecem na viagem.'));
    await rolarAte(page.getByRole('heading', { name: 'Parada 1' }), 'start', 3000);
    await legenda(page, fala(gestor, 'Liberação registrada', 'Entrega e liberação são registros separados. A trava física vai confirmar o desbloqueio na fase do piloto.'));
    await clicar(page, page.getByRole('button', { name: 'Registrar desbloqueio de CIL-006' }), 900);
    await clicar(page, page.getByRole('dialog').getByRole('button', { name: 'Registrar desbloqueio' }), 1500);
    await legenda(page, fala(gestor, 'Viagem concluída', 'Com todas as paradas encerradas, a viagem é concluída. Cada passo fica no histórico, com quem fez e quando.'));
    await clicar(page, page.getByRole('button', { name: 'Concluir viagem' }), 1500);
    await expect(page.getByText('Situação da viagem: Concluída')).toBeVisible();
    await rolarAte(page.getByRole('heading', { level: 3, name: 'Histórico' }), 'start', 3600);
    await legenda(page, fala(gestor, 'A resposta, com evidência', 'O cilindro CIL-006 está no cliente, desde a entrega, com toda a trajetória registrada.'));
    await page.goto('/cilindros');
    await digitar(page, page.getByLabel('Buscar por identificador ou número de série'), 'CIL-006');
    await clicar(page, page.getByRole('button', { name: 'Buscar' }), 1000);
    await clicar(page, page.getByRole('link', { name: 'CIL-006', exact: true }), 1200);
    await rolarAte(page.getByRole('heading', { name: /Histórico/ }).first(), 'start', 3400);
    await legenda(page, null);
    await capitulo(page, {
      numero: 'FLUXID', titulo: 'Plataforma pronta para o piloto',
      subtitulo: 'Próximo passo: a trava física inteligente na válvula, confirmando bloqueio e liberação no próprio cilindro.', mascote: '/landing/mascote-cilindro-749.webp',
    }, 4500, true);
    await rolo.parar();
    const lista = rolo.salvar();
    console.log(`Quadros prontos: ${lista}`);
    await contexto.close();
  });

  // Versão curta (até 90 s): a mesma história e os mesmos quatro perfis, só com os momentos mais fortes de cada um, cartelas rápidas, uma
  // legenda por passo e o ritmo acelerado (pausas e deslize do cursor a 60%). Fica de fora o que a completa mostra com calma: o tour
  // pelos cadastros, a leitura repetida, a fila sem sinal e o encerramento da viagem.
  test('versão curta, de até 90 s', async ({ browser }) => {
    test.skip(process.env.GERAR_VIDEO_DEMONSTRACAO !== 'curta', 'Só roda quando se pede (GERAR_VIDEO_DEMONSTRACAO=curta).');
    test.setTimeout(10 * 60_000);
    rmSync(PASTA_CURTA, { recursive: true, force: true });
    const rolo = new Rolo(PASTA_CURTA);
    const backend = montarBackend();
    const { admin, estoque, gestor, motorista } = PESSOAS;
    const RAPIDO = 8;
    // Na versão curta o login aparece uma vez só (o da administradora); nas outras trocas a gravação pausa e a cartela apresenta a pessoa.
    // A cartela abre sobre a tela nova antes de voltar a gravar: o corte cai na cartela cheia, sem a tela e a legenda do perfil anterior.
    const trocar = async (quem: keyof typeof PESSOAS, cartela: Capitulo, preparar?: () => Promise<void>): Promise<void> => {
      await rolo.parar();
      await sair(page);
      await entrar(page, page, backend, quem, 0);
      if (preparar) await preparar();
      await legenda(page, null);
      await abrirCapitulo(page, cartela);
      await rolo.gravar(page);
      await esperar(2600);
      await fecharCapitulo(page);
    };

    const contexto = await novoContexto(browser);
    const page = await contexto.newPage();
    abertas.push(page);
    await instalarEstudio(page);
    await installFieldReaders(page, { camera: true, nfc: false });
    await ligar(backend, page);
    await page.goto('/visao-geral');
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await definirRitmo(page, 0.6);
    await rolo.gravar(page);

    await capitulo(page, { numero: 'FLUXID EM 90 SEGUNDOS', titulo: 'O que já funciona', subtitulo: 'Quatro pessoas, uma viagem e cada cilindro rastreado do estoque à entrega.', mascote: '/landing/mascote-768.webp' }, 4400);

    // 1. Administradora: acesso por papel.
    await capitulo(page, { numero: '1 · ACESSO', perfil: `${admin.papel} · ${admin.nome}`, cor: admin.cor, titulo: 'Cada um vê só o que pode', subtitulo: 'Papéis, permissões e trilha de auditoria.' }, 2600);
    await legenda(page, fala(admin, 'Papéis e permissões', 'Cria um papel, escolhe as permissões e justifica. Tudo entra na auditoria.'));
    await entrar(page, page, backend, 'admin', RAPIDO);
    await menu(page, 'Papéis e permissões');
    await clicar(page, page.getByRole('button', { name: 'Novo papel' }));
    await digitar(page, page.getByLabel('Nome do papel'), 'Auditor interno', RAPIDO);
    await clicar(page, page.getByRole('checkbox', { name: /audit\.read/ }), 200);
    await digitar(page, page.getByLabel('Justificativa do papel'), 'Auditoria trimestral', RAPIDO);
    await clicar(page, page.getByRole('button', { name: 'Salvar papel' }), 1200);
    await expect(page.getByRole('heading', { name: 'Auditor interno' })).toBeVisible();
    await menu(page, 'Auditoria do tenant');
    await esperar(2000);
    assinar(backend, admin.nome);

    // 2. Estoquista: entrada no estoque.
    await trocar('estoque', { numero: '2 · ESTOQUE', perfil: `${estoque.papel} · ${estoque.nome}`, cor: estoque.cor, titulo: 'Cada cilindro com identidade', subtitulo: 'Entrada por QR Code, Data Matrix, NFC ou número do casco.' }, async () => {
      await menu(page, 'Entrada no estoque');
    });
    await legenda(page, fala(estoque, 'Entrada no estoque em sequência', 'Cada leitura entra com Enter, sem duplicar. O menu mostra só o que o estoquista usa.'));
    const campo = page.getByLabel('Identificador');
    await apontar(page, campo, 0);
    for (const codigo of ['QR-006', 'QR-007', 'QR-008', 'QR-009']) {
      await campo.pressSequentially(codigo, { delay: 15 });
      await page.keyboard.press('Enter');
      await expect(page.getByText(new RegExp(`Cilindro CIL-${codigo.slice(3)} está em estoque`))).toBeVisible();
      await esperar(500);
    }
    await esperar(800);
    assinar(backend, estoque.nome);

    // 3. Gestor: planejamento.
    const dialogo = page.getByRole('dialog', { name: 'Planejar viagem' });
    await trocar('gestor', { numero: '3 · VIAGEM', perfil: `${gestor.papel} · ${gestor.nome}`, cor: gestor.cor, titulo: 'Viagem planejada em minutos', subtitulo: 'Veículo, motorista, paradas e os cilindros de cada cliente.' }, async () => {
      await page.goto('/viagens/nova');
      await expect(dialogo.getByLabel('Veículo')).toBeVisible();
    });
    await legenda(page, fala(gestor, 'Planejar a viagem', 'Só entram cilindros em estoque e com o teste em dia. Ao salvar, ficam reservados.'));
    await escolher(page, dialogo.getByLabel('Veículo'), { label: 'ABC-1234 — 30 cilindros' }, 200);
    await escolher(page, dialogo.getByLabel('Motorista'), { label: motorista.nome }, 200);
    await escolher(page, dialogo.getByLabel('Unidade da parada 1'), { index: 1 }, 200);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 1' }), 300);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-006' }), 150);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-007' }), 150);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar parada' }), 300);
    await escolher(page, dialogo.getByLabel('Unidade da parada 2'), { index: 2 }, 200);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar cilindros à parada 2' }), 300);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-008' }), 150);
    await clicar(page, dialogo.getByRole('button', { name: 'Adicionar CIL-009' }), 150);
    await apontar(page, dialogo.getByText('4 de 30'), 600);
    await clicar(page, dialogo.getByRole('button', { name: 'Planejar viagem' }), 1000);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    const viagem = backend.trips.trips[0]!.id as string;
    await rolarAte(page.getByRole('heading', { name: 'Parada 1' }), 'start', 1600);
    assinar(backend, gestor.nome);

    // 4. Estoquista: conferência da carga.
    await trocar('estoque', { numero: '4 · CARGA', perfil: `${estoque.papel} · ${estoque.nome}`, cor: estoque.cor, titulo: 'Carga conferida, um a um', subtitulo: 'A viagem só sai com todos os cilindros lidos.' }, async () => {
      await page.goto(`/viagens/${viagem}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    });
    await legenda(page, fala(estoque, 'Conferência pela câmera', 'Lido o último cilindro, a viagem começa e a carga fica bloqueada até a entrega.'));
    await clicar(page, page.getByRole('button', { name: 'Iniciar carregamento' }), 600);
    await clicar(page, page.getByRole('button', { name: 'Ler cilindro' }), 600);
    const leitor = page.getByRole('dialog', { name: 'Ler cilindro' });
    for (const codigo of ['QR-006', 'QR-007', 'QR-008', 'QR-009']) {
      await page.evaluate((valor) => (window as unknown as { __fluxidFake: { frames: string[][] } }).__fluxidFake.frames.push([valor]), codigo);
      await expect(leitor.getByText(`Cilindro CIL-${codigo.slice(3)} conferido.`)).toBeVisible();
      await esperar(900);
    }
    await clicar(page, leitor.getByRole('button', { name: 'Fechar' }), 400);
    await clicar(page, page.getByRole('button', { name: 'Iniciar viagem' }), 1000);
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
    await rolarAte(page.getByRole('heading', { name: 'Parada 1' }), 'start', 1600);
    assinar(backend, estoque.nome);

    // 5. Motorista no celular.
    await capitulo(page, { numero: '5 · ENTREGA', perfil: `${motorista.papel} · ${motorista.nome}`, cor: motorista.cor, titulo: 'A entrega, com evidência', subtitulo: 'GPS e geocerca, recebedor, foto e assinatura, no celular.' }, 2600, true);
    await rolo.parar();
    const contextoCelular = await novoContexto(browser);
    const estudio = await contextoCelular.newPage();
    abertas.push(estudio);
    await instalarEstudio(estudio);
    await ligar(backend, estudio);
    await estudio.goto('/__video/celular');
    const fone = celular(estudio);
    await expect(fone.getByLabel('E-mail')).toBeVisible();
    await estudio.evaluate(() => document.fonts.ready);
    await modo(estudio, 'lateral', true);
    await definirRitmo(estudio, 0.6);
    // O login no celular acontece antes de gravar: o trecho começa na viagem do dia.
    await entrar(estudio, fone, backend, 'motorista', 0);
    await fone.evaluate((id) => { window.history.pushState(null, '', `/viagens/${id}`); window.dispatchEvent(new PopStateEvent('popstate')); }, viagem);
    await expect(fone.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await legenda(estudio, fala(motorista, 'Chegada com o GPS', 'A posição e a precisão entram no registro, e o sistema confere a geocerca do cliente.'));
    await rolo.gravar(estudio);
    await esperar(800);
    await clicar(estudio, fone.getByRole('button', { name: /Chegada com a posição da parada 1/ }), 500);
    await clicar(estudio, fone.getByRole('button', { name: 'Usar minha posição' }), 900);
    await clicar(estudio, fone.getByRole('button', { name: 'Registrar chegada com a posição' }), 600);
    await expect(fone.getByText('Dentro da geocerca da unidade.')).toBeVisible();
    await rolarAte(fone.getByText('Dentro da geocerca da unidade.'), 'center', 2200);
    await legenda(estudio, fala(motorista, 'Recebedor, foto e assinatura', 'A entrega fica com quem recebeu, quando e onde, com até três fotos e a assinatura.'));
    await clicar(estudio, fone.getByRole('button', { name: 'Registrar entrega da parada 1' }), 500);
    const entrega = fone.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await digitar(estudio, entrega.getByLabel('Nome de quem recebeu'), 'Juliana Prado', 15);
    await apontar(estudio, entrega.getByRole('button', { name: 'Tirar foto' }), 0);
    await estudio.evaluate(() => (window as unknown as { __estudio: { clique(): void } }).__estudio.clique());
    await fotografar(entrega);
    await expect(entrega.getByText('1 de 3')).toBeVisible();
    await rolarAte(entrega.getByAltText('Foto 1 da entrega'), 'center', 900);
    await assinatura(estudio, entrega);
    await clicar(estudio, entrega.getByRole('button', { name: 'Registrar entrega' }), 900);
    await expect(fone.getByText('Situação da parada: Entregue')).toBeVisible();
    await rolarAte(fone.getByText('Situação da parada: Entregue'), 'center', 2800);
    await rolo.parar();
    assinar(backend, motorista.nome);
    await contextoCelular.close();

    // Fecho: a resposta da pergunta do pitch e a cartela final. A cartela do capítulo 5 ainda está na página do computador, fora da gravação.
    await fecharCapitulo(page);
    await legenda(page, null);
    await sair(page);
    await entrar(page, page, backend, 'gestor', 0);
    await page.goto('/cilindros');
    await expect(page.getByLabel('Buscar por identificador ou número de série')).toBeVisible();
    await abrirCapitulo(page, { numero: '6 · RESPOSTA', perfil: `${gestor.papel} · ${gestor.nome}`, cor: gestor.cor, titulo: 'Onde está o CIL-006?', subtitulo: 'No cliente, desde a entrega, com toda a trajetória registrada.' });
    await rolo.gravar(page);
    await esperar(2600);
    await fecharCapitulo(page);
    await digitar(page, page.getByLabel('Buscar por identificador ou número de série'), 'CIL-006', RAPIDO);
    await clicar(page, page.getByRole('button', { name: 'Buscar' }), 700);
    await legenda(page, fala(gestor, 'A resposta, com evidência', 'Custódia no cliente e o histórico de cada movimento, com quem fez e quando.'));
    await clicar(page, page.getByRole('link', { name: 'CIL-006', exact: true }), 1400);
    await rolarAte(page.getByRole('heading', { name: /Histórico/ }).first(), 'start', 2400);
    await legenda(page, null);
    await capitulo(page, { numero: 'FLUXID', titulo: 'Pronto para o piloto', subtitulo: 'Próximo passo: a trava física na válvula, confirmando bloqueio e liberação no próprio cilindro.', mascote: '/landing/mascote-cilindro-749.webp' }, 6000, true);
    await rolo.parar();
    console.log(`Quadros prontos: ${rolo.salvar()}`);
    await contexto.close();
  });
});
