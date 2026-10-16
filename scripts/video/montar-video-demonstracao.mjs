// Monta o MP4 do vídeo de demonstração a partir dos quadros gravados por tests/e2e/video-demonstracao.gerar.spec.ts.
//   node scripts/video/montar-video-demonstracao.mjs [--ffmpeg caminho/do/ffmpeg] [--versao completa|curta] [--acelerar 1.1]
// A versão completa lê dist-video/quadros e grava fluxid-demonstracao.mp4; a curta lê dist-video/quadros-curta e grava
// fluxid-demonstracao-90s.mp4. "--acelerar" encurta a linha do tempo inteira pelo fator dado (1.1 = 10% mais rápido).
// A gravação traz cada quadro com a sua duração real (quadros.txt). Aqui a linha do tempo vira uma sequência fixa de 30 quadros por segundo
// (links para os mesmos JPEGs, sem copiar), porque a lista do FFmpeg estica para 1/25 s todo quadro mais curto e o vídeo ficaria mais longo
// que a gravação. O vídeo sai em 1920 x 1080, H.264, pronto para o YouTube e para tocar no navegador. O FFmpeg não é dependência do
// projeto: use o do sistema ou indique o caminho.
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argumento = (nome, padrao) => {
  const indice = process.argv.indexOf(nome);
  return indice > -1 ? process.argv[indice + 1] : padrao;
};
const curta = argumento('--versao', 'completa') === 'curta';
const acelerar = Number(argumento('--acelerar', '1'));
const ffmpeg = argumento('--ffmpeg', process.env.FFMPEG_PATH ?? 'ffmpeg');

const RAIZ = join(import.meta.dirname, '..', '..');
const QUADROS = join(RAIZ, 'dist-video', curta ? 'quadros-curta' : 'quadros');
const LISTA = join(QUADROS, 'quadros.txt');
const SEQUENCIA = join(RAIZ, 'dist-video', 'sequencia');
const SAIDA = join(RAIZ, 'dist-video', curta ? 'fluxid-demonstracao-90s.mp4' : 'fluxid-demonstracao.mp4');
const FPS = 30;

if (!existsSync(LISTA)) {
  console.error(`Lista de quadros não encontrada: ${LISTA}. Gere os quadros antes (veja o cabeçalho de video-demonstracao.gerar.spec.ts).`);
  process.exit(1);
}

// Pares (arquivo, duração) da lista do concat.
const entradas = [];
for (const linha of readFileSync(LISTA, 'utf8').split(/\r?\n/)) {
  const arquivo = /^file '(.+)'$/.exec(linha);
  if (arquivo) entradas.push({ arquivo: arquivo[1], duracao: 0 });
  const duracao = /^duration ([\d.]+)$/.exec(linha);
  if (duracao && entradas.length) entradas.at(-1).duracao = Number(duracao[1]);
}

rmSync(SEQUENCIA, { recursive: true, force: true });
mkdirSync(SEQUENCIA, { recursive: true });
let fim = 0;
let quadro = 0;
for (const { arquivo, duracao } of entradas) {
  fim += duracao / acelerar;
  while (quadro / FPS < fim) {
    linkSync(join(QUADROS, arquivo), join(SEQUENCIA, `${String(quadro).padStart(6, '0')}.jpg`));
    quadro += 1;
  }
}
console.log(`Linha do tempo: ${(quadro / FPS).toFixed(1)} s em ${quadro} quadros.`);

rmSync(SAIDA, { force: true });
const resultado = spawnSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', join(SEQUENCIA, '%06d.jpg'),
  '-vf', 'scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0D254D,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart',
  SAIDA,
], { stdio: 'inherit' });

if (resultado.status !== 0) process.exit(resultado.status ?? 1);
rmSync(SEQUENCIA, { recursive: true, force: true });
const { size } = statSync(SAIDA);
console.log(`Vídeo pronto: ${SAIDA} (${(size / 1024 / 1024).toFixed(1)} MB, ${(quadro / FPS).toFixed(1)} s)`);
