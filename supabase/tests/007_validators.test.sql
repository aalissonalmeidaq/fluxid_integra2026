begin;
select plan(26);

-- Spec 007: validadores de documento e de placa no banco (CA-008). Mesma tabela de casos de
-- src/domain/registry/document-validation.test.ts e plate.test.ts. Todos os documentos são fictícios.

-- CPF (11 dígitos, sem pontuação).
select ok(private.validate_cpf('52998224725'), 'CPF válido');
select ok(private.validate_cpf('11144477735'), 'outro CPF válido');
select ok(not private.validate_cpf('52998224726'), 'CPF com dígito verificador errado é recusado');
select ok(not private.validate_cpf('11111111111'), 'CPF com todos os dígitos iguais é recusado');
select ok(not private.validate_cpf('5299822472'), 'CPF com 10 dígitos é recusado');
select ok(not private.validate_cpf('529.982.247-25'), 'CPF com pontuação não é normalizado aqui (a normalização é do chamador)');

-- CNPJ numérico e alfanumérico (valor = código ASCII menos 48; dígitos verificadores numéricos).
select ok(private.validate_cnpj('11222333000181'), 'CNPJ numérico válido');
select ok(private.validate_cnpj('12ABC34501DE35'), 'CNPJ alfanumérico válido (exemplo da nota técnica)');
select ok(private.validate_cnpj('12.ABC.345/01DE-35'), 'CNPJ alfanumérico com pontuação é normalizado');
select ok(private.validate_cnpj('12abc34501de35'), 'CNPJ alfanumérico em minúsculas é normalizado');
select ok(not private.validate_cnpj('11222333000182'), 'CNPJ com dígito verificador errado é recusado');
select ok(not private.validate_cnpj('12ABC34501DEAB'), 'letra nas posições 13 e 14 é recusada');
select ok(not private.validate_cnpj('00000000000000'), 'CNPJ com todos os caracteres iguais é recusado');
select ok(not private.validate_cnpj('1122233300018'), 'CNPJ com 13 caracteres é recusado');

-- CNH (11 dígitos, dois dígitos verificadores).
select ok(private.validate_cnh('12345678900'), 'CNH válida');
select ok(private.validate_cnh('98765432109'), 'segunda CNH válida');
select ok(private.validate_cnh('24681357982'), 'terceira CNH válida');
select ok(not private.validate_cnh('12345678901'), 'CNH com dígito verificador errado é recusada');
select ok(not private.validate_cnh('11111111111'), 'CNH com todos os dígitos iguais é recusada');
select ok(not private.validate_cnh('1234567890'), 'CNH com 10 dígitos é recusada');

-- Placa: antiga (AAA9999) e Mercosul (AAA9A99); maiúsculas, sem hífen e sem espaços.
select is(private.normalize_plate('abc-1234'), 'ABC1234', 'placa antiga com hífen e minúsculas é normalizada');
select is(private.normalize_plate('ABC1D23'), 'ABC1D23', 'placa Mercosul é aceita');
select is(private.normalize_plate(' abc 1d23 '), 'ABC1D23', 'espaços são removidos');
select is(private.normalize_plate('AB12345'), null, 'formato inválido AB12345 é recusado');
select is(private.normalize_plate('ABCD123'), null, 'formato inválido ABCD123 é recusado');
select is(private.normalize_plate('ABC123'), null, 'placa curta é recusada');

select * from finish();
rollback;
