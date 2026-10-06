/**
 * Identidade visual de cada competição (estilo transmissão de TV / EA FC):
 * paleta, degradê, textura gerada em CSS, tipografia de destaque, troféu e
 * a vinheta ("bumper") de abertura. Chaveado pelo id da competição; nomes e
 * logos oficiais continuam vindo de COMP_META / CompLogo.
 */
import type { CSSProperties } from "react";
import "./compThemes.css";

export type Bumper = "sweep" | "shine" | "stars" | "stripes" | "flag";

export interface CompTheme {
  key: string;
  /** cor principal (faixas, bordas, botões) */
  primary: string;
  /** cor de apoio (degradê) */
  secondary: string;
  /** detalhe (placar, troféu, brilho) */
  accent: string;
  /** cor do texto sobre o degradê */
  ink: string;
  /** fundo base escuro do cabeçalho */
  base: string;
  /** textura CSS (background-image) desenhada por cima do degradê */
  pattern: string;
  /** fonte/estilo do título */
  font: "broadcast" | "serif" | "condensed" | "rounded";
  trophy: string;
  /** frase da vinheta */
  motto: string;
  bumper: Bumper;
}

const P = {
  diag: (c: string) => `repeating-linear-gradient(135deg, ${c} 0 2px, transparent 2px 14px)`,
  dots: (c: string) => `radial-gradient(${c} 1.2px, transparent 1.6px) 0 0 / 12px 12px`,
  stripes: (c: string) => `repeating-linear-gradient(90deg, ${c} 0 18px, transparent 18px 36px)`,
  rays: (c: string) => `repeating-conic-gradient(from 0deg at 85% 120%, ${c} 0 4deg, transparent 4deg 12deg)`,
  hex: (c: string) => `radial-gradient(circle at 50% 0, transparent 7px, ${c} 8px, transparent 9px) 0 0 / 18px 16px`,
  grid: (c: string) => `linear-gradient(${c} 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0 / 16px 16px`,
};

const BRASILEIRAO = (tier: "A" | "B" | "C" | "D"): CompTheme => {
  const pal = {
    A: ["#0f9d58", "#063b22", "#ffd400"],
    B: ["#1e5bd8", "#0a1e4d", "#7fe3ff"],
    C: ["#8a3ffc", "#2a0f55", "#ffb3f0"],
    D: ["#e0611a", "#4a1a05", "#ffe08a"],
  }[tier];
  return {
    key: `brasileirao-${tier}`, primary: pal[0], secondary: pal[1], accent: pal[2], ink: "#ffffff", base: "#07120c",
    pattern: P.diag("rgba(255,255,255,0.07)"), font: "broadcast", trophy: "🏆",
    motto: tier === "A" ? "A elite do futebol brasileiro" : `Série ${tier} · rumo ao acesso`, bumper: "sweep",
  };
};

const THEMES: Record<string, CompTheme> = {
  serieA: BRASILEIRAO("A"),
  serieB: BRASILEIRAO("B"),
  serieC: BRASILEIRAO("C"),
  serieD: BRASILEIRAO("D"),
  copaBR: {
    key: "copaBR", primary: "#f5b700", secondary: "#0b3d91", accent: "#ffffff", ink: "#ffffff", base: "#06142e",
    pattern: P.stripes("rgba(255,255,255,0.05)"), font: "condensed", trophy: "🏆", motto: "Mata-mata do Oiapoque ao Chuí", bumper: "flag",
  },
  liberta: {
    key: "liberta", primary: "#d4a017", secondary: "#0a0a0a", accent: "#f7d774", ink: "#fff6d8", base: "#050505",
    pattern: P.hex("rgba(212,160,23,0.16)"), font: "serif", trophy: "🏆", motto: "Glória Eterna", bumper: "shine",
  },
  sula: {
    key: "sula", primary: "#14b8a6", secondary: "#0b2a6b", accent: "#a3e635", ink: "#ffffff", base: "#061433",
    pattern: P.rays("rgba(163,230,53,0.08)"), font: "rounded", trophy: "🏆", motto: "A conquista do continente", bumper: "sweep",
  },
  recopa: {
    key: "recopa", primary: "#c0c7d1", secondary: "#1c2333", accent: "#f7d774", ink: "#ffffff", base: "#0b0f18",
    pattern: P.grid("rgba(255,255,255,0.05)"), font: "serif", trophy: "🏆", motto: "Campeão contra campeão", bumper: "shine",
  },
  intercontinental: {
    key: "intercontinental", primary: "#e5c158", secondary: "#13204a", accent: "#ffffff", ink: "#ffffff", base: "#070b1d",
    pattern: P.dots("rgba(229,193,88,0.18)"), font: "serif", trophy: "🌍", motto: "O mundo é o limite", bumper: "stars",
  },
};

