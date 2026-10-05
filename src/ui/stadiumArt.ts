// Identidade de cada estádio no campo em pixel art (196×132) do MatchView.
// Tudo aqui é desenhado UMA vez no fundo do estádio (buildStadium): não custa nada por quadro,
// então o modo "Leve" continua barato. Estilos em src/data/stadiumStyles.ts.

import type { Club } from "../engine/types";
import { attendance, isBigGame, stadiumStyleFor, type StadiumStyle } from "../data/stadiumStyles";

// geometria (igual a MatchView.tsx)
const W = 196;
const H = 132;
const GX0 = 13, GX1 = 183, GY0 = 16, GY1 = 120; // gramado
const SL = 12, SR = 184, ST = 16, SB = 120; // borda interna das arquibancadas
const TIFO_X0 = 16, TIFO_X1 = 144; // mosaico (antes do setor visitante)

type G = CanvasRenderingContext2D;

export interface StadiumArt {
  style: StadiumStyle;
  big: boolean;
  density: number;
  /** pixel sem torcedor nem cadeira (estrutura, paisagem, camarotes...) */
  mask: (x: number, y: number) => boolean;
  /** cor da cadeira vazia nesse pixel */
  seatAt: (x: number, y: number) => string;
}

interface Ctx {
  home: Pick<Club, "id" | "stadium" | "capacity" | "colors" | "rep" | "abbr">;
  away: Pick<Club, "id" | "rep" | "colors">;
  neutral: boolean;
  stage: string;
}

const inCorner = (x: number, y: number) => (x < SL || x > SR) && (y < ST || y > SB);
function cornerDist(x: number, y: number): number {
  const dx = x < SL ? SL - x : x - SR;
  const dy = y < ST ? ST - y : y - SB;
  return Math.sqrt(dx * dx + dy * dy);
}
/** Distância (em px) da borda interna da arquibancada: 0 = primeira fileira. */
function depth(x: number, y: number): number {
  if (inCorner(x, y)) return cornerDist(x, y);
  if (y < ST) return ST - 1 - y;
  if (y > SB) return y - SB - 1;
  if (x < SL) return SL - 1 - x;
  return x - SR - 1;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Monta a identidade do estádio do mandante para esta partida. */
export function stadiumArt(c: Ctx): StadiumArt {
  const style = stadiumStyleFor(c.home, c.neutral);
  const big = !c.neutral && isBigGame(c.home, c.away, c.stage);
  const density = attendance(style, c.home, big);
  const s = style.shape;
  const tifo = big && s !== "small";
  const mask = (x: number, y: number): boolean => {
    if (tifo && y > SB + 1 && x >= TIFO_X0 && x <= TIFO_X1) return true; // mosaico cobre a torcida
    if (inCorner(x, y)) {
      if (s === "bowl") return cornerDist(x, y) > 13.5;
      if (s === "track") return cornerDist(x, y) > 12.5;
      if (s === "bombonera") return x > SR || cornerDist(x, y) > 13.5;
      if (s === "open-end") return x < SL || cornerDist(x, y) > 13.5;
      return true; // english / small: cantos fechados de estrutura
    }
    if (s === "small") return (y > SB && y > 125) || ((x < SL || x > SR) && (y < 36 || y > 100 || x < 5 || x > 190));
    if (s === "bombonera") return x > SR;
    if (s === "open-end") return x < SL;
    return false;
  };
  const seatCols = style.seats.map((cl) => shade(cl, 0.62));
  const seatAt = (x: number, y: number): string => {
    if (seatCols.length === 1) return seatCols[0];
    const d = depth(x, y);
    // anéis por profundidade e setores ao longo da arquibancada
    const along = y < ST || y > SB ? Math.floor(x / 24) : Math.floor(y / 24);
    return seatCols[(Math.floor(d / 4) + (style.seats.length > 2 ? along : 0)) % seatCols.length];
  };
  return { style, big, density, mask, seatAt };
}

// ------------------------------------------------------------------ gramado
/** Corte do gramado (substitui as faixas padrão). */
export function paintPitch(g: G, art: StadiumArt, a: string, b: string) {
  const m = art.style.mow;
  const cx = 98, cy = 68;
  for (let y = GY0; y <= GY1; y++) {
    for (let x = GX0; x <= GX1; x++) {
      const sx = Math.floor((x - 18 + 100) / 10) % 2;
      let k: number;
      if (m === "wide") k = Math.floor((x - 18 + 160) / 16) % 2;
      else if (m === "rows") k = Math.floor((y - 20 + 96) / 8) % 2;
      else if (m === "checker") k = (sx + Math.floor((y - 20 + 96) / 12)) % 2;
      else if (m === "diagonal") k = Math.floor((x + y) / 9) % 2;
      else if (m === "rings") {
        const r = Math.hypot(x - cx, (y - cy) * 1.2);
        k = r < 40 ? Math.floor(r / 7) % 2 : sx;
      } else k = sx;
      g.fillStyle = k ? b : a;
      g.fillRect(x, y, 1, 1);
    }
  }
  if (art.style.track) paintTrack(g, art.style.track);
}

function paintTrack(g: G, col: string) {
  g.fillStyle = col;
  g.fillRect(GX0, GY0, GX1 - GX0 + 1, 2);
  g.fillRect(GX0, GY1 - 1, GX1 - GX0 + 1, 2);
  g.fillRect(GX0, GY0, 2, GY1 - GY0 + 1);
  g.fillRect(GX1 - 1, GY0, 2, GY1 - GY0 + 1);
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let x = GX0 + 2; x < GX1 - 1; x += 2) { g.fillRect(x, GY0 + 1, 1, 1); g.fillRect(x, GY1 - 1, 1, 1); }
  for (let y = GY0 + 2; y < GY1 - 1; y += 2) { g.fillRect(GX0 + 1, y, 1, 1); g.fillRect(GX1 - 1, y, 1, 1); }
}

