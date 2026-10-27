// Integração com o app Android (Capacitor). Só é carregado dentro do APK:
// no navegador o main.tsx nem importa este arquivo.
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { back, getNav, setTab } from "./store";

export async function initNative(): Promise<void> {
  // botão (ou gesto) "voltar" do Android
  void App.addListener("backButton", () => {
    // uma janela de baixo (Sheet) aberta? fecha ela primeiro, como tocar fora dela
    const overlay = document.querySelector<HTMLElement>(".overlay");
    if (overlay) {
      overlay.click();
      return;
    }
    const { tab, stack } = getNav();
    // fecha a tela de cima (a partida ao vivo continua bloqueada pelo store.ts)
    if (stack.length) back();
    else if (tab !== "home") setTab("home");
    else void App.minimizeApp();
  });

  // ao sair do app (botão home, trocar de app, desligar a tela) salva o jogo na hora
  void App.addListener("pause", () => {
    void import("./ui/actions").then(({ autosave }) => autosave(true));
  });

  // ao voltar para o app, garante modo tela cheia imersivo sem barra de status/notificações
  void App.addListener("resume", () => {
    hideAndroidSystemBars();
  });

  // o seletor de arquivos do Android esconde arquivos .json que outros apps marcaram com outro
  // tipo (ex.: baixados do WhatsApp); a importação já valida o conteúdo, então mostra todos
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === "file" && el.accept.includes("json")) el.accept = "*/*";
    },
    true,
  );

  hideAndroidSystemBars();

  // esconde a tela de abertura assim que o React montou a primeira tela. Usa setTimeout, não
  // requestAnimationFrame: enquanto a abertura está na frente o Android segura os quadros da WebView.
  const root = document.getElementById("root");
  for (let i = 0; i < 50 && !root?.firstElementChild; i++) await new Promise((r) => setTimeout(r, 20));
  await SplashScreen.hide();
  hideAndroidSystemBars();
}

/** Oculta completamente a barra de bateria/notificações e a barra de navegação no Android. */
function hideAndroidSystemBars() {
  try {
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark });
    void SystemBars.hide({});
  } catch {
    // ignora caso a versão da WebView não exponha SystemBars
  }
}
