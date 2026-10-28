package br.com.fluxid.tracking;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

// Spec 015 (T038, parte local): no máximo uma posição por intervalo preferencial, com tolerância para a plataforma que entrega um pouco
// antes. A cadência é best effort: o Android pode atrasar, nunca adiantamos.
public class IntervalGateTest {
    @Test
    public void aceitaAPrimeiraEDepoisUmaPorIntervalo() {
        IntervalGate gate = new IntervalGate(60_000L, 5_000L);
        assertTrue(gate.accept(0L));
        assertFalse(gate.accept(20_000L));
        assertFalse(gate.accept(50_000L));
        assertTrue(gate.accept(56_000L));
        assertFalse(gate.accept(60_000L));
        assertTrue(gate.accept(130_000L));
    }

    @Test
    public void reiniciarAceitaDeNovo() {
        IntervalGate gate = new IntervalGate(60_000L, 5_000L);
        assertTrue(gate.accept(0L));
        gate.reset();
        assertTrue(gate.accept(1_000L));
    }
}
