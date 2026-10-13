import { fitWithin, PHOTO_CONTENT_TYPE, PHOTO_MAX_BYTES, PHOTO_MAX_LONG_EDGE_PX, PHOTO_QUALITY_STEPS } from '@/domain/field/attachment-limits';

// Captura da foto da entrega (Spec 010, RF-018, RF-019; research.md §11). A imagem vem de `<input type="file" accept="image/*" capture="environment">`, é reduzida
// (lado maior de até 1.600 px) e **recodificada em JPEG** com a qualidade caindo em passos até caber em 1,5 MB. A recodificação por canvas não carrega EXIF, e
// `stripJpegMetadata` repete a garantia byte a byte (defesa em profundidade): nenhuma localização, modelo do aparelho ou comentário sai do aparelho. Só esta pasta
// gera e manipula imagem; a leitura de identificador (Spec 009) continua proibida de fazê-lo (tests/contract/attachments-privacy.test.ts).
export type PhotoFailure = 'invalid_image' | 'too_large';

export interface CapturedPhoto {
  id: string;
  bytes: ArrayBuffer;
  sizeBytes: number;
  sha256: string;
  contentType: typeof PHOTO_CONTENT_TYPE;
  width: number;
  height: number;
  capturedAt: string;
}

export type PhotoResult = { ok: true; photo: CapturedPhoto } | { ok: false; failure: PhotoFailure };

// O que o navegador faz (decodificar e codificar), atrás de uma interface para os testes simularem.
export interface ImagePipeline {
  decode(file: Blob): Promise<{ width: number; height: number }>;
  encode(file: Blob, width: number, height: number, quality: number): Promise<ArrayBuffer>;
}

export interface CaptureOptions {
  now?: () => Date;
  newId?: () => string;
}

const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const isJpeg = (bytes: Uint8Array): boolean => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export async function capturePhoto(file: Blob, pipeline: ImagePipeline, options: CaptureOptions = {}): Promise<PhotoResult> {
  if (file.size === 0) return { ok: false, failure: 'invalid_image' };
  let size: { width: number; height: number };
  try {
    size = await pipeline.decode(file);
  } catch {
    return { ok: false, failure: 'invalid_image' };
  }
  let target: { width: number; height: number };
  try {
    target = fitWithin(size.width, size.height, PHOTO_MAX_LONG_EDGE_PX);
  } catch {
    return { ok: false, failure: 'invalid_image' };
  }

  for (const quality of PHOTO_QUALITY_STEPS) {
    let encoded: ArrayBuffer;
    try {
      encoded = await pipeline.encode(file, target.width, target.height, quality);
    } catch {
      return { ok: false, failure: 'invalid_image' };
    }
    const raw = new Uint8Array(encoded);
    // O navegador pode ignorar o tipo pedido e devolver outro formato: só JPEG segue.
    if (!isJpeg(raw)) return { ok: false, failure: 'invalid_image' };
    const clean = stripJpegMetadata(raw);
    if (clean.byteLength > PHOTO_MAX_BYTES) continue;
    const bytes = clean.buffer.slice(clean.byteOffset, clean.byteOffset + clean.byteLength) as ArrayBuffer;
    return {
      ok: true,
      photo: {
        id: (options.newId ?? (() => crypto.randomUUID()))(),
        bytes,
        sizeBytes: bytes.byteLength,
        sha256: hex(await crypto.subtle.digest('SHA-256', bytes)),
        contentType: PHOTO_CONTENT_TYPE,
        width: target.width,
        height: target.height,
        capturedAt: (options.now ?? (() => new Date()))().toISOString(),
      },
    };
  }
  return { ok: false, failure: 'too_large' };
}

// Percorre os segmentos do JPEG até o início da varredura e descarta os que carregam metadados: APP1 a APP15 (EXIF, XMP, perfis) e comentários. O JFIF (APP0), as
// tabelas e o quadro da imagem ficam. Arquivo que não é JPEG ou está truncado volta como veio (quem chama já recusou o que não é JPEG).
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) return input;
  const kept: Uint8Array[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) return input;
    const marker = input[offset + 1] as number;
    // Início da varredura: daqui em diante só há dados da imagem.
    if (marker === 0xda) { kept.push(input.subarray(offset)); return concat(kept); }
    // Marcadores sem tamanho (preenchimento, reinício, fim).
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { kept.push(input.subarray(offset, offset + 2)); offset += 2; continue; }
    const length = ((input[offset + 2] as number) << 8) | (input[offset + 3] as number);
    if (length < 2 || offset + 2 + length > input.length) return input;
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) kept.push(input.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  return input;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.byteLength; }
  return out;
}

// Há um segmento EXIF (APP1 com "Exif") antes da varredura?
export function hasExif(bytes: Uint8Array): boolean {
  if (!isJpeg(bytes)) return false;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1] as number;
    if (marker === 0xda) return false;
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
    const length = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif') return true;
    if (length < 2) return false;
    offset += 2 + length;
  }
  return false;
}

// A implementação do navegador: decodifica com `createImageBitmap` (que já aplica a orientação) e codifica por canvas. O canvas devolve JPEG sem metadados.
export function browserImagePipeline(): ImagePipeline {
  return {
    async decode(file) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    },
    async encode(file, width, height, quality) {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas_unavailable');
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PHOTO_CONTENT_TYPE, quality));
        if (!blob) throw new Error('encode_failed');
        return await blob.arrayBuffer();
      } finally {
        bitmap.close();
      }
    },
  };
}
