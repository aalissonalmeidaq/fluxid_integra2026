package br.com.fluxid.tracking;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

// Spec 015 (T051): buffer nativo das posições coletadas pelo serviço enquanto o WebView está parado. Uma linha por posição (instante,
// latitude, longitude, precisão), em ordem; com limite, recusa a nova e preserva as anteriores. Só posição: nada de token ou chave. O
// JavaScript recolhe (drain) e põe na fila oficial do aparelho (IndexedDB), presa ao dono.
public final class PositionBuffer {
    public static final class Entry {
        public final long observedAtMs;
        public final double latitude;
        public final double longitude;
        public final Float accuracyM;

        Entry(long observedAtMs, double latitude, double longitude, Float accuracyM) {
            this.observedAtMs = observedAtMs;
            this.latitude = latitude;
            this.longitude = longitude;
            this.accuracyM = accuracyM;
        }
    }

    private final File file;
    private final int capacity;

    public PositionBuffer(File file, int capacity) {
        this.file = file;
        this.capacity = capacity;
    }

    public synchronized boolean add(long observedAtMs, double latitude, double longitude, Float accuracyM) {
        if (read().size() >= capacity) return false;
        String accuracy = accuracyM == null ? "" : String.format(Locale.ROOT, "%.1f", accuracyM);
        String line = String.format(Locale.ROOT, "%d\t%.7f\t%.7f\t%s%n", observedAtMs, latitude, longitude, accuracy);
        try (Writer writer = new OutputStreamWriter(new FileOutputStream(file, true), StandardCharsets.UTF_8)) {
            writer.write(line);
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    public synchronized List<Entry> drain() {
        List<Entry> entries = read();
        if (file.exists() && !file.delete()) {
            try (Writer writer = new OutputStreamWriter(new FileOutputStream(file, false), StandardCharsets.UTF_8)) {
                writer.write("");
            } catch (IOException ignored) {
                // Sem conseguir limpar, a próxima recolha repete os itens.
            }
        }
        return entries;
    }

    private List<Entry> read() {
        List<Entry> entries = new ArrayList<>();
        if (!file.exists()) return entries;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split("\t", -1);
                if (parts.length != 4) continue;
                try {
                    Float accuracy = parts[3].isEmpty() ? null : Float.valueOf(parts[3]);
                    entries.add(new Entry(Long.parseLong(parts[0]), Double.parseDouble(parts[1]), Double.parseDouble(parts[2]), accuracy));
                } catch (NumberFormatException ignored) {
                    // Linha corrompida: descartada.
                }
            }
        } catch (IOException ignored) {
            // Sem leitura, nada a entregar.
        }
        return entries;
    }
}
