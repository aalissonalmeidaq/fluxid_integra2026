// Simulador do lacre por linha de comando (Spec 012, T048; quickstart.md, seção 2). Usa o mesmo simulador das suítes de teste
// (tests/support/seal-simulator.ts), que fala exatamente o contrato do lacre. Só para demonstração e validação manual.
//
// Uso:
//   node scripts/lacre/simulador.mjs --url http://127.0.0.1:54321 --device DSP-XXXXXXXX --key fxk_... --cenario parado --minutos 3
// A chave também pode vir de FLUXID_LACRE_CHAVE (para não aparecer no histórico do terminal). Nunca grave a chave em arquivo versionado.
import { parseArgs } from 'node:util';
import { SealSimulator } from '../../tests/support/seal-simulator.ts';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.FLUXID_LACRE_URL ?? 'http://127.0.0.1:54321' },
    device: { type: 'string', default: process.env.FLUXID_LACRE_DISPOSITIVO },
    key: { type: 'string', default: process.env.FLUXID_LACRE_CHAVE },
    cenario: { type: 'string', default: 'parado' },
    minutos: { type: 'string', default: '1' },
    lat: { type: 'string', default: '-7.209194' },
    lng: { type: 'string', default: '-39.306367' },
    vezes: { type: 'string', default: '11' },
    intervalo: { type: 'string', default: '60' },
  },
});

if (!values.device || !values.key) {
  console.error('Informe --device e --key (ou FLUXID_LACRE_DISPOSITIVO e FLUXID_LACRE_CHAVE).');
  process.exit(2);
}

// No cenário `rede-falha`, o lacre não consegue entrar na rede pedida e responde com erro (senha errada).
const onCommand = values.cenario === 'rede-falha'
  ? (command) => (command.kind.startsWith('wifi_') ? { result: 'error', reason: 'wifi_auth' } : { result: 'executed' })
  : undefined;
const sim = new SealSimulator({ url: values.url, deviceCode: values.device, key: values.key, onCommand });
const base = { latitude: Number(values.lat), longitude: Number(values.lng) };
const minutes = Number(values.minutos);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const intervalMs = Number(values.intervalo) * 1000;

async function send(label) {
  const response = await sim.send();
  const results = (response.body.results ?? []).map((r) => `${r.status}${r.reason ? `(${r.reason})` : ''}`).join(', ');
  const command = response.body.command ? ` comando=${response.body.command.kind}` : '';
  console.log(`${new Date().toISOString()} ${label}: HTTP ${response.status} ${results}${command} válvula=${sim.valve}`);
  return response;
}