// ------------------------------------------------------------------ estrutura e marcos
/** Tudo que vai por cima da arquibancada já pintada: estrutura, teto, marcos, luz, telão e mosaico. */
export function paintStadium(g: G, art: StadiumArt, c: Ctx, rng: () => number) {
  paintShell(g, art, rng);
  paintRoof(g, art);
  for (const l of art.style.landmarks) LANDMARKS[l]?.(g, art, rng);
  paintLights(g, art);
  paintBoard(g, art, c);
  if (art.big && art.style.shape !== "small") paintTifo(g, c);
}

function eachMasked(art: StadiumArt, f: (x: number, y: number) => void) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const stand = y < ST || y > SB || x < SL || x > SR;
      if (stand && art.mask(x, y)) f(x, y);
    }
}

function paintShell(g: G, art: StadiumArt, rng: () => number) {
  const st = art.style;
  const conc = st.concrete;
  eachMasked(art, (x, y) => {
    const corner = inCorner(x, y);
    if ((st.shape === "bowl" || st.shape === "track" || (corner && (st.shape === "bombonera" ? x < SL : st.shape === "open-end" ? x > SR : false))) && corner) {
      // fora do anel: chão em volta do estádio (com um contorno de concreto)
      const d = cornerDist(x, y);
      const lim = st.shape === "track" ? 12.5 : 13.5;
      g.fillStyle = d < lim + 1.6 ? conc : (x + y) % 7 === 0 && rng() < 0.5 ? shade(st.outside, 1.5) : st.outside;
    } else if (st.shape === "open-end" && x < SL) {
      // lado aberto: mureta, pista de grama e o parque em volta
      g.fillStyle = x === SL - 1 ? "#c9c3b4" : x > 7 ? "#2f6a33" : rng() < 0.18 ? "#24572a" : "#3a7a3a";
    } else if (st.shape === "small") {
      // lado sem arquibancada: mureta, grama e árvores
      const wall = depth(x, y) === 0 || (y > SB && y === 126) ;
      g.fillStyle = wall ? "#c9c3b4" : rng() < 0.12 ? "#2c6a2f" : (x * 3 + y) % 5 === 0 ? "#3c7d3a" : "#33703a";
    } else {
      // cantos fechados (estilo inglês): estrutura com escadas
      g.fillStyle = (x + y) % 4 === 0 ? shade(conc, 0.7) : conc;
    }
    g.fillRect(x, y, 1, 1);
  });
  if (st.shape === "small") {
    // copas de árvore atrás dos gols
    for (let i = 0; i < 26; i++) {
      const left = rng() < 0.5;
      const x = left ? 1 + Math.floor(rng() * 9) : 186 + Math.floor(rng() * 9);
      const y = rng() < 0.5 ? 18 + Math.floor(rng() * 16) : 102 + Math.floor(rng() * 16);
      g.fillStyle = "#1f5a26";
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = "#3f8f3f";
      g.fillRect(x, y, 1, 1);
    }
  }
  if (st.shape === "english") {
    // vigas da cobertura entrando nos cantos
    g.fillStyle = shade(conc, 1.35);
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) for (let i = 0; i < 11; i++) g.fillRect(x + dx * i, y + dy * i, 1, 1);
  }
}

