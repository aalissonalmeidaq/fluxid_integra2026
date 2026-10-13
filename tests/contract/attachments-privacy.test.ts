// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { capturePhoto, hasExif, type ImagePipeline } from '../../src/infrastructure/attachments/photo-capture';

// Spec 010, T057 (RF-019, RF-023, RNF-006; research.md §11): só `src/infrastructure/attachments/` gera, manipula e envia imagem. O contrato da Spec 009
// (`field-no-camera-frames-sent`) continua proibindo a leitura de identificador de fazer o mesmo; este garante o outro lado: a foto que sai é JPEG sem EXIF, e nenhuma
// imagem aparece em log, URL ou mensagem de erro.
const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWED_DIR = 'src/infrastructure/attachments/';
// A imagem de perfil (Spec 002) é outro assunto: o avatar do próprio usuário, validado pelos bytes na função `profile-avatar`.
const PROFILE_AVATAR = 'src/pages/profile/';

function sources(dir: string): string[] {
  const full = path.join(ROOT, dir);
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(relative);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}
const cache = new Map<string, string>();
const read = (file: string): string => {
  let text = cache.get(file);
  if (text === undefined) {
    text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    cache.set(file, text);
  }
  return text;
};

const ALL = sources('src');
// Cada interface do navegador que gera, lê, grava ou transfere a imagem.
const IMAGE_APIS: [string, RegExp][] = [
  ['canvas.toBlob', /\btoBlob\b/], ['canvas.toDataURL', /\btoDataURL\b/], ['getImageData', /\bgetImageData\b/], ['drawImage', /\bdrawImage\b/],
  ['createImageBitmap', /\bcreateImageBitmap\b/], ['ImageCapture', /\bImageCapture\b/], ['MediaRecorder', /\bMediaRecorder\b/], ['FileReader', /\bFileReader\b/],
  ['URL.createObjectURL', /\bcreateObjectURL\b/],
];

describe('só a pasta de anexos gera e manipula imagem', () => {
  // Lê o código-fonte uma vez só (é a parte lenta); os testes seguintes usam a cópia em memória.
  beforeAll(() => { for (const file of ALL) read(file); }, 60_000);

  it.each(IMAGE_APIS)('%s só aparece em src/infrastructure/attachments/', (_name, pattern) => {
    const outside = ALL.filter((file) => !file.startsWith(ALLOWED_DIR) && !file.startsWith(PROFILE_AVATAR) && pattern.test(read(file)));
    expect(outside, `fora da pasta de anexos: ${outside.join(', ')}`).toEqual([]);
  });

  it('o envio de imagem (multipart para trip-attachments) só existe na pasta de anexos', () => {
    const senders = ALL.filter((file) => /trip-attachments/.test(read(file)) && !/^src\/(domain|application)\//.test(file));
    expect(senders).toEqual(['src/infrastructure/attachments/attachment-transport.ts']);
    expect(ALL.filter((file) => !file.startsWith(ALLOWED_DIR) && !file.startsWith(PROFILE_AVATAR) && /new FormData\(/.test(read(file)) && /\bBlob\b/.test(read(file)))).toEqual([]);
  });

  it('o código de anexos não escreve em console nem monta URL de dados', () => {
    for (const file of ALL.filter((candidate) => candidate.startsWith(ALLOWED_DIR) || candidate === 'src/application/field/attachment-service.ts')) {
      const text = read(file);
      expect(text, `${file} usa console`).not.toMatch(/\bconsole\s*\./);
      expect(text, `${file} monta URL de dados`).not.toMatch(/data:image/);
    }
  });

  it('nenhuma mensagem de erro do código de anexos carrega bytes, resumo ou caminho', () => {
    for (const file of ['src/infrastructure/attachments/photo-capture.ts', 'src/infrastructure/attachments/signature-canvas.ts', 'src/infrastructure/attachments/attachment-transport.ts', 'src/application/field/attachment-service.ts']) {
      for (const match of read(file).matchAll(/new Error\(([^)]*)\)/g)) expect(match[1], `${file}: ${match[0]}`).not.toMatch(/\$\{|\+/);
    }
  });
});

describe('a foto que sai não traz metadados', () => {
  const app = (marker: number, payload: string): number[] => [0xff, marker, 0, payload.length + 2, ...[...payload].map((char) => char.charCodeAt(0))];
  const dirty = Uint8Array.from([0xff, 0xd8, ...app(0xe0, 'JFIF\0'), ...app(0xe1, 'Exif\0\0GPS-23.55,-46.63'), ...app(0xfe, 'aparelho-fictício'), 0xff, 0xda, 0, 4, 0, 0, 1, 2, 0xff, 0xd9]);
  const pipeline: ImagePipeline = { decode: async () => ({ width: 3000, height: 2000 }), encode: async () => dirty.buffer.slice(0) as ArrayBuffer };

  it('mesmo que o codificador deixe passar EXIF e comentário, a foto devolvida sai limpa', async () => {
    expect(hasExif(dirty)).toBe(true);
    const result = await capturePhoto(new Blob([new Uint8Array(10)]), pipeline);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bytes = new Uint8Array(result.photo.bytes);
    expect(hasExif(bytes)).toBe(false);
    expect(new TextDecoder('latin1').decode(bytes)).not.toMatch(/GPS|Exif|aparelho/);
    expect(bytes.subarray(0, 3)).toEqual(Uint8Array.from([0xff, 0xd8, 0xff]));
  });

  it('a foto vai em JPEG de até 1.600 px no lado maior', async () => {
    let seen = { width: 0, height: 0 };
    await capturePhoto(new Blob([new Uint8Array(10)]), { ...pipeline, encode: async (_file, width, height) => { seen = { width, height }; return dirty.buffer.slice(0) as ArrayBuffer; } });
    expect(Math.max(seen.width, seen.height)).toBeLessThanOrEqual(1600);
  });
});
