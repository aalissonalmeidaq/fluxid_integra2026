package br.com.fluxid.tracking;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;
import org.junit.After;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

// Spec 015 (T038; RF-007a, RF-007b): serviço em primeiro plano no aparelho real ou emulador (Android 10 a 14). Com a localização
// concedida, sobe como `location`, mostra a notificação contínua e para só por pedido explícito, sem reiniciar sozinho; o manifesto não
// pede localização em segundo plano. Exige aparelho: `npm run android:testar-aparelho`.
@RunWith(AndroidJUnit4.class)
public class TrackingServiceTest {
    @Rule
    public GrantPermissionRule permissions = Build.VERSION.SDK_INT >= 33
        ? GrantPermissionRule.grant(android.Manifest.permission.ACCESS_FINE_LOCATION, "android.permission.POST_NOTIFICATIONS")
        : GrantPermissionRule.grant(android.Manifest.permission.ACCESS_FINE_LOCATION);

    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private void send(String action) {
        Intent intent = new Intent(context, TrackingService.class).setAction(action).putExtra(TrackingService.EXTRA_INTERVAL_SECONDS, 60);
        if (TrackingService.ACTION_START.equals(action)) context.startForegroundService(intent);
        else context.startService(intent);
    }

    private boolean notificationVisible() {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (StatusBarNotification notification : manager.getActiveNotifications()) {
            if (notification.getId() == TrackingService.NOTIFICATION_ID) return true;
        }
        return false;
    }

    private void waitFor(boolean expected, java.util.function.BooleanSupplier condition) throws InterruptedException {
        for (int i = 0; i < 50 && condition.getAsBoolean() != expected; i++) Thread.sleep(100);
    }

    @After
    public void tearDown() throws InterruptedException {
        send(TrackingService.ACTION_STOP);
        waitFor(false, TrackingService::isRunning);
    }

    @Test
    public void iniciaComoLocalizacaoComNotificacaoContinua() throws Exception {
        send(TrackingService.ACTION_START);
        waitFor(true, TrackingService::isRunning);
        assertTrue(TrackingService.isRunning());
        waitFor(true, this::notificationVisible);
        assertTrue(notificationVisible());
        int type = context.getPackageManager()
            .getServiceInfo(new android.content.ComponentName(context, TrackingService.class), PackageManager.GET_META_DATA).getForegroundServiceType();
        assertEquals(ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION, type);
    }

    @Test
    public void paraPorPedidoExplicitoERetiraANotificacao() throws Exception {
        send(TrackingService.ACTION_START);
        waitFor(true, TrackingService::isRunning);
        send(TrackingService.ACTION_STOP);
        waitFor(false, TrackingService::isRunning);
        assertFalse(TrackingService.isRunning());
        waitFor(false, this::notificationVisible);
        assertFalse(notificationVisible());
    }

    @Test
    public void manifestoNaoPedeLocalizacaoEmSegundoPlano() throws Exception {
        String[] requested = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
        for (String permission : requested) assertFalse(permission, permission.equals("android.permission.ACCESS_BACKGROUND_LOCATION"));
    }
}
