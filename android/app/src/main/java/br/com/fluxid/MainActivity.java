package br.com.fluxid;

import android.os.Bundle;
import br.com.fluxid.tracking.TrackingPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Spec 015: plugin local da coleta de localização da viagem.
        registerPlugin(TrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
