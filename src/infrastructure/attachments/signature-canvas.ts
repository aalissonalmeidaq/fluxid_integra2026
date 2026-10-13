import { isSignatureBlank, SIGNATURE_CONTENT_TYPE, SIGNATURE_MAX_BYTES } from '@/domain/field/attachment-limits';

// Assinatura de quem recebeu (Spec 010, RF-020; research.md §12): um canvas com traço por ponteiro (dedo, caneta e mouse), "Limpar" para refazer, assinatura sem traço
// de verdade não vale, e a saída é PNG de até 200 KB em fundo branco. É opcional: quem usa só teclado ou tecnologia assistiva conclui a entrega sem assinar. O desenho
// real entra por `SignatureSurface`, para os testes simularem.
export interface Point { x: number; y: number }

export interface SignatureSurface {
  readonly width: number;
  readonly height: number;
  // Pinta o fundo de branco (apaga o traço).
  clear(): void;
  drawSegment(from: Point, to: Point): void;
  // Quantos pixels têm traço (não são o fundo branco).
  countInkedPixels(): number;
  // PNG da área, na escala informada (1 = tamanho da área); fundo branco.
  toPng(scale: number): Promise<ArrayBuffer>;
}

export interface CapturedSignature {
  id: string;
  bytes: ArrayBuffer;
  sizeBytes: number;
  sha256: string;
  contentType: typeof SIGNATURE_CONTENT_TYPE;
  capturedAt: string;
}

export type SignatureFailure = 'blank' | 'too_large' | 'invalid_image';
export type SignatureResult = { ok: true; signature: CapturedSignature } | { ok: false; failure: SignatureFailure };

// Se o PNG da área inteira passa de 200 KB, a assinatura é redesenhada em escalas menores.
const SCALES = [1, 0.75, 0.5] as const;
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const isPng = (bytes: Uint8Array): boolean => bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

export class SignaturePad {
  private last: Point | null = null;
  private inked = 0;

  constructor(private readonly surface: SignatureSurface, private readonly options: { now?: () => Date; newId?: () => string } = {}) {
    surface.clear();
  }

  down(point: Point): void { this.last = point; }

  move(point: Point): void {
    if (!this.last) return;
    this.surface.drawSegment(this.last, point);
    this.last = point;
    this.inked = this.surface.countInkedPixels();
  }

  up(): void { this.last = null; }

  clear(): void {
    this.last = null;
    this.inked = 0;
    this.surface.clear();
  }

  // Um toque sem querer (poucos pixels) não é assinatura.
  isBlank(): boolean {
    return isSignatureBlank(this.inked, this.surface.width * this.surface.height);
  }

  async export(): Promise<SignatureResult> {
    if (this.isBlank()) return { ok: false, failure: 'blank' };
    for (const scale of SCALES) {
      let bytes: ArrayBuffer;
      try {
        bytes = await this.surface.toPng(scale);
      } catch {
        return { ok: false, failure: 'invalid_image' };
      }
      if (!isPng(new Uint8Array(bytes))) return { ok: false, failure: 'invalid_image' };
      if (bytes.byteLength > SIGNATURE_MAX_BYTES) continue;
      return {
        ok: true,
        signature: {
          id: (this.options.newId ?? (() => crypto.randomUUID()))(),
          bytes,
          sizeBytes: bytes.byteLength,
          sha256: hex(await crypto.subtle.digest('SHA-256', bytes)),
          contentType: SIGNATURE_CONTENT_TYPE,
          capturedAt: (this.options.now ?? (() => new Date()))().toISOString(),
        },
      };
    }
    return { ok: false, failure: 'too_large' };
  }
}

// A área de desenho do navegador: um canvas 2D, traço arredondado, fundo branco.
export function canvasSurface(canvas: HTMLCanvasElement): SignatureSurface {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas_unavailable');
  // As cores vêm dos tokens do tema (fundo branco e traço azul-marinho); sem o tema, vale branco e preto.
  const token = (name: string, fallback: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const paper = () => token('--color-branco', 'white');
  const ink = () => token('--color-navy', 'black');
  return {
    get width() { return canvas.width; },
    get height() { return canvas.height; },
    clear() {
      context.fillStyle = paper();
      context.fillRect(0, 0, canvas.width, canvas.height);
    },
    drawSegment(from, to) {
      context.strokeStyle = ink();
      context.lineWidth = 3;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    },
    countInkedPixels() {
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let index = 0; index < data.length; index += 4) if ((data[index] as number) < 250 || (data[index + 1] as number) < 250 || (data[index + 2] as number) < 250) count += 1;
      return count;
    },
    async toPng(scale) {
      const target = scale === 1 ? canvas : document.createElement('canvas');
      if (target !== canvas) {
        target.width = Math.max(1, Math.round(canvas.width * scale));
        target.height = Math.max(1, Math.round(canvas.height * scale));
        const copy = target.getContext('2d');
        if (!copy) throw new Error('canvas_unavailable');
        copy.fillStyle = paper();
        copy.fillRect(0, 0, target.width, target.height);
        copy.drawImage(canvas, 0, 0, target.width, target.height);
      }
      const blob = await new Promise<Blob | null>((resolve) => target.toBlob(resolve, SIGNATURE_CONTENT_TYPE));
      if (!blob) throw new Error('encode_failed');
      return blob.arrayBuffer();
    },
  };
}