function roofBand(art: StadiumArt): (x: number, y: number) => number {
  // devolve 0 (sem teto) ou a "profundidade" dentro do teto
  const r = art.style.roof;
  return (x, y) => {
    if (r === "none") return 0;
    const top = y < ST, bot = y > SB, side = !top && !bot;
    if (r === "main" && !(top && !inCorner(x, y))) return 0;
    if (r === "partial" && side) return 0;
    if (art.mask(x, y) && art.style.shape !== "english") return 0;
    const outer = top ? y : bot ? H - 1 - y : x < SL ? x : W - 1 - x;
    const deep = r === "main" ? 5 : 4;
    if (inCorner(x, y)) {
      const d = cornerDist(x, y);
      return art.style.shape === "english" ? (Math.min(x, W - 1 - x, y, H - 1 - y) < deep ? 1 : 0) : d > 13.5 - deep && d <= 13.5 ? 1 : 0;
    }
    return outer < deep ? deep - outer : 0;
  };
}

function paintRoof(g: G, art: StadiumArt) {
  const band = roofBand(art);
  const rc = art.style.roofColor;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const stand = y < ST || y > SB || x < SL || x > SR;
      if (!stand || (y >= 6 && y < ST && x > 62 && x < 134)) continue;
      const b = band(x, y);
      if (!b) continue;
      g.globalAlpha = b === 1 ? 0.95 : 0.78;
      g.fillStyle = b === 1 ? shade(rc, 1.12) : rc;
      g.fillRect(x, y, 1, 1);
    }
  g.globalAlpha = 1;
}

// ------------------------------------------------------------------ marcos de cada estádio
type LM = (g: G, art: StadiumArt, rng: () => number) => void;

function outerRing(g: G, col: string, inset: number, every = 0, alt?: string) {
  for (let x = 14; x < W - 14; x++) {
    g.fillStyle = every && alt && x % every === 0 ? alt : col;
    g.fillRect(x, inset, 1, 1);
    g.fillRect(x, H - 1 - inset, 1, 1);
  }
  for (let y = 16; y < H - 16; y++) {
    g.fillStyle = every && alt && y % every === 0 ? alt : col;
    g.fillRect(inset, y, 1, 1);
    g.fillRect(W - 1 - inset, y, 1, 1);
  }
  // cantos arredondados
  g.fillStyle = col;
  for (const [cx, cy, sx, sy] of [[SL, ST, -1, -1], [SR, ST, 1, -1], [SL, SB, -1, 1], [SR, SB, 1, 1]]) {
    const r = 13.5 - inset;
    for (let a = 0; a <= 90; a += 3) {
      const t = (a * Math.PI) / 180;
      g.fillRect(Math.round(cx + sx * r * Math.cos(t)), Math.round(cy + sy * r * Math.sin(t)), 1, 1);
    }
  }
}