const cenarios = {
  async ativar() {
    sim.activation(base);
    await send('ativação');
  },
  async parado() {
    for (let i = 0; i < minutes; i += 1) {
      sim.position({ ...base, latitude: base.latitude + (Math.random() - 0.5) * 0.00005 });
      await send(`parado ${i + 1}/${minutes}`);
      if (i < minutes - 1) await pause(intervalMs);
    }
  },
  async movendo() {
    for (let i = 0; i < minutes; i += 1) {
      sim.position({ ...base, latitude: base.latitude + i * 0.0005 });
      await send(`movendo ${i + 1}/${minutes}`);
      if (i < minutes - 1) await pause(intervalMs);
    }
  },
  // GPS sem fix: as leituras vão como última posição conhecida (o FluxID marca "sem GPS" depois de 3 intervalos).
  async 'sem-gps'() {
    for (let i = 0; i < minutes; i += 1) {
      sim.position({ ...base, quality: 'last_known' });
      await send(`sem GPS ${i + 1}/${minutes}`);
      if (i < minutes - 1) await pause(intervalMs);
    }
  },
  // Um envio e depois nada: o lacre "some" (o FluxID marca "sem comunicação" em até ~2,5 min).
  async silencio() {
    sim.position(base);
    await send('último envio antes do silêncio');
    console.log(`Silêncio por ${minutes} min. Acompanhe a saúde e os alertas no FluxID.`);
    await pause(minutes * 60_000);
  },
  // Aviso de desligamento (bateria no fim ou botão).
  async desligar() {
    sim.shutdown(base);
    await send('desligamento');
  },
  // Busca o comando pendente (travar, destravar ou rede), executa e confirma no envio seguinte.
  async confirmar() {
    sim.position(base);
    const resposta = await send('busca o comando pendente');
    if (!resposta.body.command) {
      console.log('Nenhum comando pendente para este lacre.');
      return;
    }
    sim.position(base);
    await send(`confirma ${resposta.body.command.kind} como executado`);
  },
  async reenvio() {
    sim.position(base);
    const id = sim.queue[0].message_id;
    await send('envio');
    const response = await sim.sendRaw({ protocol: 1, watch_version: sim.watch.version, messages: [{ message_id: id, type: 'position', read_at: new Date().toISOString(),
      latitude: base.latitude, longitude: base.longitude, quality: 'gps', accuracy_m: 5, battery_pct: 87, signal_dbm: -61, seal_state: 'closed' }] });
    console.log(`reenvio: HTTP ${response.status} ${JSON.stringify(response.body.results)}`);
  },
  async 'lote-atrasado'() {
    const start = Date.now() - 50 * 60_000;
    for (let i = 0; i < 50; i += 1) sim.position({ ...base, latitude: base.latitude + i * 0.0003 }, new Date(start + i * 60_000).toISOString());
    await send('lote de 50 leituras guardadas');
  },
  // Leva o lacre até um ponto (por exemplo, dentro da geocerca da unidade antes de registrar a entrega).
  async 'ir-para'() {
    sim.position(base);
    await send(`posição ${base.latitude}, ${base.longitude}`);
  },
  // Cilindro entregue levado para fora da geocerca: duas posições com GPS seguidas a ~550 m e ~660 m do ponto informado.
  async 'sair-da-geocerca'() {
    for (const offset of [0.005, 0.006]) {
      sim.position({ ...base, latitude: base.latitude + offset });
      await send(`fora da geocerca (+${offset}°)`);
    }
    sim.position({ ...base, latitude: base.latitude + 0.006 });
    await send('confirmação do comando, se houver');
  },
  // O lacre travou sozinho sem falar com o FluxID (RN-011) e agora volta com as leituras guardadas e o aviso da trava.
  async 'auto-lock'() {
    const start = Date.now() - 5 * 60_000;
    sim.position({ ...base, latitude: base.latitude + 0.005 }, new Date(start).toISOString());
    sim.position({ ...base, latitude: base.latitude + 0.006 }, new Date(start + 60_000).toISOString());
    sim.autoLock({ ...base, latitude: base.latitude + 0.006 }, new Date(start + 3 * 60_000).toISOString());
    await send('volta com leituras guardadas e trava automática');
  },
  // Redes Wi-Fi (US7): peça a rede no detalhe do lacre antes. O primeiro envio busca o comando; o segundo leva a resposta. A senha
  // recebida nunca é mostrada aqui.
  async 'rede-ok'() {
    sim.event('boot');
    await send('busca o comando de rede');
    await send(`confirma; redes guardadas: ${sim.wifiSaved.join(', ') || 'nenhuma'}`);
  },
  async 'rede-falha'() {
    sim.event('boot');
    await send('busca o comando de rede');
    await send('responde que não conseguiu entrar na rede (wifi_auth)');
  },
  async 'chave-errada'() {
    const wrong = new SealSimulator({ url: values.url, deviceCode: values.device, key: 'chave-errada' });
    for (let i = 0; i < Number(values.vezes); i += 1) {
      const response = await wrong.sendRaw({ protocol: 1, messages: [{ message_id: `X-${Date.now()}-${i}`, type: 'event', read_at: new Date().toISOString(), code: 'boot' }] });
      console.log(`tentativa ${i + 1}: HTTP ${response.status} ${JSON.stringify(response.body)}`);
    }
  },
};

const run = cenarios[values.cenario];
if (!run) {
  console.error(`Cenário desconhecido: ${values.cenario}. Disponíveis: ${Object.keys(cenarios).join(', ')}.`);
  process.exit(2);
}
await run();
