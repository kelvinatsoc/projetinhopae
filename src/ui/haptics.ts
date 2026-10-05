/** Vibração curta ao tocar (Android); silenciosa onde não houver suporte. */
export function haptic(kind: "tap" | "success" | "warn" = "tap") {
  try {
    const pattern = kind === "tap" ? 8 : kind === "success" ? [12, 40, 18] : [30, 50, 30];
    navigator.vibrate?.(pattern);
  } catch { /* sem vibração */ }
}

/** Liga um toque leve em qualquer botão, aba, chip ou cartão tocável. Retorna o desligador. */
export function installTapHaptics(): () => void {
  const onDown = (e: PointerEvent) => {
    const el = e.target as Element | null;
    if (el?.closest?.("button, .tap, .tile, .pcard, .chip, .list-item, [data-club-pick]")) haptic("tap");
  };
  document.addEventListener("pointerdown", onDown, { passive: true });
  return () => document.removeEventListener("pointerdown", onDown);
}