const LANDMARKS: Record<string, LM> = {
  "morumbi-ring": (g) => {
    // o anel de concreto do Morumbi com os pilares
    outerRing(g, "#c7c9c4", 0, 4, "#80837f");
    outerRing(g, "#9da09b", 1);
  },
  "maracana-roof": (g) => {
    // cobertura branca contínua com a borda interna e os cabos
    outerRing(g, "#ffffff", 3);
    outerRing(g, "#d7dde0", 0, 6, "#7a858b");
  },
  "allianz-facade": (g) => {
    for (let x = 0; x < W; x++) {
      const c = Math.floor(x / 2) % 3 === 0 ? "#e8ebec" : Math.floor(x / 2) % 3 === 1 ? "#a8b1b6" : "#7c878d";
      g.fillStyle = c;
      g.fillRect(x, 0, 1, 2);
      g.fillRect(x, H - 2, 1, 2);
    }
    for (let y = 0; y < H; y++) {
      g.fillStyle = Math.floor(y / 2) % 2 ? "#a8b1b6" : "#e8ebec";
      g.fillRect(0, y, 1, 1);
      g.fillRect(W - 1, y, 1, 1);
    }
    g.fillStyle = "#0f6b38";
    g.fillRect(86, 0, 24, 1);
  },
  "baixada-roof": (g) => {
    // teto retrátil: listras translúcidas por cima de tudo
    g.fillStyle = "rgba(220,230,235,0.22)";
    for (let x = 0; x < W; x += 6) { g.fillRect(x, 0, 2, 5); g.fillRect(x, H - 5, 2, 5); }
    for (let y = 16; y < H - 16; y += 6) { g.fillRect(0, y, 4, 2); g.fillRect(W - 4, y, 4, 2); }
    g.fillStyle = "#c8102e";
    g.fillRect(0, 0, W, 1);
  },
  "centenario-tower": (g) => {
    // Torre de los Homenajes atrás do gol direito (lado aberto fica à esquerda)
    const x = 186, y = 58;
    g.fillStyle = "#efeadc";
    g.fillRect(x + 2, y, 5, 22);
    g.fillStyle = "#bdb6a3";
    for (let i = 0; i < 22; i += 3) g.fillRect(x + 2, y + i, 5, 1);
    g.fillStyle = "#fbf7ea";
    g.fillRect(x + 3, y - 2, 3, 2);
    g.fillStyle = "#6fb4e8";
    g.fillRect(x + 4, y - 4, 1, 2);
  },
  "beira-rio-ribbons": (g) => {
    // as "pétalas" brancas da cobertura cruzando a arquibancada
    g.fillStyle = "rgba(255,255,255,0.8)";
    for (let k = -H; k < W; k += 10) {
      for (let t = 0; t < 7; t++) {
        const x = k + t, y = t;
        if (x >= 0 && x < W) { g.fillRect(x, y, 2, 1); g.fillRect(x, H - 1 - t, 2, 1); }
      }
    }
    for (let k = 18; k < H - 18; k += 10)
      for (let t = 0; t < 6; t++) { g.fillRect(t, k + t, 1, 2); g.fillRect(W - 1 - t, k + t, 1, 2); }
  },
  "fonte-nova-view": (g) => {
    // lado aberto: o Dique do Tororó e a cidade ao fundo
    for (let x = 0; x < SL; x++)
      for (let y = 0; y < H; y++) {
        if (!(y < ST || y > SB || x < SL)) continue;
        if (y >= ST && y <= SB && x >= SL) continue;
        g.fillStyle = x < 5 ? (y % 9 < 5 ? "#2f6f9a" : "#2a6690") : x < 8 ? "#3d7d3d" : "#6e7a73";
        g.fillRect(x, y, 1, 1);
      }
    g.fillStyle = "#cfd6d8";
    for (let y = 22; y < 112; y += 7) g.fillRect(1 + (y % 3), y, 2, 3);
    g.fillStyle = "rgba(255,255,255,0.55)";
    for (let y = 18; y < 118; y += 5) g.fillRect(2, y, 1, 1);
  },
  "corinthians-glass": (g) => {
    // fachada de vidro da arquibancada (embaixo)
    for (let x = 0; x < W; x++)
      for (let y = H - 3; y < H; y++) {
        g.fillStyle = (x + y * 2) % 11 < 2 ? "#cfe3f0" : y === H - 3 ? "#5f8aa6" : "#3f6a86";
        g.fillRect(x, y, 1, 1);
      }
    g.fillStyle = "#e6e6e6";
    g.fillRect(0, 0, W, 1);
  },
  "sao-januario-facade": (g) => {
    // fachada neocolonial com arcos atrás da arquibancada social
    g.fillStyle = "#efe7d2";
    g.fillRect(0, 0, W, 2);
    g.fillStyle = "#8b6f47";
    for (let x = 1; x < W; x += 4) g.fillRect(x, 1, 2, 1);
    g.fillStyle = "#f7f1e1";
    g.fillRect(90, 0, 16, 2);
    g.fillStyle = "#141414";
    g.fillRect(97, 0, 2, 1);
    g.fillStyle = "#c8102e";
    g.fillRect(96, 1, 4, 1);
  },
  "vila-houses": (g, _a, rng) => {
    // casinhas coladas no estádio
    for (let i = 0; i < 18; i++) {
      const x = 1 + Math.floor(rng() * 8) + (i % 2 ? 185 : 0);
      const y = i % 4 < 2 ? 17 + Math.floor(rng() * 16) : 101 + Math.floor(rng() * 16);
      g.fillStyle = ["#b5533a", "#9c4a2f", "#c9a06a", "#7d5a43"][Math.floor(rng() * 4)];
      g.fillRect(x, y, 3, 3);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(x, y + 1, 3, 1);
    }
    g.fillStyle = "#f4f4f4";
    for (let x = 0; x < W; x += 3) g.fillRect(x, H - 1 - (x % 2), 1, 1);
  },
  "mineirao-pillars": (g) => {
    // os pilares em "Y" do Mineirão no anel externo
    outerRing(g, "#d6d2c6", 0, 3, "#8e8a7f");
    outerRing(g, "#b4b1a6", 1, 3, "#76736a");
  },
  "bombonera-palcos": (g) => {
    // o paredão vertical de camarotes
    for (let y = 0; y < H; y++)
      for (let x = SR + 1; x < W; x++) {
        const fx = (x - SR - 1) % 4, fy = y % 4;
        g.fillStyle = fx === 0 || fy === 0 ? "#f3c400" : (x + y) % 5 === 0 ? "#8fb0e6" : "#1a3f9c";
        g.fillRect(x, y, 1, 1);
      }
    g.fillStyle = "#f3c400";
    g.fillRect(0, 0, SR, 1);
    g.fillRect(0, H - 1, SR, 1);
  },
  "monumental-sash": (g) => {
    outerRing(g, "#d1202f", 1);
    outerRing(g, "#efefef", 0);
  },
  "castelao-ring": (g) => {
    outerRing(g, "#e9ecee", 3);
    outerRing(g, "#7e868a", 0, 5, "#bfc5c8");
  },
  "gremio-arches": (g) => {
    g.fillStyle = "#1b75bb";
    for (let x = 4; x < W - 4; x += 8) { g.fillRect(x, 0, 1, 4); g.fillRect(x, H - 4, 1, 4); }
    for (let y = 20; y < H - 20; y += 8) { g.fillRect(0, y, 4, 1); g.fillRect(W - 4, y, 4, 1); }
  },
  "mrv-crown": (g) => {
    g.fillStyle = "#141414";
    g.fillRect(0, 0, W, 1);
    g.fillRect(0, H - 1, W, 1);
    g.fillStyle = "#f2f2f2";
    for (let x = 2; x < W; x += 5) { g.fillRect(x, 0, 1, 1); g.fillRect(x, H - 1, 1, 1); g.fillRect(x + 1, 1, 1, 1); g.fillRect(x + 1, H - 2, 1, 1); }
  },
  "nilton-arches": (g) => {
    // os quatro arcos amarelos que seguram a cobertura
    g.fillStyle = "#f2c230";
    for (const [cx, cy, sx, sy] of [[SL, ST, -1, -1], [SR, ST, 1, -1], [SL, SB, -1, 1], [SR, SB, 1, 1]]) {
      for (let a = 0; a <= 90; a += 2) {
        const t = (a * Math.PI) / 180;
        g.fillRect(Math.round(cx + sx * 10 * Math.cos(t)), Math.round(cy + sy * 10 * Math.sin(t)), 1, 1);
        g.fillRect(Math.round(cx + sx * 11 * Math.cos(t)), Math.round(cy + sy * 11 * Math.sin(t)), 1, 1);
      }
    }
  },
  "couto-wall": (g) => {
    g.fillStyle = "#0c6b33";
    g.fillRect(0, 0, W, 1);
    g.fillRect(0, H - 1, W, 1);
    g.fillStyle = "#f0f0f0";
    for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 3, 1);
  },
  mountains: (g, art) => {
    // serra ao fundo, visível pelas brechas do estádio
    eachMasked(art, (x, y) => {
      if (!inCorner(x, y) || cornerDist(x, y) < 15.5) return;
      const ridge = (Math.sin(x * 0.7) + Math.cos(y * 0.9)) > 0.4;
      g.fillStyle = ridge ? "#4a5a4c" : "#3a4a3e";
      g.fillRect(x, y, 1, 1);
    });
  },
  palms: (g) => {
    for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) {
      g.fillStyle = "#2f8a3a";
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = "#6b4a2b";
      g.fillRect(x, y, 1, 1);
    }
  },
};

