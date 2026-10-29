// Tipos de alerta de lacre por extenso, com as mesmas palavras da tela (src/domain/seals/seal-vocabulary.ts). Usado no CSV dos
// relatórios e no e-mail de aviso (Spec 015; validação humana de 27/10/2026).
export const ALERT_KIND_LABEL: Readonly<Record<string, string>> = {
  proximity_separation: 'Afastamento do motorista', possible_loss: 'Possível extravio', no_comm: 'Sem comunicação', device_off: 'Lacre desligado',
  no_gps: 'Sem GPS', low_battery: 'Bateria baixa', weak_signal: 'Sinal fraco', seal_open: 'Lacre aberto', seal_broken: 'Lacre rompido',
  geofence_violation: 'Violação de geocerca', comm_loss_lock: 'Travado por perda de comunicação', command_failed: 'Comando com erro',
  command_expired: 'Comando expirado', command_not_delivered: 'Comando não entregue', watch_suspended: 'Vigilância suspensa',
  rate_limited: 'Envios acima do limite', wifi_change_failed: 'Troca de rede falhou',
};
