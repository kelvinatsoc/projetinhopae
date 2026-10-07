import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./ui/App";
import "./styles.css";
// identidade visual "Arquibancada": tokens + componentes (src/ui/theme.css), fontes embutidas (sem rede)
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900.css";
import "./ui/theme.css";

createRoot(document.getElementById("root")!).render(<App />);

if (Capacitor.isNativePlatform()) {
  // app Android: o jogo já vem inteiro dentro do APK (sem service worker);
  // liga o botão voltar, o salvamento ao sair e esconde a tela de abertura
  import("./native").then((m) => m.initNative()).catch(console.error);
} else {
  // service worker: permite instalar no celular e jogar offline
  registerSW({ immediate: true });
}
