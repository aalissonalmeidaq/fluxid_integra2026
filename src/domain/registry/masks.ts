// Máscaras de documento (RF-029): CPF e CNH aparecem sempre mascarados; só o CNPJ de pessoa jurídica aparece completo.
// Nenhuma função devolve o CPF ou a CNH inteiros a partir de uma entrada: o valor completo só sai pela operação de revelação.

const CPF_MASKED = '***.***.***-**';

// CPF: só os dois últimos dígitos ficam visíveis. Entrada que não seja um CPF de 11 dígitos vira a máscara completa.
export function maskCpf(value: string): string {
  return /^\d{11}$/.test(value) ? `***.***.***-${value.slice(-2)}` : CPF_MASKED;
}

// CNH: só os três últimos dígitos ficam visíveis. Entrada que não seja uma CNH de 11 dígitos vira a máscara completa.
export function maskCnh(value: string): string {
  return /^\d{11}$/.test(value) ? `********${value.slice(-3)}` : '*'.repeat(11);
}

// CNPJ (numérico ou alfanumérico) no formato 00.000.000/0000-00. Valor com formato inesperado volta como veio.
export function formatCnpj(value: string): string {
  const match = /^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}/${match[4]}-${match[5]}` : value;
}