// ------------------------------------------------------------------ iluminação
function paintLights(g: G, art: StadiumArt) {
  const l = art.style.lights;
  if (l === "towers") {
    for (const [lx, ly] of [[1, 0], [W - 6, 0], [1, H - 5], [W - 6, H - 5]]) {
      g.fillStyle = "#59636a";
      g.fillRect(lx, ly, 5, 5);
      g.fillStyle = "#fff8d8";
      g.fillRect(lx + 1, ly + 1, 3, 2);
      g.fillStyle = "#ffe98a";
      g.fillRect(lx + 1, ly + 3, 3, 1);
      glow(g, lx + 2.5, ly + 2.5, 34, 0.32);
    }
  } else if (l === "masts") {
    for (const x of [30, 70, 126, 166])
      for (const y of [0, H - 2]) {
        g.fillStyle = "#59636a";
        g.fillRect(x, y, 3, 2);
        g.fillStyle = "#fff6c8";
        g.fillRect(x, y + (y ? 0 : 1), 3, 1);
        glow(g, x + 1.5, y + 1, 20, 0.22);
      }
  } else {
    // anel de refletores na borda do teto
    const inner = art.style.roof === "main" ? 5 : 4;
    g.fillStyle = "#fffbe6";
    for (let x = 16; x < W - 16; x += 6) {
      g.fillRect(x, inner - 1, 2, 1);
      if (art.style.roof !== "main") g.fillRect(x, H - inner, 2, 1);
    }
    if (art.style.roof === "full")
      for (let y = 20; y < H - 20; y += 6) { g.fillRect(inner - 1, y, 1, 2); g.fillRect(W - inner, y, 1, 2); }
    const lg = g.createLinearGradient(0, 0, 0, 30);
    lg.addColorStop(0, "rgba(255,250,225,0.22)");
    lg.addColorStop(1, "rgba(255,250,225,0)");
    g.fillStyle = lg;
    g.fillRect(0, 0, W, 30);
    if (art.style.roof !== "main") {
      const lb = g.createLinearGradient(0, H, 0, H - 30);
      lb.addColorStop(0, "rgba(255,250,225,0.2)");
      lb.addColorStop(1, "rgba(255,250,225,0)");
      g.fillStyle = lb;
      g.fillRect(0, H - 30, W, 30);
    }
  }
}