/** Estaduais: herdam a cor do campeonato e ganham listras de bandeira. */
const ESTADUAL_PAL: Record<string, [string, string, string]> = {
  "est-SP": ["#e11d48", "#111111", "#ffffff"], // Paulistão: vermelho/preto
  "est-RJ": ["#0ea5e9", "#0b1f3a", "#ffffff"], // Carioca
  "est-MG": ["#f59e0b", "#3a1f05", "#ffffff"],
  "est-RS": ["#16a34a", "#7f1d1d", "#facc15"],
  "est-PR": ["#2563eb", "#14532d", "#ffffff"],
  "est-SC": ["#dc2626", "#14532d", "#ffffff"],
  "est-GO": ["#65a30d", "#1e3a8a", "#facc15"],
  "est-CE": ["#ea580c", "#14532d", "#ffffff"],
  "est-PE": ["#b91c1c", "#1e3a8a", "#facc15"],
  "est-BA": ["#1d4ed8", "#991b1b", "#ffffff"],
  "est-PA": ["#0891b2", "#7f1d1d", "#ffffff"],
};

const cache = new Map<string, CompTheme>();

/** Tema da competição (sempre retorna algo: cai num padrão por tipo). */
export function compTheme(id: string, fallbackColor?: string): CompTheme {
  const hit = cache.get(id);
  if (hit) return hit;
  let t = THEMES[id];
  if (!t && id.startsWith("est-")) {
    const [p, s, a] = ESTADUAL_PAL[id] ?? [fallbackColor ?? "#e11d48", "#111827", "#ffffff"];
    t = {
      key: id, primary: p, secondary: s, accent: a, ink: "#ffffff", base: "#0b0f14",
      pattern: P.stripes("rgba(255,255,255,0.06)"), font: "condensed", trophy: "🏆", motto: "Tradição do estado", bumper: "stripes",
    };
  }
  if (!t) {
    const c = fallbackColor ?? "#22c55e";
    t = { key: id, primary: c, secondary: "#0b1a12", accent: "#ffffff", ink: "#ffffff", base: "#0b1a12", pattern: P.diag("rgba(255,255,255,0.06)"), font: "broadcast", trophy: "🏆", motto: "", bumper: "sweep" };
  }
  cache.set(id, t);
  return t;
}

/** Variáveis CSS do tema (use no style de um contêiner). */
export function themeVars(t: CompTheme): CSSProperties {
  return {
    "--ct-p": t.primary,
    "--ct-s": t.secondary,
    "--ct-a": t.accent,
    "--ct-ink": t.ink,
    "--ct-base": t.base,
    "--ct-pattern": t.pattern,
  } as CSSProperties;
}

/** Classe CSS do tema (fonte + vinheta). */
export function themeClass(t: CompTheme): string {
  return `ct ct-font-${t.font} ct-bump-${t.bumper}`;
}

/** Cores para a confete da comemoração de título. */
export function confettiColors(t: CompTheme): string[] {
  return [t.primary, t.accent, t.secondary, "#ffffff"];
}
