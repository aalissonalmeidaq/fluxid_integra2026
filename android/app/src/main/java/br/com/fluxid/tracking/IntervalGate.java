package br.com.fluxid.tracking;

// Spec 015 (T051): no máximo uma posição por intervalo preferencial. A tolerância aceita a entrega um pouco antes do intervalo; a
// plataforma pode atrasar (best effort), nunca adiantamos além disso.
public final class IntervalGate {
    private final long intervalMs;
    private final long toleranceMs;
    private long last = Long.MIN_VALUE;

    public IntervalGate(long intervalMs, long toleranceMs) {
        this.intervalMs = intervalMs;
        this.toleranceMs = toleranceMs;
    }

    public synchronized boolean accept(long timestampMs) {
        if (last != Long.MIN_VALUE && timestampMs - last < intervalMs - toleranceMs) return false;
        last = timestampMs;
        return true;
    }

    public synchronized void reset() {
        last = Long.MIN_VALUE;
    }
}
