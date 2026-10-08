import { describe, expect, it } from 'vitest';
import { formatCnpj, maskCnh, maskCpf } from './masks';

describe('máscaras de documento pessoal (RF-029)', () => {
  it('CPF mostra só os dois últimos dígitos', () => {
    expect(maskCpf('52998224725')).toBe('***.***.***-25');
  });

  it('CNH mostra só os três últimos dígitos', () => {
    expect(maskCnh('12345678900')).toBe('********900');
  });

  it('entrada com formato inesperado devolve a máscara completa, nunca o valor', () => {
    expect(maskCpf('123')).toBe('***.***.***-**');
    expect(maskCnh('123')).toBe('***********');
    expect(maskCpf('')).toBe('***.***.***-**');
  });

  it.each(['52998224725', '11144477735'])('a máscara de %s nunca contém o CPF inteiro', (cpf) => {
    const mascarado = maskCpf(cpf);
    expect(mascarado.replace(/\D/g, '')).toHaveLength(2);
    expect(mascarado.replace(/\D/g, '')).toBe(cpf.slice(-2));
  });

  it('o resultado já mascarado não revela mais nada ao ser mascarado de novo', () => {
    expect(maskCpf(maskCpf('52998224725'))).toBe('***.***.***-**');
    expect(maskCnh(maskCnh('12345678900'))).toBe('***********');
  });
});

describe('formatCnpj (CNPJ de pessoa jurídica aparece completo)', () => {
  it('formata o numérico', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('formata o alfanumérico', () => {
    expect(formatCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });

  it('valor inválido volta como veio, sem inventar pontuação', () => {
    expect(formatCnpj('123')).toBe('123');
  });
});
