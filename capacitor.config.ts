import type { CapacitorConfig } from '@capacitor/cli';

// Casca Android da Spec 015: empacota o mesmo `dist` do PWA para permitir a coleta de posição em segundo plano pelo serviço em
// primeiro plano. Não aponta para servidor remoto e não carrega credencial; o destino Supabase continua vindo do build.
const config: CapacitorConfig = {
  appId: 'br.com.fluxid',
  appName: 'FluxID',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
