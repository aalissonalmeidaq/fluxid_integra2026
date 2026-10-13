// `npm run dev:rede`: servidor de desenvolvimento do Vite aberto à rede local, agora em HTTPS (certificado autoassinado, só para
// desenvolvimento). O HTTPS dá "contexto seguro" ao celular da mesma rede: câmera, NFC e GPS funcionam sem cabo nem `adb reverse`.
// O Supabase continua atrás do repasse do Vite (`/supabase-local`), então o Supabase CLI não é exposto à rede.
// O certificado fica em `.certs/` (fora do Git), vale 30 dias e é refeito quando os endereços da máquina mudam. Exige o `openssl`
// (vem com o Git para Windows). Como o certificado é autoassinado, o Chrome mostra um aviso na primeira abertura: "Avançado" e
// "Continuar". Por isso o app não é instalável como PWA por este caminho; para testar a instalação use `npm run build` e `npm run preview`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const DIR = join(process.cwd(), '.certs');
const CHAVE = join(DIR, 'dev-key.pem');
const CERT = join(DIR, 'dev-cert.pem');
const ENDERECOS = join(DIR, 'enderecos.json');

const enderecosDaMaquina = () => Object.values(networkInterfaces())
  .flat()
  .filter((item) => item && item.family === 'IPv4' && !item.internal)
  .map((item) => item.address)
  .sort();

function acharOpenssl() {
  const candidatos = ['openssl', 'C:/Program Files/Git/mingw64/bin/openssl.exe', 'C:/Program Files/Git/usr/bin/openssl.exe'];
  return candidatos.find((comando) => spawnSync(comando, ['version'], { stdio: 'ignore' }).status === 0);
}

function certificadoEmDia(enderecos) {
  if (!existsSync(CHAVE) || !existsSync(CERT) || !existsSync(ENDERECOS)) return false;
  try { return JSON.stringify(JSON.parse(readFileSync(ENDERECOS, 'utf8'))) === JSON.stringify(enderecos); } catch { return false; }
}

const enderecos = enderecosDaMaquina();
if (!certificadoEmDia(enderecos)) {
  const openssl = acharOpenssl();
  if (!openssl) {
    console.error('Não encontrei o openssl. Instale o Git para Windows (ele traz o openssl) ou coloque o openssl no PATH e rode de novo.');
    process.exit(1);
  }
  mkdirSync(DIR, { recursive: true });
  const alternativos = ['DNS:localhost', 'IP:127.0.0.1', ...enderecos.map((ip) => `IP:${ip}`)].join(',');
  const gerado = spawnSync(openssl, [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '30',
    '-keyout', CHAVE, '-out', CERT, '-subj', '/CN=fluxid-dev', '-addext', `subjectAltName=${alternativos}`,
  ], { stdio: 'inherit' });
  if (gerado.status !== 0) { console.error('Não foi possível gerar o certificado de desenvolvimento.'); process.exit(1); }
  writeFileSync(ENDERECOS, JSON.stringify(enderecos));
  console.log(`Certificado de desenvolvimento gerado em .certs/ para: localhost, 127.0.0.1${enderecos.length ? `, ${enderecos.join(', ')}` : ''}.`);
}

console.log('\nNo celular da mesma rede, abra:');
for (const ip of enderecos) console.log(`  https://${ip}:3000`);
console.log('O Chrome avisa que a conexão não é particular (certificado autoassinado): toque em "Avançado" e "Continuar".\n');

const filho = spawn('npx', ['vite', '--host'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FLUXID_DEV_HTTPS_KEY: CHAVE, FLUXID_DEV_HTTPS_CERT: CERT },
});
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
