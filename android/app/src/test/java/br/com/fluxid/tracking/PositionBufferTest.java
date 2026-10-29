package br.com.fluxid.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import org.junit.Before;
import org.junit.Test;

// Spec 015 (T038, parte local): o buffer nativo guarda as posições do serviço enquanto o WebView está parado, em ordem, com limite, e
// sobrevive ao fim do processo até o JavaScript recolhê-las. Não guarda token, chave nem nada além da posição.
public class PositionBufferTest {
    private File file;

    @Before
    public void setUp() throws Exception {
        file = Files.createTempFile("fluxid-buffer", ".tsv").toFile();
        file.delete();
    }

    @Test
    public void guardaERecolheEmOrdem() {
        PositionBuffer buffer = new PositionBuffer(file, 10);
        buffer.add(1_000L, -7.23, -39.31, 12.5f);
        buffer.add(61_000L, -7.231, -39.311, null);
        List<PositionBuffer.Entry> drained = buffer.drain();
        assertEquals(2, drained.size());
        assertEquals(1_000L, drained.get(0).observedAtMs);
        assertEquals(-7.231, drained.get(1).latitude, 1e-9);
        assertEquals(null, drained.get(1).accuracyM);
        assertTrue(buffer.drain().isEmpty());
    }

    @Test
    public void sobreviveAoFimDoProcesso() {
        new PositionBuffer(file, 10).add(1_000L, -7.23, -39.31, 9f);
        List<PositionBuffer.Entry> drained = new PositionBuffer(file, 10).drain();
        assertEquals(1, drained.size());
        assertEquals(9f, drained.get(0).accuracyM, 1e-6);
    }

    @Test
    public void cheioRecusaANovaSemPerderAsAnteriores() {
        PositionBuffer buffer = new PositionBuffer(file, 2);
        assertTrue(buffer.add(1L, 1, 1, 1f));
        assertTrue(buffer.add(2L, 2, 2, 2f));
        assertFalse(buffer.add(3L, 3, 3, 3f));
        List<PositionBuffer.Entry> drained = buffer.drain();
        assertEquals(2, drained.size());
        assertEquals(1L, drained.get(0).observedAtMs);
    }

    @Test
    public void linhaCorrompidaEDescartada() throws Exception {
        Files.write(file.toPath(), "abc\tx\n5\t-7.0\t-39.0\t4.0\n".getBytes("UTF-8"));
        List<PositionBuffer.Entry> drained = new PositionBuffer(file, 10).drain();
        assertEquals(1, drained.size());
        assertEquals(5L, drained.get(0).observedAtMs);
    }
}
