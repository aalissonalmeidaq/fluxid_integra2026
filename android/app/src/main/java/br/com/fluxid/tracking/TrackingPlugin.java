package br.com.fluxid.tracking;

import android.Manifest;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.time.Instant;
import java.util.List;

// Spec 015 (T050/T051): plugin local `FluxidTracking`. Liga e desliga o serviço em primeiro plano e entrega ao JavaScript as posições do
// buffer nativo (drain). As permissões (localização e, no Android 13+, notificação) são pedidas pelo JavaScript no contexto da viagem.
// O plugin não decide proximidade nem guarda nada além do buffer.
@CapacitorPlugin(
    name = "FluxidTracking",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class TrackingPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = new Intent(getContext(), TrackingService.class);
        intent.setAction(TrackingService.ACTION_START);
        intent.putExtra(TrackingService.EXTRA_INTERVAL_SECONDS, call.getInt("intervalSeconds", 60));
        JSObject result = new JSObject();
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            result.put("running", true);
        } catch (RuntimeException error) {
            // O sistema pode recusar iniciar o serviço (por exemplo, sem a tela visível): a viagem segue, degradada.
            result.put("running", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (TrackingService.isRunning()) {
            Intent intent = new Intent(getContext(), TrackingService.class);
            intent.setAction(TrackingService.ACTION_STOP);
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        List<PositionBuffer.Entry> entries = TrackingService.buffer(getContext()).drain();
        JSArray positions = new JSArray();
        for (PositionBuffer.Entry entry : entries) {
            JSObject position = new JSObject();
            position.put("observedAt", Instant.ofEpochMilli(entry.observedAtMs).toString());
            position.put("latitude", entry.latitude);
            position.put("longitude", entry.longitude);
            if (entry.accuracyM != null) position.put("accuracyM", entry.accuracyM.doubleValue());
            positions.put(position);
        }
        JSObject result = new JSObject();
        result.put("positions", positions);
        call.resolve(result);
    }
}
