// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 015 (T002–T004): a casca Android empacota o mesmo `dist` do PWA, sem servidor remoto embutido, sem credencial e com Android 10
// (API 29) como mínimo. A coleta em segundo plano é o único motivo da casca (plan.md, Complexidade a acompanhar).
const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };

describe('casca Capacitor', () => {
  it('as dependências do Capacitor são da mesma versão fixada', () => {
    const versions = [pkg.dependencies['@capacitor/core'], pkg.dependencies['@capacitor/android'], pkg.devDependencies['@capacitor/cli']];
    expect(versions.every((version) => /^8\.\d+\.\d+$/.test(version ?? ''))).toBe(true);
    expect(new Set(versions).size).toBe(1);
  });

  it('a configuração usa o dist, o identificador FluxID e nenhum servidor remoto ou credencial', () => {
    const config = read('capacitor.config.ts');
    expect(config).toMatch(/webDir: 'dist'/);
    expect(config).toMatch(/appId: 'br\.com\.fluxid'/);
    expect(config).toMatch(/appName: 'FluxID'/);
    expect(config).not.toMatch(/\burl\s*:/);
    expect(config).not.toMatch(/cleartext\s*:\s*true/);
    expect(config).not.toMatch(/key|secret|token|password|service_role/i);
  });

  it('os scripts sincronizam depois do build e compilam pelo Gradle do projeto', () => {
    expect(pkg.scripts['android:sincronizar']).toBe('npm run build && cap sync android');
    expect(pkg.scripts['android:compilar']).toMatch(/gradlew(\.bat)? assembleDebug/);
  });

  // Spec 015 (T052): localização só com o serviço em primeiro plano visível; nada de segundo plano irrestrito.
  it('o manifesto declara a coleta em primeiro plano, sem localização em segundo plano', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS']) {
      expect(manifest, permission).toContain(`android.permission.${permission}"`);
    }
    expect(manifest).not.toContain('ACCESS_BACKGROUND_LOCATION');
    expect(manifest).toMatch(/<service\s+android:name="\.tracking\.TrackingService"\s+android:exported="false"\s+android:foregroundServiceType="location"/);
  });

  // Spec 015 (validação humana de 27/10/2026): o backup automático do Android encerrou o processo no meio da viagem e derrubou o serviço
  // de coleta (que não reinicia sozinho), além de copiar para a nuvem o buffer de posições, a fila e a sessão. O app não faz backup.
  it('o app não participa do backup automático do Android', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android:allowBackup="false"/);
    expect(manifest).not.toMatch(/android:allowBackup="true"/);
  });

  it('o serviço não reinicia sozinho e mostra notificação contínua', () => {
    const service = read('android/app/src/main/java/br/com/fluxid/tracking/TrackingService.java');
    expect(service).not.toMatch(/START_STICKY\b|START_REDELIVER_INTENT/);
    expect(service).toMatch(/return START_NOT_STICKY;/);
    expect(service).toMatch(/\.setOngoing\(true\)/);
    expect(service).toMatch(/FOREGROUND_SERVICE_TYPE_LOCATION/);
  });

  it('o projeto Android exige Android 10 (API 29) ou superior', () => {
    expect(existsSync(join(ROOT, 'android', 'variables.gradle'))).toBe(true);
    expect(read('android/variables.gradle')).toMatch(/minSdkVersion = 29\b/);
    expect(read('android/app/build.gradle')).toMatch(/minSdkVersion rootProject\.ext\.minSdkVersion/);
  });
});
