// Configuração do app Android (Capacitor): empacota a pasta dist/ dentro do APK.
// Depois de mudar algo aqui rode: npm run android:sync
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.kelvinatsoc.lendasdabase",
  appName: "Lendas da Base",
  webDir: "dist",
  // cor de fundo da WebView (evita o "clarão" branco enquanto o jogo carrega)
  backgroundColor: "#0c1712",
  android: {
    backgroundColor: "#0c1712",
    // o APK é offline: tudo vem de dentro do app, nada de conteúdo misto
    allowMixedContent: false,
    // depuração pelo chrome://inspect: sem a opção webContentsDebuggingEnabled, o Capacitor
    // liga só no APK de desenvolvimento (assembleDebug) e desliga no de lançamento (assembleRelease)
  },
  plugins: {
    SystemBars: {
      // Android 15+ desenha o app "de ponta a ponta": a WebView recebe os
      // env(safe-area-inset-*) corretos (o CSS já usa) e as variáveis --safe-area-inset-*
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      // DARK = ícones claros na barra de status (fundo escuro do jogo)
      style: "DARK",
    },
    SplashScreen: {
      // some sozinha; o src/native.ts esconde antes, assim que o jogo desenha a 1ª tela
      launchAutoHide: true,
      launchShowDuration: 1500,
      launchFadeOutDuration: 200,
      backgroundColor: "#0c1712",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
