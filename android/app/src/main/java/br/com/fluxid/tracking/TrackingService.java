package br.com.fluxid.tracking;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.io.File;

// Spec 015 (T051; RF-007a, RF-007b): serviço em primeiro plano do tipo `location`, iniciado com a tela visível pela viagem do motorista.
// Mostra uma notificação contínua enquanto coleta e registra a posição no intervalo preferencial (60 s, best effort). Para só por pedido
// explícito (concluir ou cancelar) e não reinicia sozinho (START_NOT_STICKY). Sem ACCESS_BACKGROUND_LOCATION: a coleta vale enquanto o
// serviço visível estiver ativo. Nenhuma regra de proximidade aqui.
public class TrackingService extends Service {
    public static final String ACTION_START = "br.com.fluxid.tracking.START";
    public static final String ACTION_STOP = "br.com.fluxid.tracking.STOP";
    public static final String EXTRA_INTERVAL_SECONDS = "intervalSeconds";
    public static final String CHANNEL_ID = "fluxid_tracking";
    public static final int NOTIFICATION_ID = 1501;
    public static final String NOTIFICATION_TITLE = "FluxID registrando a localização";
    public static final String NOTIFICATION_TEXT = "A localização desta viagem está sendo enviada a cada minuto. Ela para quando a viagem termina.";
    static final String BUFFER_FILE = "fluxid-tracking-buffer.tsv";
    static final int BUFFER_CAPACITY = 600;

    private static volatile boolean running = false;

    private LocationManager locationManager;
    private IntervalGate gate;
    private PositionBuffer buffer;
    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(@NonNull Location location) {
            if (gate == null || buffer == null || !gate.accept(location.getTime())) return;
            buffer.add(location.getTime(), location.getLatitude(), location.getLongitude(), location.hasAccuracy() ? location.getAccuracy() : null);
        }
    };

    public static boolean isRunning() {
        return running;
    }

    public static PositionBuffer buffer(Context context) {
        return new PositionBuffer(new File(context.getFilesDir(), BUFFER_FILE), BUFFER_CAPACITY);
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopTracking();
            return START_NOT_STICKY;
        }
        long intervalMs = Math.max(30, intent.getIntExtra(EXTRA_INTERVAL_SECONDS, 60)) * 1000L;
        startInForeground();
        startUpdates(intervalMs);
        return START_NOT_STICKY;
    }

    private void startInForeground() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Localização da viagem", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Indica que o FluxID está registrando a localização durante a viagem.");
            manager.createNotificationChannel(channel);
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent content = open == null ? null : PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(NOTIFICATION_TITLE)
            .setContentText(NOTIFICATION_TEXT)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(NOTIFICATION_TEXT))
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(content)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        running = true;
    }

    private void startUpdates(long intervalMs) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopTracking();
            return;
        }
        if (locationManager == null) locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        buffer = buffer(this);
        gate = new IntervalGate(intervalMs, 5_000L);
        locationManager.removeUpdates(listener);
        for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
            if (locationManager.getAllProviders().contains(provider)) {
                locationManager.requestLocationUpdates(provider, intervalMs, 0f, listener, Looper.getMainLooper());
            }
        }
    }

    private void stopTracking() {
        if (locationManager != null) locationManager.removeUpdates(listener);
        running = false;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(listener);
        running = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