function glow(g: G, x: number, y: number, r: number, a: number) {
  const gr = g.createRadialGradient(x, y, 1, x, y, r);
  gr.addColorStop(0, `rgba(255,250,220,${a})`);
  gr.addColorStop(1, "rgba(255,250,220,0)");
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ------------------------------------------------------------------ telão / placar
function paintBoard(g: G, art: StadiumArt, c: Ctx) {
  const b = art.style.board;
  if (b === "none") return;
  const spots: number[] = b === "both" ? [1, W - 11] : b === "right" ? [W - 11] : [1];
  for (const x of spots) {
    const y = 20;
    if (b === "analog") {
      // placar antigo de plaquinhas
      g.fillStyle = "#1f3a2a";
      g.fillRect(x, y, 10, 7);
      g.fillStyle = "#f2f2e6";
      g.fillRect(x + 2, y + 2, 2, 3);
      g.fillRect(x + 6, y + 2, 2, 3);
      g.fillStyle = "#d9c56a";
      g.fillRect(x, y, 10, 1);
      continue;
    }
    g.fillStyle = "#0a0d10";
    g.fillRect(x, y, 10, 8);
    g.fillStyle = "#16233a";
    g.fillRect(x + 1, y + 1, 8, 6);
    g.fillStyle = c.home.colors[0];
    g.fillRect(x + 1, y + 1, 3, 2);
    g.fillStyle = c.away.colors[0];
    g.fillRect(x + 6, y + 1, 3, 2);
    g.fillStyle = "#ffd25a";
    g.fillRect(x + 2, y + 4, 1, 2);
    g.fillRect(x + 7, y + 4, 1, 2);
    g.fillStyle = "#59636a";
    g.fillRect(x + 4, y + 8, 2, 1);
  }
}

// ------------------------------------------------------------------ mosaico
const FONT: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", "-": "000000111000000",
};

/** Mosaico nas cores do clube na arquibancada de baixo (jogos grandes). */
function paintTifo(g: G, c: Ctx) {
  const [c0, c1] = c.home.colors;
  const x0 = TIFO_X0, x1 = TIFO_X1, y0 = 122, y1 = 131;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const band = Math.floor((x - x0) / 8) % 2;
      g.fillStyle = band ? c1 : c0;
      g.fillRect(x, y, 1, 1);
    }
  // nome do clube em letras gigantes no meio
  const txt = (c.home.abbr || "").toUpperCase().replace(/[^A-Z-]/g, "").slice(0, 4);
  const tw = txt.length * 4 - 1;
  const tx = Math.round((x0 + x1) / 2 - tw / 2);
  g.fillStyle = c0;
  g.fillRect(tx - 2, y0 + 1, tw + 4, 7);
  g.fillStyle = c1.toLowerCase() === c0.toLowerCase() ? "#ffffff" : c1;
  for (let i = 0; i < txt.length; i++) {
    const f = FONT[txt[i]];
    if (!f) continue;
    for (let p = 0; p < 15; p++) if (f[p] === "1") g.fillRect(tx + i * 4 + (p % 3), y0 + 2 + Math.floor(p / 3), 1, 1);
  }
}
