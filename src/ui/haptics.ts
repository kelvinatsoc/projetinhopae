import { Capacitor } from "@capacitor/core";

type Kind = "tap" | "success" | "warn";

// No Android (APK) usa o plugin nativo @capacitor/haptics (motor de vibração fino do aparelho);
// no navegador cai para navigator.vibrate; nos testes (sem nada disso) fica em silêncio.
let native: typeof import("@capacitor/haptics") | null = null;
let loading = false;
function loadNative() {
  if (native || loading) return;
  try {
    if (!Capacitor.isNativePlatform()) return;
  } catch { return; }
  loading = true;
  import("@capacitor/haptics").then((m) => { native = m; }).catch(() => { /* sem plugin */ });
}

/** Vibração curta ao tocar; silenciosa onde não houver suporte. */
export function haptic(kind: Kind = "tap") {
  try {
    loadNative();
    if (native) {
      const { Haptics, ImpactStyle, NotificationType } = native;
      if (kind === "tap") void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      else void Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning }).catch(() => {});
      return;
    }
    const pattern = kind === "tap" ? 8 : kind === "success" ? [12, 40, 18] : [30, 50, 30];
    navigator.vibrate?.(pattern);
  } catch { /* sem vibração */ }
}

/** Liga um toque leve em qualquer botão, aba, chip ou cartão tocável. Retorna o desligador. */
export function installTapHaptics(): () => void {
  loadNative();
  const onDown = (e: PointerEvent) => {
    const el = e.target as Element | null;
    if (el?.closest?.("button, .tap, .tile, .pcard, .chip, .list-item, .ring-card, [data-club-pick]")) haptic("tap");
  };
  document.addEventListener("pointerdown", onDown, { passive: true });
  return () => document.removeEventListener("pointerdown", onDown);
}
