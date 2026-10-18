// Sistema Arcade Strikers: Itens de batalha, Chute Especial (Hyper Strike QTE),
// Voltagem da Bola (Ball Voltage) e Efeitos Comic de Fliperama inspirados em Super Mario Strikers.

export type ArcadeItemId = "raio" | "carrinho" | "cogumelo" | "bomba" | "banana" | "estrela";

export interface ArcadeItemDef {
  id: ArcadeItemId;
  name: string;
  emoji: string;
  comic: string;
  desc: string;
  color: string;
  role: "attack" | "defense" | "any";
  bonusXg?: number;
}

export const ARCADE_ITEMS: Record<ArcadeItemId, ArcadeItemDef> = {
  raio: {
    id: "raio",
    name: "Raio Elétrico",
    emoji: "⚡",
    comic: "⚡ ZAP! CHOQUE TOTAL!",
    desc: "Paralisa a defesa adversária e abre o corredor livre para o ataque.",
    color: "#ffe600",
    role: "attack",
    bonusXg: 0.18,
  },
  carrinho: {
    id: "carrinho",
    name: "Super Carrinho",
    emoji: "💥",
    comic: "💥 POW! NA GRADE ELÉTRICA!",
    desc: "Desarme brutal arremessa o adversário na cerca e recupera a posse na hora.",
    color: "#ff3366",
    role: "defense",
  },
  cogumelo: {
    id: "cogumelo",
    name: "Cogumelo Turbo",
    emoji: "🍄",
    comic: "🍄 TURBO! ARRANCADA BRUTAL!",
    desc: "Arrancada supersônica do atacante furando as linhas defensivas.",
    color: "#ff5500",
    role: "attack",
    bonusXg: 0.14,
  },
  bomba: {
    id: "bomba",
    name: "Bob-bomba",
    emoji: "💣",
    comic: "💣 KABOOM! ÁREA LIMPA!",
    desc: "Explosão na grande área que afasta os zagueiros e cria uma sobra viva.",
    color: "#9d4edd",
    role: "attack",
    bonusXg: 0.20,
  },
  banana: {
    id: "banana",
    name: "Casca de Banana",
    emoji: "🍌",
    comic: "🍌 ESCORREGOU NA CASCA!",
    desc: "Armadilha no meio-campo: o condutor adversário escorrega e perde a bola.",
    color: "#ffd000",
    role: "defense",
  },
  estrela: {
    id: "estrela",
    name: "Super Estrela",
    emoji: "⭐",
    comic: "⭐ MODO ESTRELA INVENCÍVEL!",
    desc: "5 minutos de invencibilidade dourada: posse garantida e chutes com força em dobro.",
    color: "#00f0ff",
    role: "any",
    bonusXg: 0.25,
  },
};

export const ITEM_LIST: ArcadeItemId[] = ["raio", "carrinho", "cogumelo", "bomba", "banana", "estrela"];

/**
 * Sintetizador Web Audio procedural para efeitos arcade sem necessidade de arquivos externos.
 */
let arcadeAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    if (!arcadeAudioCtx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) arcadeAudioCtx = new AudioCtx();
    }
    if (arcadeAudioCtx && arcadeAudioCtx.state === "suspended") {
      arcadeAudioCtx.resume().catch(() => undefined);
    }
    return arcadeAudioCtx;
  } catch {
    return null;
  }
}

/** Efeito de Choque / Raio Elétrico */
export function playArcadeZap() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(780, t + 0.08);
    osc.frequency.linearRampToValueAtTime(120, t + 0.18);
    osc.frequency.linearRampToValueAtTime(840, t + 0.28);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.36);
  } catch { /* ignore */ }
}

/** Efeito de Impacto / Carrinho Brutal na Grade */
export function playArcadeTackle() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    // Thump baixo
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    // Faísca metálica
    const metal = ctx.createOscillator();
    const metalGain = ctx.createGain();
    metal.type = "square";
    metal.frequency.setValueAtTime(650, t);
    metal.frequency.exponentialRampToValueAtTime(180, t + 0.18);
    metalGain.gain.setValueAtTime(0.3, t);
    metalGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    metal.connect(metalGain);
    metalGain.connect(ctx.destination);
    metal.start(t);
    metal.stop(t + 0.22);
  } catch { /* ignore */ }
}

/** Efeito de Explosão / Bob-bomba */
export function playArcadeExplosion() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.45);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.52);
  } catch { /* ignore */ }
}

/** Efeito de Roleta / Power-up liberado */
export function playArcadePowerUp() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const notes = [330, 392, 523, 659];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t + idx * 0.07);
      gain.gain.setValueAtTime(0.28, t + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.07 + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + idx * 0.07);
      osc.stop(t + idx * 0.07 + 0.16);
    });
  } catch { /* ignore */ }
}

/** Efeito de Hyper Strike Perfeito */
export function playArcadeHyperStrike() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const notes = [440, 554, 659, 880, 1108];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t + idx * 0.05);
      gain.gain.setValueAtTime(0.35, t + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, t + idx * 0.05 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + idx * 0.05);
      osc.stop(t + idx * 0.05 + 0.25);
    });
    // Sub bass drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(150, t + 0.25);
    sub.frequency.exponentialRampToValueAtTime(45, t + 0.7);
    subGain.gain.setValueAtTime(0.65, t + 0.25);
    subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.75);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t + 0.25);
    sub.stop(t + 0.78);
  } catch { /* ignore */ }
}

/** Efeito de Erro / Chute fora */
export function playArcadeMiss() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.28);
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  } catch { /* ignore */ }
}

/**
 * Dispara tremor de tela visual (screen shake) no container principal.
 */
export function triggerScreenShake(intensity: "light" | "heavy" = "light") {
  if (typeof document === "undefined") return;
  const root = document.querySelector(".mx") || document.querySelector(".app") || document.body;
  if (!root) return;
  root.classList.remove("strikers-shake-light", "strikers-shake-heavy");
  // Força reflow
  void (root as HTMLElement).offsetWidth;
  root.classList.add(intensity === "heavy" ? "strikers-shake-heavy" : "strikers-shake-light");
  window.setTimeout(() => {
    root.classList.remove("strikers-shake-light", "strikers-shake-heavy");
  }, intensity === "heavy" ? 480 : 280);
}

/**
 * Avaliação do Hyper Strike QTE (Sweet Spot)
 * agulha: 0..100
 * Sweet spot perfeito: 45..55
 * Bom: 30..70
 * Fora: <30 ou >70
 */
export function evaluateHyperStrike(needle: number): {
  rating: "perfect" | "good" | "miss";
  bonusXg: number;
  label: string;
  comic: string;
  color: string;
} {
  const dist = Math.abs(needle - 50);
  if (dist <= 6) {
    return {
      rating: "perfect",
      bonusXg: 0.32,
      label: "PERFEITO!",
      comic: "⚡ HYPER STRIKE PERFEITO! 🔥",
      color: "#00f0ff",
    };
  }
  if (dist <= 18) {
    return {
      rating: "good",
      bonusXg: 0.15,
      label: "BOM CHUTE!",
      comic: "💥 TIRO CERTEIRO!",
      color: "#ccff00",
    };
  }
  return {
    rating: "miss",
    bonusXg: -0.08,
    label: "ISPOLETOU!",
    comic: "💨 FORA DO PONTO!",
    color: "#ff3366",
  };
}
