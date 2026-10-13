// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 009 (RF-018): nenhuma imagem da câmera é enviada, guardada ou registrada; a decodificação acontece no aparelho e só o texto do código
// sobe. Aqui se prova o lado do código: o leitor e a tela de leitura não têm como extrair, copiar, gravar ou enviar um quadro de vídeo.
const ROOT = path.resolve(import.meta.dirname, '../..');
const FILES = [
  'src/infrastructure/field/barcode-reader.ts',
  'src/infrastructure/field/nfc-reader.ts',
  'src/infrastructure/field/geolocation-reader.ts',
  'src/infrastructure/field/reader-error.ts',
  'src/pages/field/identifier-reader-dialog.tsx',
  'src/pages/field/reader-controls.tsx',
  'src/pages/field/lazy-identifier-reader.tsx',
  'src/pages/cylinders/components/camera-scan-button.tsx',
];
const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Cada interface do navegador que tira uma imagem do vídeo, a grava ou a transfere.
const BANNED: [string, RegExp][] = [
  ['canvas.toBlob', /\btoBlob\b/],
  ['canvas.toDataURL', /\btoDataURL\b/],
  ['getImageData', /\bgetImageData\b/],
  ['drawImage', /\bdrawImage\b/],
  ['createImageBitmap', /\bcreateImageBitmap\b/],
  ['ImageCapture', /\bImageCapture\b/],
  ['MediaRecorder', /\bMediaRecorder\b/],
  ['FileReader', /\bFileReader\b/],
  ['URL.createObjectURL', /\bcreateObjectURL\b/],
  ['fetch', /\bfetch\s*\(/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['postMessage', /\bpostMessage\b/],
];

describe('o leitor não tem como enviar nem guardar imagem da câmera', () => {
  it.each(FILES)('%s não usa nenhuma interface que extraia, grave ou envie imagem', (file) => {
    const text = read(file);
    for (const [name, pattern] of BANNED) expect(text, `${file} usa ${name}`).not.toMatch(pattern);
  });

  it('o adaptador da câmera entrega só texto: o tipo do quadro tem o valor lido e mais nada', () => {
    const text = read('src/infrastructure/field/barcode-reader.ts');
    expect(text).toMatch(/export type BarcodeFrame = \{ kind: 'read'; value: string \} \| \{ kind: 'multiple' \}/);
  });

  it('o vídeo vai só ao detector do navegador, que devolve texto', () => {
    const text = read('src/infrastructure/field/barcode-reader.ts');
    expect(text.match(/detector\.detect\(video\)/g)).toHaveLength(1);
    expect(text).not.toMatch(/\.srcObject\s*=\s*[^s]*stream\b[^;]*;[^]*fetch/);
  });

  it('desligar a leitura para as faixas da câmera (nenhuma gravação fica aberta)', () => {
    const text = read('src/infrastructure/field/barcode-reader.ts');
    expect(text).toMatch(/getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  });

  it('o serviço de campo só recebe e manda texto: candidatos e o resultado', () => {
    const service = read('src/application/field/field-service.ts');
    expect(service).toMatch(/candidates\.map\(\(candidate\) => candidate\.value\)/);
    for (const [name, pattern] of BANNED) expect(service, `field-service usa ${name}`).not.toMatch(pattern);
  });

  it('nenhum corpo de requisição de leitura tem campo de imagem', () => {
    const ops = read('supabase/functions/query-cylinders/handler.ts');
    const resolve = ops.slice(ops.indexOf('resolve:'), ops.indexOf('history:'));
    expect(resolve).toMatch(/candidates/);
    expect(resolve).not.toMatch(/image|frame|photo|foto|blob|base64/i);
  });
});
