import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./ui/App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

if (Capacitor.isNativePlatform()) {
  // app Android: o jogo já vem inteiro dentro do APK (sem service worker);
  // liga o botão voltar, o salvamento ao sair e esconde a tela de abertura
  import("./native").then((m) => m.initNative()).catch(console.error);
} else {
  // service worker: permite instalar no celular e jogar offline
  registerSW({ immediate: true });
}
