// Campo animado em pixel art do jogo ao vivo: estádio visto de cima, torcida com as cores do
// mandante, 22 jogadores (mais o trio de arbitragem) se movendo conforme o que o motor simulou
// em cada minuto. Tudo é desenhado num <canvas> pequeno (W×H "pixels de jogo") ampliado em escala
// inteira com image-rendering: pixelated, então fica nítido em qualquer tela.
// A animação roda fora do React (requestAnimationFrame + refs) e usa Math.random: nunca mexe no
// gerador do mundo, então o resultado da partida é exatamente o mesmo com ou sem o campo.
import { kitsOf, type Kit } from "./Kit";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import type { MatchSim, MinutePhase } from "../engine/match";
import { FORMATIONS, POS_GROUP, type Slot } from "../engine/positions";
import { makeRng } from "../engine/rng";
import type { Club, Fixture, MatchEvent, MatchResult, Player, Race, World } from "../engine/types";
import { Avatar, Crest, StadiumPhoto } from "./components";
import { celebrationFor, drawPitchDude, lookOf, PixelFX, setPose, shotStyle, type SpriteDude } from "./matchSprites";
import { actorOf, playCinematic, wantsCinematic, type CineHandle, type CineOutcome, type CineSpec } from "./cinematics";
import "./economy.css";
import "./matchView.css";
// [stadium-art] identidade de cada estádio (src/ui/stadiumArt.ts)
import { paintPitch, paintStadium, stadiumArt } from "./stadiumArt";
import { StadiumBanner } from "./StadiumBanner";

// ---------------------------------------------------------------- geometria (pixels de jogo)
const W = 196;
const H = 132;
const PX0 = 18; // linha de fundo esquerda
const PX1 = 178; // linha de fundo direita
const PY0 = 20; // lateral de cima
const PY1 = 116; // lateral de baixo
const PL = PX1 - PX0;
const PW = PY1 - PY0;
const CX = (PX0 + PX1) / 2;
const CY = (PY0 + PY1) / 2;
const POST = 5; // meia largura do gol
const BOX_D = 25; // profundidade da grande área
const BOX_H = 28; // meia largura da grande área
const SPOT = 17; // marca do pênalti
const TUNNEL = { x: CX, y: PY0 - 5 };

const GRASS_A = "#3f9a45";
const GRASS_B = "#378c3d";
const LINE = "#e6f4e6";
const OUTLINE = "#0d1a12";

// ---------------------------------------------------------------- cores dos times
/** Cores de um uniforme como o campo desenha (camisa, mangas, calção, meias e padrão). */
export interface KitColors {
  shirt: string;
  sleeve: string;
  shorts: string;
  socks: string;
  pattern: "solid" | "stripes" | "hoops";
  stripe: string;
}

export interface SideColors {
  home: KitColors;
  away: KitColors;
  homeGk: string;
  awayGk: string;
  ref: string;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Distância perceptiva aproximada entre duas cores ("redmean"), 0 a ~765. */
function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function lum(hex: string) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function kitFrom(shirt: string, shorts: string, socks: string, pattern: KitColors["pattern"] = "solid", stripe = shorts): KitColors {
  const sh = colorDist(shorts, shirt) < 60 ? (lum(shirt) > 0.5 ? "#1b1b1b" : "#f2f2f2") : shorts;
  return { shirt, sleeve: shirt, shorts: sh, socks, pattern, stripe };
}

function kitShirtSet(k: KitColors): string[] {
  return k.pattern === "solid" ? [k.shirt] : [k.shirt, k.stripe];
}

function kitsClash(a: KitColors, b: KitColors): boolean {
  for (const x of kitShirtSet(a)) for (const y of kitShirtSet(b)) if (colorDist(x, y) < 150) return true;
  return false;
}

/** Uniforme titular a partir das cores do clube (o escudo dá uma dica do padrão da camisa). */
/** Uniforme real (Wikipedia) convertido para as cores do campinho. */
function realKit(k: Kit): KitColors {
  const shirt = k.shirt ?? k.b;
  return { ...kitFrom(shirt, k.sh, k.so), sleeve: k.la };
}

function homeKitOf(club: Club): KitColors {
  const real = kitsOf(club.id)[0];
  if (real) return realKit(real);
  const [c0, c1, c2] = club.colors;
  const white = lum(c0) > 0.9;
  if (club.crest === "hoops" && !white) return kitFrom(c0, c1 === c0 ? "#f2f2f2" : "#f2f2f2", c0, "hoops", c1);
  if ((club.crest === "vstripes" || club.crest === "vstripes3") && !white) return kitFrom(c0, c1 === "#FFFFFF" ? "#111111" : c1, c0, "stripes", c1);
  return kitFrom(c0, c1, colorDist(c2, c0) < 60 ? c0 : c2);
}

/**
 * Cores dos dois times em campo, sem camisas parecidas (o visitante usa o segundo uniforme ou
 * branco/escuro se precisar), goleiros com cor própria e árbitro destacado. Ponto único para
 * trocar pelos uniformes reais depois.
 */
export function sideColors(sim: MatchSim): SideColors {
  const home = homeKitOf(sim.sides[0].club);
  const [a0, a1, a2] = sim.sides[1].club.colors;
  const candidates: KitColors[] = [
    ...kitsOf(sim.sides[1].club.id).map(realKit),
    homeKitOf(sim.sides[1].club),
    kitFrom(a1, a0, a1),
    kitFrom("#f4f4f4", a0, "#f4f4f4"),
    kitFrom("#1c1c1c", a1, "#1c1c1c"),
    kitFrom(a2, a0, a2),
    kitFrom("#f2c230", "#1c1c1c", "#f2c230"),
  ];
  const away = candidates.find((k) => !kitsClash(k, home)) ?? candidates[2];
  const gkPal = ["#f2d22e", "#ff8a1c", "#2fd36a", "#22c3d6", "#b455e0", "#ff5fa2", "#9be22d"];
  const far = (c: string, others: string[]) => others.every((o) => colorDist(c, o) > 170);
  const shirts = [...kitShirtSet(home), ...kitShirtSet(away)];
  const homeGk = gkPal.find((c) => far(c, shirts)) ?? "#f2d22e";
  const awayGk = gkPal.find((c) => c !== homeGk && far(c, [...shirts, homeGk])) ?? "#22c3d6";
  const ref = ["#151515", "#e9e23c", "#ff4fa0"].find((c) => far(c, [...shirts, homeGk, awayGk])) ?? "#151515";
  return { home, away, homeGk, awayGk, ref };
}

// ---------------------------------------------------------------- aparência dos jogadores
const SKIN: Record<Race, string[]> = {
  white: ["#f4cfa6", "#e8b98d", "#f0c49a"],
  brown: ["#c98d5b", "#b57a4a", "#d29c6c"],
  black: ["#7c4c2b", "#61391f", "#8a5634"],
  asian: ["#efc99a", "#e3b585", "#f2d0a4"],
};
const HAIR = ["#1d140c", "#2e1f12", "#4a3020", "#101010", "#2a2a2a"];

function looksOf(p: Player | undefined): { skin: string; hair: string } {
  if (!p) return { skin: "#d9a777", hair: "#222" };
  const r = makeRng(p.face.s ^ 0x5bd1e995);
  const tones = SKIN[p.face.r] ?? SKIN.brown;
  const skin = tones[Math.floor(r() * tones.length)];
  let hair = HAIR[Math.floor(r() * HAIR.length)];
  if (p.face.r === "white" && r() < 0.18) hair = "#c9a24e";
  return { skin, hair };
}

// ---------------------------------------------------------------- tipos da animação
type Mode = "kickoff" | "play" | "celebrate" | "corner" | "penalty" | "tunnel" | "stand";
type ShotKind = NonNullable<MinutePhase["shot"]>["kind"];

interface Dude extends SpriteDude {
  side: 0 | 1 | 2; // 2 = arbitragem
  k: number; // posição na formação (ou 0 árbitro, 1/2 bandeirinhas)
  pid: number | null;
  bx: number; // posição-base da formação (0-100 ao longo do campo, do próprio gol)
  bv: number; // posição-base lateral (0-100, da esquerda para a direita de quem ataca)
  grp: 0 | 1 | 2 | 3; // goleiro, defesa, meio, ataque
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  walk: number;
  ox: number; // alvo forçado (NaN = nenhum)
  oy: number;
  oUntil: number;
  speed: number;
  hidden: boolean;
  leaving: boolean;
  down: number; // até quando está caído (lesão)
  dive: number; // até quando o goleiro está voando
  diveDir: number;
  arms: number; // até quando comemora com os braços para cima
  sad: boolean;
  shirt: string;
  sleeve: string;
  shorts: string;
  socks: string;
  pattern: KitColors["pattern"];
  stripe: string;
  skin: string;
  hair: string;
  seed: number;
}

interface Flight {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
  dur: number;
  peak: number;
  to: Dude | null;
  done?: () => void;
  /** desvio lateral máximo (chute colocado com curva) */
  curve?: number;
  /** chute forte: rastro de velocidade */
  power?: boolean;
}

interface Icon {
  kind: "Y" | "R" | "sub" | "inj" | "foul" | "var";
  d: Dude | null;
  x: number;
  y: number;
  until: number;
}

interface Fan {
  x: number;
  y: number;
  head: string;
  body: string;
  sec: 0 | 1; // 0 torcida da casa, 1 visitante
}

interface Callbacks {
  caption: (text: string, color: string) => void;
  goal: (e: MatchEvent) => void;
  beat: (e: MatchEvent) => void;
  /** lance decisivo: cena de cinema (só no modo Ultra) */
  cine?: (spec: CineSpec) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const GROUP_N = { GK: 0, DEF: 1, MID: 2, ATT: 3 } as const;
const GROUP_Y = [5, 20, 50, 80];

/** Coordenadas do time (u: 0 próprio gol → 100 gol rival; v: 0 esquerda → 100 direita) para a tela. */
function toPx(side: 0 | 1, u: number, v: number): [number, number] {
  return side === 0 ? [PX0 + (u / 100) * PL, PY0 + (v / 100) * PW] : [PX1 - (u / 100) * PL, PY1 - (v / 100) * PW];
}
function toUV(side: 0 | 1, x: number, y: number): [number, number] {
  return side === 0 ? [((x - PX0) / PL) * 100, ((y - PY0) / PW) * 100] : [((PX1 - x) / PL) * 100, ((PY1 - y) / PW) * 100];
}
/** x da linha do gol que o time ataca. */
const goalX = (side: 0 | 1) => (side === 0 ? PX1 : PX0);
const fwd = (side: 0 | 1) => (side === 0 ? 1 : -1);

// ---------------------------------------------------------------- fundo: estádio
interface Stadium {
  bg: HTMLCanvasElement;
  crowd: HTMLCanvasElement[]; // quadros da torcida pulando: [0..2] normal, [3,4] casa festeja, [5,6] visitante festeja
}

function px(g: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) {
  g.fillRect(Math.round(x), Math.round(y), w, h);
}

function circlePts(r: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    pts.push([x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
  return pts;
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  return [c, g];
}

// áreas sem torcida (torres de luz, bancos de reservas, túnel)
const NO_FANS: [number, number, number, number][] = [
  [0, 0, 6, 6], [W - 6, 0, 6, 6], [0, H - 6, 6, 6], [W - 6, H - 6, 6, 6],
  [64, 8, 22, 8], [110, 8, 22, 8], [93, 6, 10, 10],
];
const blocked = (x: number, y: number) => NO_FANS.some(([bx, by, bw, bh]) => x >= bx && x < bx + bw && y >= by && y < by + bh);

function buildStadium(sim: MatchSim, colors: SideColors): Stadium {
  const home = sim.sides[0].club;
  const away = sim.sides[1].club;
  const rng = makeRng(home.id.split("").reduce((s, c) => s * 31 + c.charCodeAt(0), 7) >>> 0);
  const [bg, g] = makeCanvas();
  // [stadium-art]
  const art = stadiumArt({ home, away, neutral: !!sim.f.neutral, stage: sim.f.stage });

  // estrutura da arquibancada
  g.fillStyle = "#1a2320";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#28322e";
  g.fillRect(0, 0, W, 2);
  g.fillStyle = "#38443f";
  g.fillRect(0, 1, W, 1);

  // gramado listrado (faixas de 10 px alinhadas com a linha de fundo)
  paintPitch(g, art, GRASS_A, GRASS_B); // [stadium-art]
  // placas laterais (atrás dos gols) — as de cima e de baixo são animadas
  const boardPal = ["#1d4ed8", "#dc2626", "#f59e0b", "#059669", "#7c3aed", "#e5e5e5"];
  for (let y = 16; y <= 120; y += 8) {
    g.fillStyle = boardPal[Math.floor(rng() * boardPal.length)];
    g.fillRect(12, y, 1, Math.min(8, 121 - y));
    g.fillStyle = boardPal[Math.floor(rng() * boardPal.length)];
    g.fillRect(184, y, 1, Math.min(8, 121 - y));
  }

  // linhas
  g.fillStyle = LINE;
  g.fillRect(PX0, PY0, PL + 1, 1);
  g.fillRect(PX0, PY1, PL + 1, 1);
  g.fillRect(PX0, PY0, 1, PW + 1);
  g.fillRect(PX1, PY0, 1, PW + 1);
  g.fillRect(CX, PY0, 1, PW + 1);
  for (const [dx, dy] of circlePts(12)) px(g, CX + dx, CY + dy);
  px(g, CX - 1, CY, 3, 1);
  for (const s of [0, 1] as const) {
    const gx = s === 0 ? PX0 : PX1;
    const dir = s === 0 ? 1 : -1;
    // grande área
    const bx = gx + dir * BOX_D;
    g.fillRect(Math.min(gx, bx), CY - BOX_H, BOX_D + 1, 1);
    g.fillRect(Math.min(gx, bx), CY + BOX_H, BOX_D + 1, 1);
    g.fillRect(bx, CY - BOX_H, 1, BOX_H * 2 + 1);
    // pequena área
    const sx = gx + dir * 8;
    g.fillRect(Math.min(gx, sx), CY - 13, 9, 1);
    g.fillRect(Math.min(gx, sx), CY + 13, 9, 1);
    g.fillRect(sx, CY - 13, 1, 27);
    // marca do pênalti e meia-lua
    px(g, gx + dir * SPOT, CY);
    for (const [dx, dy] of circlePts(10)) {
      const x = gx + dir * SPOT + dx;
      if ((dir === 1 && x > bx) || (dir === -1 && x < bx)) px(g, x, CY + dy);
    }
    // escanteios (arco + bandeirinha)
    for (const cy of [PY0, PY1]) {
      const vy = cy === PY0 ? 1 : -1;
      g.fillStyle = LINE;
      px(g, gx + dir * 2, cy);
      px(g, gx + dir, cy + vy);
      px(g, gx, cy + vy * 2);
      g.fillStyle = "#f2d22e";
      px(g, gx - dir, cy - 3 * (cy === PY0 ? 1 : 0) + (cy === PY0 ? 0 : 1), 1, 2);
      g.fillStyle = "#ddd";
      px(g, gx, cy - (cy === PY0 ? 3 : -1), 1, 3);
      g.fillStyle = LINE;
    }
  }

  // bancos de reservas e túnel (na arquibancada principal, em cima)
  for (const [bx, kit] of [[66, colors.home], [112, colors.away]] as const) {
    g.fillStyle = "#11181a";
    g.fillRect(bx - 1, 9, 20, 7);
    g.fillStyle = "#3b4b55";
    g.fillRect(bx - 1, 9, 20, 2);
    g.fillStyle = "#5d7380";
    g.fillRect(bx - 1, 9, 20, 1);
    for (let i = 0; i < 7; i++) {
      const lx = bx + 1 + i * 2 + (i > 3 ? 1 : 0);
      g.fillStyle = HAIR[Math.floor(rng() * HAIR.length)];
      g.fillRect(lx, 12, 1, 1);
      g.fillStyle = kit.shirt;
      g.fillRect(lx, 13, 1, 2);
    }
  }
  g.fillStyle = "#070b09";
  g.fillRect(94, 7, 8, 9);
  g.fillStyle = "#4b5a54";
  g.fillRect(93, 7, 1, 9);
  g.fillRect(102, 7, 1, 9);
  g.fillRect(93, 6, 10, 1);

  // torcida (cada torcedor = 1 px de cabeça + 1 px de corpo, fileiras a cada 3 px)
  const density = art.density; // [stadium-art]
  const pal = (c: Club) => [c.colors[0], c.colors[0], c.colors[0], c.colors[0], c.colors[1], c.colors[1], c.colors[2], "#e9e9e9", "#2a2a2a", c.colors[0]];
  const homePal = pal(home);
  const awayPal = pal(away);
  const step = "#202925";
  const fans: Fan[] = [];
  const isAway = (x: number, y: number) => !sim.f.neutral && ((y >= 123 && x >= 150) || (x >= 185 && y >= 88));
  const isGap = (x: number, y: number) => !sim.f.neutral && ((y >= 123 && x >= 146 && x <= 148) || (x >= 185 && y >= 84 && y <= 86));
  const rows: [number, number, number][] = []; // [y, x0, x1]
  for (let y = 2; y <= 11; y += 3) rows.push([y, 0, W - 1]);
  for (let y = 123; y <= 129; y += 3) rows.push([y, 0, W - 1]);
  for (let y = 14; y <= 120; y += 3) { rows.push([y, 0, 11]); rows.push([y, 185, W - 1]); }
  const skinPal = ["#f1c9a0", "#d9a273", "#b07546", "#7a4a2b", "#e8bb8c"];
  for (const [y, x0, x1] of rows) {
    g.fillStyle = step;
    g.fillRect(x0, y + 2, x1 - x0 + 1, 1);
    for (let x = x0; x <= x1; x++) {
      if (blocked(x, y) || blocked(x, y + 1) || art.mask(x, y)) continue; // [stadium-art]
      const awaySec = isAway(x, y);
      const dens = awaySec ? Math.min(density, 0.75) : density;
      if (isGap(x, y) || rng() > dens) {
        g.fillStyle = art.seatAt(x, y); // [stadium-art]
        g.fillRect(x, y, 1, 2);
        continue;
      }
      const p = awaySec ? awayPal : homePal;
      const body = p[Math.floor(rng() * p.length)];
      const bottom = y >= 123;
      const head = bottom ? HAIR[Math.floor(rng() * HAIR.length)] : skinPal[Math.floor(rng() * skinPal.length)];
      g.fillStyle = head;
      g.fillRect(x, y, 1, 1);
      g.fillStyle = body;
      g.fillRect(x, y + 1, 1, 1);
      fans.push({ x, y, head, body, sec: awaySec ? 1 : 0 });
    }
  }
  // bandeirões
  const flags: [number, number, Club][] = [[24, 3, home], [150, 3, home], [40, 124, home], [110, 124, home], [2, 40, home], [188, 30, home]];
  if (!sim.f.neutral) flags.push([170, 124, away]);
  for (const [fx, fy, c] of flags) {
    g.fillStyle = c.colors[0];
    g.fillRect(fx, fy, 3, 4);
    g.fillStyle = c.colors[1];
    g.fillRect(fx + 3, fy, 3, 4);
  }

  // [stadium-art] estrutura, teto, marcos, luzes, telão e mosaico
  paintStadium(g, art, { home, away, neutral: !!sim.f.neutral, stage: sim.f.stage }, rng);
  // goleiras (redes) por cima do gramado
  for (const s of [0, 1] as const) {
    const gx = s === 0 ? PX0 : PX1;
    const back = s === 0 ? PX0 - 3 : PX1 + 3;
    const x0 = Math.min(gx, back);
    g.fillStyle = "rgba(255,255,255,0.5)";
    for (let y = CY - POST + 1; y < CY + POST; y++) for (let x = x0 + 1; x < x0 + 3; x++) if ((x + y) % 2 === 0) px(g, x, y);
    g.fillStyle = "#f7f7f7";
    g.fillRect(x0, CY - POST, 4, 1);
    g.fillRect(x0, CY + POST, 4, 1);
    g.fillRect(back, CY - POST, 1, POST * 2 + 1);
    g.fillStyle = "#c9d2cc";
    g.fillRect(back, CY - POST + 1, 1, POST * 2 - 1);
  }

  // quadros da torcida "pulando" (só os torcedores levantados; o resto já está no fundo)
  const crowd: HTMLCanvasElement[] = [];
  const frame = (pick: (f: Fan) => boolean, flagsUp: boolean) => {
    const [c, cg] = makeCanvas();
    for (const f of fans) {
      if (!pick(f)) continue;
      cg.fillStyle = f.head;
      cg.fillRect(f.x, f.y - 1, 1, 1);
      cg.fillStyle = f.body;
      cg.fillRect(f.x, f.y, 1, 2);
    }
    if (flagsUp) {
      for (const [fx, fy, cl] of flags) {
        cg.fillStyle = cl.colors[0];
        cg.fillRect(fx, fy - 1, 3, 4);
        cg.fillStyle = cl.colors[1];
        cg.fillRect(fx + 3, fy - 2, 3, 4);
      }
    }
    crowd.push(c);
  };
  for (let i = 0; i < 3; i++) frame(() => Math.random() < 0.05, false);
  for (let i = 0; i < 2; i++) frame((f) => f.sec === 0 && Math.random() < 0.55, i === 0);
  for (let i = 0; i < 2; i++) frame((f) => f.sec === 1 && Math.random() < 0.6, false);
  return { bg, crowd };
}

// ---------------------------------------------------------------- a animação
class PitchAnim {
  sim: MatchSim;
  cb: Callbacks;
  colors: SideColors;
  stadium: Stadium;
  dudes: Dude[] = [];
  ghosts: Dude[] = [];
  ball = { x: CX, y: CY, h: 0, holder: null as Dude | null, fl: null as Flight | null, spin: 0 };
  now = 0;
  mode: Mode = "kickoff";
  kickTeam: 0 | 1 = 0;
  kickoffPending = true;
  poss: 0 | 1 | null = null;
  acts: { t: number; f: () => void }[] = [];
  seen: number;
  ms = 650;
  goalHold = true;
  reduced = false;
  celebr: { scorer: Dude | null; side: 0 | 1; cx: number; cy: number } | null = null;
  setPiece: { side: 0 | 1; taker: Dude | null } | null = null;
  cheer = { side: 0 as 0 | 1, until: -1 };
  flashUntil = -1;
  netShake = { side: 0 as 0 | 1, until: -1 };
  icons: Icon[] = [];
  ended = false;
  endAt = 0;
  carryStart = 0;
  formations: Slot[][];
  /** Ultra: sprites com personalidade, poses, efeitos e lances decisivos */
  rich = false;
  /** congelado enquanto a cena de cinema está na tela */
  frozen = false;
  pfx = new PixelFX();
  lastCine: number | null = null;

  constructor(sim: MatchSim, cb: Callbacks) {
    this.sim = sim;
    this.cb = cb;
    this.colors = sideColors(sim);
    this.stadium = buildStadium(sim, this.colors);
    this.seen = sim.events.length;
    this.formations = sim.sides.map((s) => {
      const f = FORMATIONS[s.club.tactic.formation];
      return f && f.length === s.slots.length ? f : FORMATIONS["4-3-3"];
    });
    for (const side of [0, 1] as const) {
      const S = sim.sides[side];
      for (let k = 0; k < S.slots.length; k++) this.dudes.push(this.makeDude(side, k, S.onPitch[k]));
    }
    for (let k = 0; k < 3; k++) this.dudes.push(this.makeDude(2, k, null));
    this.ended = sim.finished;
    if (sim.minute > 0 || sim.half === 2) {
      // campo ligado no meio do jogo: começa já com a bola rolando
      this.kickoffPending = false;
      this.mode = sim.finished ? "tunnel" : "play";
      const atk = sim.phase.atk ?? 0;
      this.poss = atk;
      for (const d of this.dudes) {
        this.target(d);
        d.x = d.tx;
        d.y = d.ty;
        if (sim.finished && d.side !== 2) d.hidden = true;
      }
      const holder = this.team(atk).find((d) => d.grp === 2) ?? null;
      this.ball.holder = holder;
    } else {
      this.snapToTargets();
    }
    this.placeBall();
  }

  // ------------------------------------------------ elenco
  makeDude(side: 0 | 1 | 2, k: number, pid: number | null): Dude {
    const d: Dude = {
      side, k, pid, bx: 50, bv: 50, grp: 2, x: CX, y: CY, tx: CX, ty: CY, vx: 0, vy: 0, walk: 0,
      ox: NaN, oy: NaN, oUntil: 0, speed: 1, hidden: false, leaving: false, down: -1, dive: -1, diveDir: 1, arms: -1, sad: false,
      shirt: "#888", sleeve: "#888", shorts: "#333", socks: "#888", pattern: "solid", stripe: "#888", skin: "#d9a777", hair: "#222",
      seed: Math.random() * 100,
    };
    if (side === 2) {
      d.shirt = d.sleeve = d.socks = this.colors.ref;
      d.shorts = "#151515";
      d.skin = ["#e8b98d", "#c98d5b", "#7c4c2b"][k % 3];
      d.hair = HAIR[k % HAIR.length];
      d.x = d.tx = k === 0 ? CX - 14 : CX + (k === 1 ? 30 : -30);
      d.y = d.ty = k === 0 ? CY + 10 : k === 1 ? PY0 - 1 : PY1 + 2;
      return d;
    }
    this.applySlot(d);
    this.applyPlayer(d, pid);
    return d;
  }

  applySlot(d: Dude) {
    if (d.side === 2) return;
    const S = this.sim.sides[d.side];
    const base = this.formations[d.side][d.k];
    const grp = GROUP_N[POS_GROUP[S.slots[d.k]]];
    d.grp = grp;
    d.bv = base?.x ?? 50;
    d.bx = base && GROUP_N[POS_GROUP[base.pos]] === grp ? base.y : GROUP_Y[grp];
  }

  applyPlayer(d: Dude, pid: number | null) {
    if (d.side === 2) return;
    d.pid = pid;
    const kit = d.side === 0 ? this.colors.home : this.colors.away;
    const gk = d.grp === 0;
    const gkc = d.side === 0 ? this.colors.homeGk : this.colors.awayGk;
    d.shirt = gk ? gkc : kit.shirt;
    d.sleeve = gk ? gkc : kit.sleeve;
    d.shorts = gk ? "#1d1d1d" : kit.shorts;
    d.socks = gk ? gkc : kit.socks;
    d.pattern = gk ? "solid" : kit.pattern;
    d.stripe = kit.stripe;
    const lk = looksOf(pid != null ? this.sim.w.players[pid] : undefined);
    d.skin = lk.skin;
    d.hair = lk.hair;
    d.look = lookOf(pid != null ? this.sim.w.players[pid] : undefined);
    if (pid == null) d.hidden = true;
  }

  team(side: 0 | 1): Dude[] {
    return this.dudes.filter((d) => d.side === side && !d.hidden && !d.leaving && d.pid != null);
  }

  byPid(pid: number | null | undefined): Dude | null {
    if (pid == null) return null;
    return this.dudes.find((d) => d.pid === pid && d.side !== 2 && !d.hidden) ?? null;
  }

  gk(side: 0 | 1): Dude | null {
    return this.team(side).find((d) => d.grp === 0) ?? null;
  }

  name(d: Dude | null | undefined): string {
    return d && d.pid != null ? this.sim.name(d.pid) : "";
  }

  kitColor(side: 0 | 1 | null): string {
    if (side == null) return "#9aa5a0";
    return (side === 0 ? this.colors.home : this.colors.away).shirt;
  }

  /** Substituições, expulsões e lesões: atualiza quem está em cada posição. */
  syncRoster(evs: MatchEvent[]) {
    const subs = new Map<number, MatchEvent>();
    for (const e of evs) if (e.type === "sub" && e.pid != null) subs.set(e.pid, e);
    for (const d of this.dudes) {
      if (d.side === 2) continue;
      const S = this.sim.sides[d.side];
      const pid = S.onPitch[d.k];
      const slotChanged = GROUP_N[POS_GROUP[S.slots[d.k]]] !== d.grp;
      if (slotChanged) this.applySlot(d);
      if (pid === d.pid) {
        if (slotChanged) this.applyPlayer(d, pid);
        continue;
      }
      if (pid == null) {
        // expulso (ou saiu sem reposição): caminha para o vestiário
        if (!d.hidden) {
          d.leaving = true;
          if (this.ball.holder === d) this.ball.holder = null;
        }
        continue;
      }
      // substituição: quem sai vai para o banco, quem entra corre da lateral
      if (d.pid != null && !d.hidden) {
        const ghost: Dude = { ...d, leaving: true, ox: NaN, oy: NaN, arms: -1 };
        const injured = evs.some((e) => e.type === "injury" && e.pid === d.pid);
        if (injured) ghost.down = this.now + 900;
        ghost.speed = injured ? 0.45 : 0.7;
        this.ghosts.push(ghost);
        if (this.ball.holder === d) this.ball.holder = null;
      }
      d.hidden = false;
      d.leaving = false;
      this.applySlot(d);
      this.applyPlayer(d, pid);
      d.x = CX + (d.side === 0 ? -8 : 8);
      d.y = PY0 - 2;
      if (subs.has(pid)) this.icons.push({ kind: "sub", d, x: 0, y: 0, until: this.now + 1600 });
    }
  }

  // ------------------------------------------------ alvos (para onde cada um corre)
  ballUV(side: 0 | 1): [number, number] {
    return toUV(side, this.ball.x, this.ball.y);
  }

  shapeTarget(d: Dude, attacking: boolean): [number, number] {
    const side = d.side as 0 | 1;
    const S = this.sim.sides[side];
    const [bu, bv] = this.ballUV(side);
    if (d.grp === 0) {
      return toPx(side, clamp(1.5 + bu * 0.07, 1.5, 9), 50 + (bv - 50) * 0.18);
    }
    let u: number, v: number;
    if (attacking) {
      const line = clamp(bu * 0.5 + 6 + S.mentality * 3, 18, 52);
      u = Math.min(93, line + (d.bx - 17) * 0.78);
      v = 50 + (d.bv - 50) * 1.06 + (bv - 50) * 0.14;
    } else {
      const line = clamp(bu * 0.45 - 2 + S.pressing * 3 + S.mentality * 1.5, 6, 38);
      u = line + (d.bx - 17) * 0.56;
      v = 50 + (d.bv - 50) * 0.78 + (bv - 50) * 0.3;
    }
    return toPx(side, u, clamp(v, 3, 97));
  }

  kickoffTarget(d: Dude): [number, number] {
    const side = d.side as 0 | 1;
    if (d.grp === 0) return toPx(side, 2, 50);
    let u = Math.min(46, 5 + d.bx * 0.52);
    const v = 50 + (d.bv - 50) * 0.9;
    if (side === this.kickTeam) {
      const fw = this.team(side).filter((x) => x.grp !== 0).sort((a, b) => b.bx - a.bx || a.bv - b.bv);
      if (fw[0] === d) return toPx(side, 49.4, 50);
      if (fw[1] === d) return toPx(side, 47.5, 58);
    } else if (Math.abs(v - 50) < 20) u = Math.min(u, 38);
    return toPx(side, u, v);
  }

  target(d: Dude) {
    if (d.side === 2) return this.officialTarget(d);
    let tx: number, ty: number;
    const side = d.side as 0 | 1;
    if (d.leaving) {
      [tx, ty] = [TUNNEL.x, TUNNEL.y];
    } else if (!Number.isNaN(d.ox) && this.now < d.oUntil) {
      tx = d.ox;
      ty = d.oy;
    } else {
      switch (this.mode) {
        case "kickoff":
          [tx, ty] = this.kickoffTarget(d);
          break;
        case "tunnel":
          [tx, ty] = [TUNNEL.x + ((d.seed % 5) - 2), TUNNEL.y];
          break;
        case "stand":
          [tx, ty] = [d.x, d.y];
          break;
        case "celebrate": {
          const c = this.celebr!;
          if (d === c.scorer) [tx, ty] = [c.cx, c.cy];
          else if (side === c.side && d.grp !== 0 && c.scorer) {
            const a = d.seed;
            const r = 4 + (d.k % 3) * 2;
            [tx, ty] = [c.scorer.x + Math.cos(a) * r - fwd(side) * 3, c.scorer.y + Math.sin(a) * r];
          } else [tx, ty] = this.kickoffTarget(d);
          break;
        }
        case "corner":
        case "penalty":
          [tx, ty] = this.setPieceTarget(d);
          break;
        default:
          [tx, ty] = this.shapeTarget(d, this.poss === side);
          if (this.ball.holder === d && d.grp !== 0) {
            // conduzindo a bola: avança devagar
            const push = Math.min(14, ((this.now - this.carryStart) / 1000) * 9 * this.spd());
            tx += fwd(side) * push;
          }
      }
      if (this.mode === "play" && this.poss != null && side !== this.poss && d.grp !== 0 && this.pressers(side).includes(d)) {
        tx = this.ball.x - fwd(side) * 3;
        ty = this.ball.y + (d.y < this.ball.y ? -2 : 2);
      }
      if (!this.reduced && this.mode !== "tunnel" && this.mode !== "stand") {
        tx += Math.sin(this.now / 900 + d.seed) * 1.3;
        ty += Math.cos(this.now / 1150 + d.seed * 1.7) * 1.1;
      }
    }
    d.tx = clamp(tx, 4, W - 4);
    d.ty = clamp(ty, 10, H - 2);
  }

  pressCache = { t: -1, side: 0, list: [] as Dude[] };
  pressers(side: 0 | 1): Dude[] {
    if (this.pressCache.t === this.now && this.pressCache.side === side) return this.pressCache.list;
    const n = this.sim.sides[side].pressing >= 2 ? 2 : 1;
    const list = this.team(side)
      .filter((d) => d.grp !== 0 && Number.isNaN(d.ox))
      .sort((a, b) => Math.hypot(a.x - this.ball.x, a.y - this.ball.y) - Math.hypot(b.x - this.ball.x, b.y - this.ball.y))
      .slice(0, n);
    this.pressCache = { t: this.now, side, list };
    return list;
  }

  setPieceTarget(d: Dude): [number, number] {
    const sp = this.setPiece!;
    const side = d.side as 0 | 1;
    const atk = side === sp.side;
    if (d === sp.taker) return [d.x, d.y];
    if (d.grp === 0) return atk ? toPx(side, 30, 50) : toPx(side, 0.5, 50);
    // todo mundo na área (escanteio) ou na entrada da área (pênalti)
    const h = (d.seed * 7.3) % 1;
    const h2 = (d.seed * 3.1) % 1;
    if (this.mode === "penalty") {
      const [x, y] = toPx(sp.side, 78 - h * 8, 20 + h2 * 60);
      return [x, y];
    }
    if (atk) {
      if (d.grp === 1 && d.bx < 18 && d.k % 2 === 0) return toPx(side, 45, 35 + h2 * 30);
      return toPx(side, 84 + h * 9, 32 + h2 * 36);
    }
    if (d.grp === 3 && h > 0.5) return toPx(side, 30, 40 + h2 * 20);
    return toPx(side, 4 + h * 10, 34 + h2 * 32);
  }

  officialTarget(d: Dude) {
    if (this.mode === "tunnel") {
      d.tx = TUNNEL.x + (d.k - 1) * 2;
      d.ty = TUNNEL.y;
      return;
    }
    if (!Number.isNaN(d.ox) && this.now < d.oUntil) {
      d.tx = d.ox;
      d.ty = d.oy;
      return;
    }
    if (d.k === 0) {
      const off = this.ball.x < CX ? 14 : -14;
      d.tx = clamp(this.ball.x + off, PX0 + 10, PX1 - 10);
      d.ty = clamp(this.ball.y + (this.ball.y < CY ? 12 : -12), PY0 + 6, PY1 - 4);
    } else if (d.k === 1) {
      d.tx = clamp(this.ball.x, CX + 4, PX1 - 2);
      d.ty = PY0 - 1;
    } else {
      d.tx = clamp(this.ball.x, PX0 + 2, CX - 4);
      d.ty = PY1 + 2;
    }
  }

  spd(): number {
    return clamp(Math.pow(650 / this.ms, 0.8), 1, 6);
  }

  snapToTargets() {
    for (const d of this.dudes) {
      this.target(d);
      d.x = d.tx;
      d.y = d.ty;
    }
  }

  // ------------------------------------------------ bola
  holdOffset(d: Dude): [number, number, number] {
    if (d.grp === 0 && d.side !== 2) return [0, -1, 3];
    return [fwd(d.side as 0 | 1) * 2, 0, 0];
  }

  placeBall() {
    const b = this.ball;
    if (b.holder) {
      const [ox, oy, oh] = this.holdOffset(b.holder);
      b.x = b.holder.x + ox;
      b.y = b.holder.y + oy;
      b.h = oh;
    }
  }

  setHolder(d: Dude | null) {
    this.ball.holder = d;
    this.carryStart = this.now;
    if (d && d.side !== 2) this.poss = d.side as 0 | 1;
  }

  fly(x1: number, y1: number, dur: number, peak: number, to: Dude | null, done?: () => void) {
    const b = this.ball;
    b.holder = null;
    if (this.reduced) dur = 1;
    b.fl = { x0: b.x, y0: b.y, x1, y1, t0: this.now, dur: Math.max(1, dur), peak, to, done };
    if (this.nextFx) {
      Object.assign(b.fl, this.nextFx);
      this.nextFx = null;
    }
  }
  nextFx: { curve?: number; power?: boolean } | null = null;

  /** Passe: o recebedor corre para o ponto onde a bola vai chegar. */
  pass(to: Dude, lob = false) {
    if (to.hidden || to.leaving) return;
    const b = this.ball;
    const dist0 = Math.hypot(to.tx - b.x, to.ty - b.y);
    const dur = clamp(dist0 * 6.5, 110, 360) / this.spd();
    const reach = (34 * this.spd() * to.speed * dur) / 1000;
    const dx = to.tx - to.x, dy = to.ty - to.y;
    const dd = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, (reach * 0.9) / dd);
    const lx = to.x + dx * k, ly = to.y + dy * k;
    const [ox, oy] = this.holdOffset(to);
    to.ox = lx;
    to.oy = ly;
    to.oUntil = this.now + dur + 60;
    const dist = Math.hypot(lx - b.x, ly - b.y);
    this.poss = to.side as 0 | 1;
    this.fly(lx + ox, ly + oy, dur, lob || dist > 48 ? Math.min(9, dist * 0.11) : 0, to);
  }

  // ------------------------------------------------ roteiro de cada minuto
  at(t: number, f: () => void) {
    this.acts.push({ t: this.now + t, f });
  }

  lastImportant = -1e9;
  /** Legenda do lance. Narração de evento (prio 1) fica no ar um pouco antes de um simples passe a substituir. */
  say(text: string, side: 0 | 1 | null = null, prio: 0 | 1 = 0) {
    if (!text) return;
    const t = performance.now();
    if (prio === 0 && t - this.lastImportant < 1300) return;
    if (prio === 1) this.lastImportant = t;
    this.cb.caption(text, this.kitColor(side));
  }

  /** Chamado a cada minuto simulado (e quando vários minutos passam de uma vez). */
  onTick() {
    const sim = this.sim;
    const evs = sim.events.slice(this.seen);
    if (sim.events.length === this.seen && !(sim.finished && !this.ended)) return;
    this.seen = sim.events.length;
    this.syncRoster(evs);
    // descarta o que sobrou do minuto anterior (a bola em voo termina o trajeto)
    this.acts = [];
    for (const d of this.dudes) if (d !== this.ball.fl?.to) d.ox = NaN;
    this.setPiece = this.mode === "corner" || this.mode === "penalty" ? null : this.setPiece;
    if (this.mode === "corner" || this.mode === "penalty") this.mode = "play";

    if (sim.finished || evs.some((e) => e.type === "end")) return this.fullTime(evs);
    const half = evs.find((e) => e.type === "half");
    if (half) return this.halfTime(half);

    const B = this.ms * 0.92;
    let t = 0;
    if (this.kickoffPending) t = this.kickOff(B);
    const ph = sim.phase;
    if (ph.atk == null) return;
    // narração do minuto (escanteio, pênalti marcado, lance comum)
    const info = evs.find((e) => e.type === "info" || e.type === "chance");
    if (info) this.at(t + 0.05 * B, () => this.say(info.text, info.side ?? ph.atk, 1));

    if (ph.penalty && ph.penalty.taker != null) this.penaltyScript(ph, evs, t);
    else if (ph.shot) this.shotScript(ph, evs, t, B);
    else if (ph.corner) this.cornerScript(ph, t, B);
    else this.possessionScript(ph, t, B);

    this.extrasScript(ph, evs, B);
    this.acts.sort((a, b) => a.t - b.t);
  }

  /** Bola com quem vai estar quando o roteiro começar. */
  expected(): Dude | null {
    return this.ball.fl ? this.ball.fl.to : this.ball.holder;
  }

  nearest(side: 0 | 1, x: number, y: number, noGk = true, exclude?: Dude | null): Dude | null {
    let best: Dude | null = null, bd = 1e9;
    for (const d of this.team(side)) {
      if ((noGk && d.grp === 0) || d === exclude) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  /** Próximo da troca de passes: de trás para a frente, preferindo quem está a uma distância boa. */
  pickNext(cur: Dude, side: 0 | 1, exclude?: Dude | null): Dude | null {
    const mates = this.team(side).filter((d) => d !== cur && d !== exclude && d.grp !== 0);
    if (!mates.length) return null;
    const ws = mates.map((d) => {
      const dg = d.grp - cur.grp;
      let w = dg === 1 ? 3 : dg === 0 ? 1.4 : dg === 2 ? 0.9 : dg < 0 ? 0.55 : 0.4;
      if (cur.grp === 3 && d.grp === 3) w = 1.6;
      const dist = Math.hypot(d.x - cur.x, d.y - cur.y);
      w *= Math.exp(-Math.abs(dist - 32) / 26);
      return w;
    });
    let r = Math.random() * ws.reduce((s, x) => s + x, 0);
    for (let i = 0; i < mates.length; i++) {
      r -= ws[i];
      if (r <= 0) return mates[i];
    }
    return mates[mates.length - 1];
  }

  /** Quem ataca recupera a bola (se ela estava com o rival ou solta). */
  ensurePossession(atk: 0 | 1, t: number, B: number): [Dude | null, number] {
    let cur = this.expected();
    if (cur && cur.side === atk && !cur.hidden && !cur.leaving) return [cur, t];
    const fl = this.ball.fl;
    const bx = fl ? fl.x1 : this.ball.x, by = fl ? fl.y1 : this.ball.y;
    const holderGk = cur && cur.grp === 0 ? cur : null;
    cur = this.nearest(atk, bx, by);
    if (!cur) return [null, t];
    const g = cur;
    if (holderGk) {
      // goleiro rival dá o chutão e a bola sobra para o time que ataca
      this.at(t, () => this.pass(g, true));
      this.at(t, () => this.say(`${this.name(holderGk)} dá o chutão`, holderGk.side as 0 | 1));
    } else {
      this.at(t, () => {
        const dur = 120 / this.spd();
        g.ox = this.ball.x;
        g.oy = this.ball.y;
        g.oUntil = this.now + dur;
        this.poss = atk;
        this.fly(this.ball.x + (g.x - this.ball.x) * 0.5, this.ball.y + (g.y - this.ball.y) * 0.5, dur, 0, g);
      });
      this.at(t, () => this.say(`${this.name(g)} recupera a bola`, atk));
    }
    return [g, t + 0.16 * B];
  }

  possessionScript(ph: MinutePhase, t0: number, B: number) {
    const atk = ph.atk!;
    const [start, t1] = this.ensurePossession(atk, t0, B);
    if (!start) return;
    const n = this.ms >= 600 ? 2 + (Math.random() < 0.5 ? 1 : 0) : this.ms >= 300 ? 1 + (Math.random() < 0.6 ? 1 : 0) : 1;
    const tackler = ph.tackle?.pid != null ? this.byPid(ph.tackle.pid) : null;
    const end = tackler ? 0.72 * B : 0.9 * B;
    const gap = Math.max(0, end - t1) / n;
    let cur = start;
    let first = true;
    for (let i = 0; i < n; i++) {
      const nx = this.pickNext(cur, atk);
      if (!nx) break;
      const from = cur;
      const tt = t1 + gap * i + gap * 0.25;
      this.at(tt, () => this.pass(nx));
      if (first || Math.random() < 0.5) this.at(tt, () => this.say(`${this.name(from)} toca para ${this.name(nx)}`, atk));
      first = false;
      cur = nx;
    }
    if (tackler && tackler.side !== atk) {
      const victim = cur;
      const td = tackler;
      this.at(0.74 * B, () => {
        td.ox = this.ball.x;
        td.oy = this.ball.y;
        td.oUntil = this.now + 260 / this.spd();
      });
      this.at(0.86 * B, () => {
        if (td.hidden || td.leaving) return;
        const dur = 70 / this.spd();
        this.poss = td.side as 0 | 1;
        this.fly(td.x + fwd(td.side as 0 | 1) * 2, td.y, dur, 0, td);
        if (Math.random() < 0.45) this.say(`${this.name(td)} desarma ${this.name(victim)}`, td.side as 0 | 1);
      });
    }
  }

  shootingSpot(d: Dude, kind?: ShotKind): [number, number] {
    const side = d.side as 0 | 1;
    // cabeçada: na marca do pênalti; falta: na meia-lua; chute de longe: fora da área
    const u = kind === "header" ? rnd(89, 93) : kind === "freekick" ? rnd(74, 79) : kind === "long" ? rnd(66, 73)
      : d.grp === 3 ? rnd(80, 90) : d.grp === 2 ? rnd(70, 80) : rnd(84, 90);
    const v = 50 + (d.bv - 50) * 0.45 + rnd(-8, 8);
    return toPx(side, u, clamp(v, 22, 78));
  }

  shotScript(ph: MinutePhase, evs: MatchEvent[], t0: number, B: number) {
    const sh = ph.shot!;
    const atk = sh.side;
    const shooter = this.byPid(sh.shooter);
    if (!shooter) return this.possessionScript(ph, t0, B);
    const goalE = evs.find((e) => (e.type === "goal" || e.type === "owngoal") && e.side === atk);
    const outE = evs.find((e) => (e.type === "save" || e.type === "miss" || e.type === "post" || e.type === "var") && e.side === atk);
    const slow = this.ms >= 300;
    const hold = !!goalE && this.goalHold && slow;
    const Bs = hold ? (this.ms >= 600 ? 1250 : 900) : B;
    const [start, t1] = this.ensurePossession(atk, t0, Bs);
    let t = t1;
    let cur = start;
    const spot = this.shootingSpot(shooter, sh.kind);
    const assist = this.byPid(sh.assist);
    if (this.rich && sh.kind === "freekick") this.at(t0, () => this.wall(atk, spot));
    this.at(t0, () => {
      // o finalizador dispara para a área (e o time sobe junto)
      shooter.ox = spot[0];
      shooter.oy = spot[1];
      shooter.oUntil = this.now + Bs * 0.8;
      shooter.speed = 1.8;
      if (assist && assist !== shooter) assist.speed = 1.4;
    });
    const shotT = t0 + 0.68 * (Bs - t0) + (t1 - t0) * 0.3;
    if (slow && assist && assist !== cur && assist !== shooter && cur) {
      const a = assist;
      this.at(t, () => this.pass(a));
      const from = cur;
      this.at(t, () => this.say(`${this.name(from)} acha ${this.name(a)}`, atk));
      cur = a;
      t += (shotT - t) * 0.45;
    }
    if (cur && cur !== shooter) {
      const from = cur;
      const tt = Math.max(t, shotT - 0.3 * Bs);
      this.at(tt, () => this.pass(shooter, Math.random() < 0.35));
      if (assist === from || !assist) this.at(tt, () => this.say(`${this.name(from)} serve ${this.name(shooter)}`, atk));
    }
    this.at(shotT, () => {
      const verb = sh.kind === "header" ? "sobe de cabeça…" : sh.kind === "freekick" ? "cobra a falta…" : sh.kind === "long" ? "arrisca de longe…" : "finaliza…";
      this.say(`${this.name(shooter)} ${verb}`, atk, 1);
      this.doShot(shooter, sh, goalE ?? outE ?? null, hold);
    });
  }

  /** A finalização em si: bola para o gol, para fora, no goleiro ou na trave. */
  doShot(shooter: Dude, sh: NonNullable<MinutePhase["shot"]>, e: MatchEvent | null, hold: boolean) {
    const atk = sh.side;
    const def = (1 - atk) as 0 | 1;
    const gx = goalX(atk);
    const f = fwd(atk);
    const keeper = this.gk(def);
    const sp = this.spd();
    const fromX = this.ball.x, fromY = this.ball.y;
    const dist = Math.abs(gx - fromX);
    const dur = clamp(dist * 3.2, 110, 240) / sp * (hold ? 1.25 : 1);
    this.flashUntil = this.now + dur + 300;
    const kY = keeper ? keeper.y : CY;
    if (this.rich) this.shotFx(shooter, sh, keeper);
    const dive = (ty: number, reach: boolean) => {
      if (!keeper) return;
      keeper.ox = gx - f * 2;
      keeper.oy = reach ? ty : kY + clamp(ty - kY, -3, 3);
      keeper.oUntil = this.now + dur + 500;
      this.at(dur * 0.45, () => {
        keeper.dive = this.now + 450;
        keeper.diveDir = ty >= keeper.y ? 1 : -1;
      });
    };
    switch (sh.result) {
      case "goal":
      case "var":
      case "owngoal": {
        const side = kY > CY ? -1 : 1;
        const ty = CY + side * rnd(1.5, 4);
        const og = sh.result === "owngoal" ? this.byPid(sh.og) : null;
        dive(CY - side * 3, false);
        const finish = () => {
          this.fly(gx + f * 2, ty + rnd(-1, 1), dur * 0.35, 0, null, () => this.scored(sh, e, shooter, hold));
        };
        if (og) {
          const mx = fromX + (gx - fromX) * 0.7, my = fromY + (ty - fromY) * 0.7;
          og.ox = mx;
          og.oy = my;
          og.oUntil = this.now + dur + 200;
          this.fly(mx, my, dur * 0.7, 2, null, finish);
        } else this.fly(gx, ty, dur, sh.xg > 0.3 ? 0 : rnd(0, 4), null, finish);
        break;
      }
      case "save": {
        const ty = kY + rnd(-5, 5);
        dive(ty, true);
        this.fly(gx - f * 2, clamp(ty, CY - POST, CY + POST), dur, rnd(0, 3), null, () => {
          if (e) this.cb.beat(e);
          if (e) this.say(e.text, atk, 1);
          if (this.rich) this.pfx.burst(this.ball.x, this.ball.y - this.ball.h, ["#ffffff", "#bfe8ff"], 8, 0.7);
          if (!keeper || Math.random() < 0.45) {
            // espalma
            const py = CY + (Math.random() < 0.5 ? -1 : 1) * rnd(12, 24);
            this.fly(gx - f * rnd(8, 16), py, 200 / sp, 3, null);
          } else this.setHolder(keeper);
        });
        break;
      }
      case "post": {
        const py = CY + (Math.random() < 0.5 ? -POST : POST);
        dive(py, false);
        this.fly(gx, py, dur, rnd(0, 3), null, () => {
          if (e) this.cb.beat(e);
          if (e) this.say(e.text, atk, 1);
          if (this.rich) this.pfx.burst(gx, py - 2, ["#fff6b0", "#ffd83a", "#ffffff"], 18, 1.2);
          this.fly(gx - f * rnd(10, 18), py + rnd(-10, 10), 180 / sp, 2, null);
        });
        break;
      }
      default: {
        // para fora: por cima ou ao lado
        const over = Math.random() < 0.45;
        const py = over ? CY + rnd(-POST, POST) : CY + (Math.random() < 0.5 ? -1 : 1) * rnd(POST + 2, POST + 12);
        dive(py, false);
        this.fly(gx + f * 4, py, dur, over ? 9 : rnd(0, 3), null, () => {
          if (e) this.say(e.text, atk, 1);
          if (e) this.cb.beat(e);
          // tiro de meta
          this.at(320 / sp, () => {
            if (!keeper) return;
            this.ball.x = gx - f * 7;
            this.ball.y = CY + rnd(-6, 6);
            this.ball.h = 0;
            this.setHolder(keeper);
          });
        });
      }
    }
  }

  /** Ultra: pose do chute conforme o estilo, rastro/curva da bola e, se for lance decisivo, a cena. */
  shotFx(shooter: Dude, sh: NonNullable<MinutePhase["shot"]>, keeper: Dude | null) {
    const p = this.sim.w.players[sh.shooter];
    const style = shotStyle(p, sh.kind, this.sim.minute, sh.result);
    const pose = style === "header" ? "header" : style === "bicycle" ? "bicycle" : style === "volley" ? "volley" : "kick";
    setPose(shooter, pose, this.now, pose === "bicycle" ? 520 : pose === "header" ? 420 : 260);
    if (style === "power" || style === "volley" || style === "bicycle") this.nextFx = { power: true };
    else if (style === "curl" || style === "freekick") this.nextFx = { curve: (Math.random() < 0.5 ? -1 : 1) * rnd(3, 6) };
    const outcome: CineOutcome = sh.result === "goal" ? "goal" : sh.result === "save" ? "save" : sh.result === "post" ? "post" : "miss";
    if (sh.result !== "var" && sh.result !== "owngoal") this.maybeCine(shooter, keeper, sh.side, outcome, style, sh.xg, false);
  }

  /** Dispara a cena de lance decisivo (só Ultra, velocidades lentas, sem "menos movimento"). */
  maybeCine(shooter: Dude, keeper: Dude | null, atk: 0 | 1, outcome: CineOutcome, style: CineSpec["style"], xg: number, penalty: boolean) {
    if (!this.cb.cine || this.reduced || !this.goalHold || this.ms < 300) return;
    const min = this.sim.minute;
    const seed = (shooter.pid ?? 0) * 131 + min;
    if (!wantsCinematic({ outcome, penalty, xg, min, lastMin: this.lastCine, seed })) return;
    this.lastCine = min;
    const p = shooter.pid != null ? this.sim.w.players[shooter.pid] : undefined;
    const def = (1 - atk) as 0 | 1;
    const defender = this.team(def).filter((d) => d.grp === 1 || d.grp === 2).sort((a, b) => Math.hypot(a.x - shooter.x, a.y - shooter.y) - Math.hypot(b.x - shooter.x, b.y - shooter.y))[0] ?? null;
    const dribbler = shooter.look?.style === "dribbler" || (p?.attrs.dri ?? 0) >= 80;
    const dribble = !penalty && style !== "header" && style !== "freekick" && style !== "volley" && style !== "bicycle" && (dribbler ? (seed % 3) !== 0 : seed % 4 === 0);
    this.cb.cine({
      outcome, style, dribble,
      shooter: actorOf(shooter, this.name(shooter)),
      keeper: keeper ? actorOf(keeper, this.name(keeper)) : null,
      defender: defender ? actorOf(defender, this.name(defender)) : null,
      color: this.kitColor(atk),
      defColor: this.kitColor(def),
      celebration: celebrationFor(p, this.sim.events.length),
      title: penalty ? "Pênalti" : outcome === "goal" ? "Lance decisivo" : "Grande chance",
      seed,
    });
  }

  /** Barreira na falta direta: quatro defensores entre a bola e o gol. */
  wall(atk: 0 | 1, spot: [number, number]) {
    const def = (1 - atk) as 0 | 1;
    const gx = goalX(atk);
    const dx = gx - spot[0], dy = CY - spot[1];
    const dd = Math.hypot(dx, dy) || 1;
    const wx = spot[0] + (dx / dd) * 9, wy = spot[1] + (dy / dd) * 9;
    const men = this.team(def).filter((d) => d.grp !== 0).sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy)).slice(0, 4);
    men.forEach((d, i) => {
      d.ox = wx + (-dy / dd) * (i - 1.5) * 3;
      d.oy = wy + (dx / dd) * (i - 1.5) * 3;
      d.oUntil = this.now + this.ms * 0.9;
      d.speed = 1.8;
    });
  }

  /** Bola na rede (ou gol anulado pelo VAR). */
  scored(sh: NonNullable<MinutePhase["shot"]> | { side: 0 | 1; result: "goal" }, e: MatchEvent | null, scorer: Dude | null, hold: boolean) {
    const atk = sh.side;
    this.netShake = { side: atk, until: this.now + 450 };
    if (sh.result === "var") {
      if (e) this.say(e.text, atk, 1);
      this.icons.push({ kind: "var", d: null, x: CX, y: CY - 16, until: this.now + 1800 });
      this.at(700 / this.spd(), () => {
        const keeper = this.gk((1 - atk) as 0 | 1);
        this.ball.x = goalX(atk) - fwd(atk) * 7;
        this.ball.y = CY;
        if (keeper) this.setHolder(keeper);
      });
      return;
    }
    if (e) {
      this.cb.goal(e);
      this.say(e.text, atk, 1);
    }
    this.cheer = { side: !this.sim.f.neutral || atk === 0 ? (atk as 0 | 1) : 0, until: this.now + 2600 };
    this.flashUntil = this.now + 1400;
    const gx = goalX(atk);
    const cy = scorer && scorer.y < CY ? PY0 + 3 : PY1 - 3;
    this.celebr = { scorer, side: atk, cx: gx - fwd(atk) * 4, cy };
    this.mode = "celebrate";
    for (const d of this.team(atk)) {
      d.arms = this.now + (d === scorer ? 2200 : 1700);
      if (d.grp !== 0) d.speed = d === scorer ? 1.9 : 1.6;
    }
    for (const d of this.team((1 - atk) as 0 | 1)) d.sad = true;
    if (this.rich && scorer) {
      const c = celebrationFor(scorer.pid != null ? this.sim.w.players[scorer.pid] : undefined, this.sim.events.length);
      if (c === "knee") this.at(500, () => setPose(scorer, "knee", this.now, 900));
      else if (c === "flip") this.at(450, () => setPose(scorer, "flip", this.now, 650));
      else if (c === "pile") {
        // todo mundo pula em cima do artilheiro
        this.at(900, () => {
          for (const d of this.team(atk)) if (d !== scorer && d.grp !== 0) {
            d.ox = scorer.x + rnd(-2, 2);
            d.oy = scorer.y + rnd(-1.5, 1.5);
            d.oUntil = this.now + 1100;
            d.speed = 2;
          }
        });
      }
    }
    this.kickTeam = (1 - atk) as 0 | 1;
    this.kickoffPending = true;
    const back = () => {
      if (this.mode !== "celebrate") return;
      this.mode = "kickoff";
      for (const d of this.dudes) {
        d.sad = false;
        d.speed = 1.7;
      }
      this.ball.fl = null;
      this.ball.holder = null;
      this.ball.x = CX;
      this.ball.y = CY;
      this.ball.h = 0;
    };
    if (hold) this.at(1500, back);
    else this.at(Math.max(60, this.ms * 0.35), back);
  }

  penaltyScript(ph: MinutePhase, evs: MatchEvent[], t0: number) {
    const pen = ph.penalty!;
    const atk = pen.side;
    const taker = this.byPid(pen.taker);
    if (!taker) return;
    const goalE = evs.find((e) => e.type === "pen-goal" && e.side === atk);
    const missE = evs.find((e) => e.type === "pen-miss" && e.side === atk);
    const hold = !!goalE && this.goalHold && this.ms >= 300;
    const P = hold ? (this.ms >= 600 ? 1500 : 1000) : this.ms * 0.92;
    const gx = goalX(atk);
    const f = fwd(atk);
    const spotX = gx - f * SPOT;
    this.at(t0, () => {
      this.mode = "penalty";
      this.setPiece = { side: atk, taker };
      this.poss = atk;
      this.fly(spotX, CY, 160 / this.spd(), 2, null);
      taker.ox = spotX - f * 4;
      taker.oy = CY + 1;
      taker.oUntil = this.now + P;
      const k = this.gk((1 - atk) as 0 | 1);
      if (k) {
        k.ox = gx - f;
        k.oy = CY;
        k.oUntil = this.now + P;
      }
    });
    this.at(t0 + P * 0.55, () => {
      taker.ox = spotX - f;
      taker.oy = CY;
    });
    this.at(t0 + P * 0.68, () => {
      this.say(`${this.name(taker)} vai para a cobrança…`, atk, 1);
      const keeper = this.gk((1 - atk) as 0 | 1);
      if (this.rich) {
        setPose(taker, "kick", this.now, 260);
        const saved0 = !!missE && missE.text.startsWith("Defendeu");
        this.maybeCine(taker, keeper, atk, goalE ? "goal" : saved0 ? "save" : "miss", "penalty", 0.8, true);
      }
      const sp = this.spd();
      const dur = 150 / sp;
      const side = Math.random() < 0.5 ? -1 : 1;
      const saved = !!missE && missE.text.startsWith("Defendeu");
      const ty = CY + side * (saved ? rnd(1, 3) : missE ? rnd(POST + 2, POST + 6) : rnd(2, 4));
      if (keeper) {
        keeper.dive = this.now + dur * 0.5 + 450;
        keeper.diveDir = saved ? side : -side;
        keeper.ox = gx - f;
        keeper.oy = saved ? ty : CY - side * 3;
        keeper.oUntil = this.now + dur + 500;
      }
      this.fly(saved ? gx - f * 2 : gx + f * (missE ? 4 : 0), ty, dur, missE && !saved ? 6 : 1, null, () => {
        this.mode = "play";
        this.setPiece = null;
        if (goalE) {
          this.fly(gx + f * 2, ty, dur * 0.3, 0, null, () => this.scored({ side: atk, result: "goal" }, goalE, taker, hold));
          return;
        }
        if (missE) {
          this.cb.beat(missE);
          this.say(missE.text, atk, 1);
        }
        if (saved && keeper) this.setHolder(keeper);
      });
    });
  }

  cornerScript(ph: MinutePhase, t0: number, B: number) {
    const atk = ph.corner!.side;
    const gx = goalX(atk);
    const f = fwd(atk);
    const top = Math.random() < 0.5;
    const cy = top ? PY0 + 1 : PY1 - 1;
    const taker = this.byPid(ph.corner!.taker) ?? this.team(atk).filter((d) => d.grp >= 2).sort((a, b) => Math.abs(a.y - cy) - Math.abs(b.y - cy))[0] ?? null;
    if (!taker) return this.possessionScript(ph, t0, B);
    const C = Math.max(B, this.ms >= 300 ? 600 : B);
    this.at(t0, () => {
      this.mode = "corner";
      this.setPiece = { side: atk, taker };
      this.poss = atk;
      this.fly(gx - f, cy, 160 / this.spd(), 3, null);
      taker.ox = gx - f * 2;
      taker.oy = cy + (top ? -1 : 1);
      taker.oUntil = this.now + C;
      if (!this.sim.events.slice(-3).some((e) => e.type === "info" && e.min === ph.min)) this.say(`Escanteio para o ${this.sim.sides[atk].club.name}`, atk, 1);
    });
    const header = this.team(atk).filter((d) => d !== taker && d.grp !== 0).sort((a, b) => b.bx - a.bx)[Math.floor(Math.random() * 3)];
    this.at(t0 + C * 0.5, () => {
      const tx = gx - f * rnd(6, 14), ty = CY + rnd(-8, 8);
      if (header) {
        header.ox = tx;
        header.oy = ty;
        header.oUntil = this.now + 600;
      }
      this.fly(tx, ty, 260 / this.spd(), 10, null, () => {
        // a defesa afasta
        const clr = this.nearest((1 - atk) as 0 | 1, tx, ty);
        this.mode = "play";
        this.setPiece = null;
        if (clr) {
          const [cx, cyy] = toPx(clr.side as 0 | 1, rnd(32, 48), rnd(15, 85));
          this.fly(cx, cyy, 260 / this.spd(), 7, null);
        }
      });
    });
  }

  /** Cartões, lesões, faltas e substituições aparecem como ícones sobre o jogador. */
  extrasScript(ph: MinutePhase, evs: MatchEvent[], B: number) {
    let t = 0.55 * B;
    for (const e of evs) {
      if (e.type === "yellow" || e.type === "red") {
        const d = this.byPid(e.pid) ?? this.ghosts.find((g) => g.pid === e.pid) ?? this.dudes.find((x) => x.pid === e.pid) ?? null;
        const ev = e;
        this.at(t, () => {
          if (d) {
            this.icons.push({ kind: ev.type === "yellow" ? "Y" : "R", d, x: 0, y: 0, until: this.now + 1700 });
            const ref = this.dudes.find((x) => x.side === 2 && x.k === 0);
            if (ref && this.rich) {
              this.at(500, () => {
                setPose(ref, "card", this.now, 1000);
                ref.poseCard = ev.type === "yellow" ? "Y" : "R";
              });
              setPose(d, "slide", this.now, 380);
              const victim = this.nearest((1 - (ev.side ?? 0)) as 0 | 1, d.x, d.y);
              if (victim) setPose(victim, "fall", this.now + 150, 900);
            }
            if (ref) {
              ref.ox = d.x + (d.x < ref.x ? 4 : -4);
              ref.oy = d.y + 2;
              ref.oUntil = this.now + 900;
            }
          }
          this.say(ev.text, ev.side ?? null, 1);
        });
        t += 0.12 * B;
      } else if (e.type === "injury") {
        const ev = e;
        this.at(t * 0.6, () => {
          const d = this.byPid(ev.pid) ?? this.ghosts.find((g) => g.pid === ev.pid) ?? null;
          if (d) {
            d.down = Math.max(d.down, this.now + 900);
            this.icons.push({ kind: "inj", d, x: 0, y: 0, until: this.now + 1500 });
          }
          this.say(ev.text, ev.side ?? null, 1);
        });
      } else if (e.type === "sub") {
        const ev = e;
        this.at(t, () => this.say(ev.text, ev.side ?? null, 1));
        t += 0.08 * B;
      }
    }
    if (ph.foul != null && !evs.some((e) => e.type === "yellow" || e.type === "red")) {
      const side = ph.foul;
      this.at(0.5 * B, () => {
        const d = this.nearest(side, this.ball.x, this.ball.y);
        if (d) this.icons.push({ kind: "foul", d, x: 0, y: 0, until: this.now + 900 });
        if (d && this.rich) {
          setPose(d, "slide", this.now, 360);
          const victim = this.ball.holder && this.ball.holder.side !== side ? this.ball.holder : this.nearest((1 - side) as 0 | 1, d.x, d.y);
          if (victim) setPose(victim, "fall", this.now + 120, 800);
        }
      });
    }
  }

  kicks = 0;
  halfKick = false;
  kickOff(B: number): number {
    const kt = this.kickTeam;
    this.mode = "kickoff";
    this.ball.fl = null;
    this.ball.holder = null;
    this.ball.x = CX;
    this.ball.y = CY;
    this.ball.h = 0;
    const tk = (this.ms >= 300 ? 0.4 : 0.15) * B;
    this.at(tk, () => {
      const mate = this.team(kt).filter((d) => d.grp === 2).sort((a, b) => Math.abs(a.y - CY) - Math.abs(b.y - CY))[0] ?? this.team(kt).find((d) => d.grp !== 0) ?? null;
      this.mode = "play";
      this.kickoffPending = false;
      this.poss = kt;
      if (mate) this.pass(mate);
      const label = this.kicks === 0 ? "Rola a bola!" : this.halfKick ? "Começa o segundo tempo!" : `Saída de bola do ${this.sim.sides[kt].club.name}`;
      this.kicks++;
      this.halfKick = false;
      this.say(label, kt, 1);
    });
    return tk + 0.1 * B;
  }

  halfTime(e: MatchEvent) {
    this.mode = "kickoff";
    this.halfKick = true;
    this.kickTeam = 1;
    this.kickoffPending = true;
    this.ball.fl = null;
    this.ball.holder = null;
    this.ball.x = CX;
    this.ball.y = CY;
    this.ball.h = 0;
    this.say(`Intervalo · ${e.text.replace("Fim do primeiro tempo: ", "")}`, null, 1);
  }

  fullTime(evs: MatchEvent[]) {
    if (this.ended) return;
    this.ended = true;
    this.endAt = this.now;
    this.acts = [];
    this.ball.fl = null;
    this.ball.holder = null;
    this.mode = "stand";
    const [H, A] = this.sim.sides;
    const pens = this.sim.pens;
    const win: 0 | 1 | null = H.goals > A.goals ? 0 : A.goals > H.goals ? 1 : pens ? (pens[0] > pens[1] ? 0 : 1) : null;
    if (win != null) {
      for (const d of this.team(win)) d.arms = this.now + 2200;
      for (const d of this.team((1 - win) as 0 | 1)) d.sad = true;
    }
    const endE = evs.find((e) => e.type === "info" && e.text.startsWith("Pênaltis")) ?? evs.find((e) => e.type === "end");
    this.say(endE?.text ?? "Fim de jogo!", win, 1);
    this.at(this.reduced ? 0 : 2000, () => {
      this.mode = "tunnel";
    });
  }

  startIntro() {
    this.mode = "kickoff";
    this.kickTeam = 0;
    this.kickoffPending = true;
    for (const d of this.dudes) {
      if (d.hidden) continue;
      d.x = TUNNEL.x + rnd(-2, 2);
      d.y = TUNNEL.y + rnd(-1, 1);
      d.speed = 1.35;
    }
    this.say(`${this.sim.sides[0].club.name} e ${this.sim.sides[1].club.name} entram em campo`);
    if (this.reduced) this.snapToTargets();
  }

  // ------------------------------------------------ física
  update(dt: number) {
    this.now += dt;
    while (this.acts.length && this.acts[0].t <= this.now) this.acts.shift()!.f();
    const sp = this.spd();
    const b = this.ball;
    if (b.fl) {
      const fl = b.fl;
      const s = clamp((this.now - fl.t0) / fl.dur, 0, 1);
      // passe rasteiro desacelera; bola pelo alto vai em linha reta (a altura faz a curva)
      const k = fl.peak > 0 ? s : 1 - (1 - s) * (1 - s);
      b.x = fl.x0 + (fl.x1 - fl.x0) * k;
      b.y = fl.y0 + (fl.y1 - fl.y0) * k;
      b.h = fl.peak * 4 * s * (1 - s);
      if (fl.curve) b.y += Math.sin(Math.PI * s) * fl.curve;
      b.spin += dt;
      if (s >= 1) {
        b.fl = null;
        b.h = 0;
        if (fl.to && !fl.to.hidden && !fl.to.leaving) {
          fl.to.ox = NaN;
          this.setHolder(fl.to);
        }
        fl.done?.();
      }
    } else if (b.holder) {
      if (b.holder.hidden || b.holder.leaving) b.holder = null;
      else {
        const [ox, oy, oh] = this.holdOffset(b.holder);
        const k = this.reduced ? 1 : 1 - Math.exp(-dt / 45);
        b.x += (b.holder.x + ox - b.x) * k;
        b.y += (b.holder.y + oy - b.y) * k;
        b.h += (oh - b.h) * k;
        if (Math.hypot(b.holder.vx, b.holder.vy) > 0.05) b.spin += dt;
      }
    }

    const ease = this.reduced ? 1 : 1 - Math.exp(-dt / (150 / sp));
    const move = (d: Dude) => {
      if (d.hidden) return;
      this.target(d);
      if (this.now < d.down || this.now < d.dive) {
        d.vx = d.vy = 0;
        if (this.now < d.dive) {
          // goleiro voando vai até o ponto da defesa
          d.x += (d.tx - d.x) * Math.min(1, ease * 2.5);
          d.y += (d.ty - d.y) * Math.min(1, ease * 2.5);
        }
        return;
      }
      const dx = d.tx - d.x, dy = d.ty - d.y;
      const dist = Math.hypot(dx, dy);
      let step = 0;
      if (dist > 0.01) {
        const vmax = (34 * sp * d.speed * (d.sad ? 0.55 : 1) * (d.leaving ? 0.8 : 1) * dt) / 1000;
        step = this.reduced ? dist : Math.min(dist, vmax, dist * ease + 0.12);
        d.x += (dx / dist) * step;
        d.y += (dy / dist) * step;
      }
      d.vx = dist > 0.01 ? (dx / dist) * step : 0;
      d.vy = dist > 0.01 ? (dy / dist) * step : 0;
      d.walk += step;
      if (d.leaving && Math.hypot(d.x - TUNNEL.x, d.y - TUNNEL.y) < 2.5) d.hidden = true;
      if (this.mode === "tunnel" && Math.hypot(d.x - TUNNEL.x, d.y - TUNNEL.y) < 3) d.hidden = true;
      if (dist < 0.5 && d.speed !== 1 && this.mode !== "tunnel") d.speed = 1;
    };
    for (const d of this.dudes) move(d);
    for (const g of this.ghosts) move(g);
    if (this.rich) {
      this.pfx.streakOn = !!b.fl?.power;
      this.pfx.update(dt, b);
    }
    this.ghosts = this.ghosts.filter((g) => !g.hidden);
    if (this.icons.length) this.icons = this.icons.filter((i) => i.until > this.now);
  }

  /** Terminou de vez (todos no vestiário): o laço pode parar. */
  idle(): boolean {
    return this.ended && this.now - this.endAt > 9000;
  }

  // ------------------------------------------------ desenho
  draw(g: CanvasRenderingContext2D) {
    const now = this.now;
    g.drawImage(this.stadium.bg, 0, 0);
    const cheering = now < this.cheer.until;
    const crowd = this.stadium.crowd;
    const fi = this.reduced ? -1 : cheering ? (this.cheer.side === 0 ? 3 : 5) + (Math.floor(now / 140) % 2) : Math.floor(now / 260) % 3;
    if (fi >= 0) g.drawImage(crowd[fi], 0, 0);
    this.drawBoards(g, cheering);
    if (!this.reduced && now < this.flashUntil) {
      g.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const r = Math.random();
        if (r < 0.5) g.fillRect(Math.floor(Math.random() * W), 2 + Math.floor(Math.random() * 11), 1, 1);
        else g.fillRect(Math.floor(Math.random() * W), 123 + Math.floor(Math.random() * 8), 1, 1);
      }
    }
    // rede balançando
    if (now < this.netShake.until) {
      const back = this.netShake.side === 0 ? PX1 + 4 : PX0 - 4;
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.fillRect(back, CY - POST + 2, 1, POST * 2 - 3);
    }
    const all = this.dudes.filter((d) => !d.hidden).concat(this.ghosts);
    // sombras
    g.fillStyle = "rgba(0,0,0,0.28)";
    for (const d of all) {
      const lying = now < d.down || now < d.dive;
      g.fillRect(Math.round(d.x) - (lying ? 3 : 1), Math.round(d.y), lying ? 8 : 4, 1);
    }
    all.sort((a, b) => a.y - b.y);
    for (const d of all) {
      if (this.rich && d.side !== 2 || this.rich && d.pose) drawPitchDude(g, d, now, d === this.ball.holder, d.side === 2 ? 1 : (fwd(d.side) as 1 | -1));
      else this.drawDude(g, d);
    }
    if (this.rich) this.pfx.draw(g);
    this.drawBall(g);
    for (const ic of this.icons) this.drawIcon(g, ic);
  }

  drawBoards(g: CanvasRenderingContext2D, cheering: boolean) {
    const pal = ["#1d4ed8", "#dc2626", "#f59e0b", "#059669", "#7c3aed", "#0f766e"];
    const club = this.sim.sides[this.cheer.side].club;
    const flash = cheering ? Math.floor(this.now / 160) % 2 : 0;
    const off = this.reduced ? 0 : Math.floor(this.now / 110) % 16;
    for (const [y, dir] of [[14, 1], [121, -1]] as const) {
      for (let i = -1; i < 14; i++) {
        const x0 = 13 + i * 16 + dir * off - (dir < 0 ? 0 : 16) + 16;
        const idx = ((i % pal.length) + pal.length) % pal.length;
        g.fillStyle = cheering ? (flash ? club.colors[0] : club.colors[1]) : pal[idx];
        const a = Math.max(13, x0), b = Math.min(184, x0 + 16);
        if (b <= a) continue;
        g.fillRect(a, y, b - a, 2);
        g.fillStyle = cheering ? (flash ? club.colors[1] : club.colors[0]) : idx === 2 ? "#1b1b1b" : "#f5f5f5";
        const lx = x0 + 5;
        if (lx >= 13 && lx + 6 <= 184) g.fillRect(lx, y + (y === 14 ? 0 : 1), 6, 1);
      }
    }
    g.fillStyle = "#070b09";
    g.fillRect(94, 14, 8, 2);
  }

  drawDude(g: CanvasRenderingContext2D, d: Dude) {
    const now = this.now;
    const x = Math.round(d.x), y = Math.round(d.y);
    if (now < d.down || now < d.dive) {
      // deitado (lesionado) ou goleiro voando
      const dir = now < d.dive ? d.diveDir : 1;
      const lx = x - 3, ly = y - 3;
      g.fillStyle = OUTLINE;
      g.fillRect(lx - 1, ly - 1, 9, 4);
      g.fillStyle = d.shorts;
      g.fillRect(dir > 0 ? lx + 1 : lx + 4, ly, 2, 2);
      g.fillStyle = d.shirt;
      g.fillRect(lx + 2, ly, 3, 2);
      g.fillStyle = d.skin;
      g.fillRect(dir > 0 ? lx + 6 : lx, ly, 1, 2);
      g.fillStyle = d.socks;
      g.fillRect(dir > 0 ? lx : lx + 6, ly, 1, 2);
      return;
    }
    const moving = Math.abs(d.vx) + Math.abs(d.vy) > 0.04;
    const frame = moving ? Math.floor(d.walk / 2.2) % 2 : 0;
    const up = d.vy < -0.05 && Math.abs(d.vy) > Math.abs(d.vx);
    const arms = now < d.arms;
    // contorno
    g.fillStyle = OUTLINE;
    g.fillRect(x - 2, y - 8, 4, 3);
    g.fillRect(x - 3, y - 6, 6, 6);
    if (arms) {
      g.fillRect(x - 4, y - 9, 2, 4);
      g.fillRect(x + 2, y - 9, 2, 4);
    }
    // cabeça
    g.fillStyle = d.hair;
    g.fillRect(x - 1, y - 7, 2, 1);
    g.fillStyle = up ? d.hair : d.skin;
    g.fillRect(x - 1, y - 6, 2, 1);
    // camisa
    g.fillStyle = d.shirt;
    g.fillRect(x - 2, y - 5, 4, 2);
    if (d.pattern === "stripes") {
      g.fillStyle = d.stripe;
      g.fillRect(x - 1, y - 5, 1, 2);
      g.fillRect(x + 1, y - 5, 1, 2);
    } else if (d.pattern === "hoops") {
      g.fillStyle = d.stripe;
      g.fillRect(x - 2, y - 4, 4, 1);
    }
    if (d.sleeve !== d.shirt) {
      g.fillStyle = d.sleeve;
      g.fillRect(x - 2, y - 5, 1, 1);
      g.fillRect(x + 1, y - 5, 1, 1);
    }
    if (arms) {
      const wave = Math.floor(now / 160) % 2;
      g.fillStyle = d.sleeve;
      g.fillRect(x - 3, y - 7 + wave, 1, 2);
      g.fillRect(x + 2, y - 7 + (1 - wave), 1, 2);
      g.fillStyle = d.skin;
      g.fillRect(x - 3, y - 8 + wave, 1, 1);
      g.fillRect(x + 2, y - 8 + (1 - wave), 1, 1);
    }
    // calção e pernas
    g.fillStyle = d.shorts;
    g.fillRect(x - 2, y - 3, 4, 1);
    const l1 = frame ? x - 1 : x - 2, l2 = frame ? x : x + 1;
    g.fillStyle = d.skin;
    g.fillRect(l1, y - 2, 1, 1);
    g.fillRect(l2, y - 2, 1, 1);
    g.fillStyle = d.socks;
    g.fillRect(l1, y - 1, 1, 1);
    g.fillRect(l2, y - 1, 1, 1);
  }

  drawBall(g: CanvasRenderingContext2D) {
    const b = this.ball;
    const x = Math.round(b.x) - 1, y = Math.round(b.y) - 1, by = y - Math.round(b.h);
    g.fillStyle = "rgba(0,0,0,0.4)";
    g.fillRect(x, y + 2, 2, 1);
    g.fillStyle = OUTLINE;
    g.fillRect(x - 1, by, 4, 2);
    g.fillRect(x, by - 1, 2, 4);
    g.fillStyle = "#ffffff";
    g.fillRect(x, by, 2, 2);
    g.fillStyle = "#7d8a84";
    const sp = Math.floor(b.spin / 90) % 2;
    g.fillRect(x + sp, by + 1 - sp, 1, 1);
    // marcador de quem está com a bola
    const d = b.holder;
    if (d && d.side !== 2 && this.mode === "play" && d.grp !== 0) {
      const mx = Math.round(d.x), my = Math.round(d.y) - 11;
      g.fillStyle = OUTLINE;
      g.fillRect(mx - 2, my - 1, 5, 3);
      g.fillStyle = "#ffe14d";
      g.fillRect(mx - 1, my, 3, 1);
      g.fillRect(mx, my + 1, 1, 1);
    }
  }

  drawIcon(g: CanvasRenderingContext2D, ic: Icon) {
    const x = Math.round(ic.d ? ic.d.x : ic.x);
    const y = Math.round(ic.d ? ic.d.y - 13 : ic.y);
    switch (ic.kind) {
      case "Y":
      case "R":
        g.fillStyle = OUTLINE;
        g.fillRect(x - 2, y - 2, 4, 5);
        g.fillStyle = ic.kind === "Y" ? "#ffd83a" : "#ef3b36";
        g.fillRect(x - 1, y - 1, 2, 3);
        break;
      case "sub":
        g.fillStyle = OUTLINE;
        g.fillRect(x - 4, y - 2, 9, 5);
        g.fillStyle = "#3be07a";
        g.fillRect(x - 2, y - 1, 1, 3);
        g.fillRect(x - 3, y, 3, 1);
        g.fillStyle = "#ff5a52";
        g.fillRect(x + 2, y - 1, 1, 3);
        g.fillRect(x + 1, y, 3, 1);
        g.fillStyle = "#3be07a";
        g.fillRect(x - 2, y - 1, 1, 1);
        g.fillStyle = "#ff5a52";
        g.fillRect(x + 2, y + 1, 1, 1);
        break;
      case "inj":
        g.fillStyle = OUTLINE;
        g.fillRect(x - 3, y - 3, 7, 7);
        g.fillStyle = "#ffffff";
        g.fillRect(x - 2, y - 2, 5, 5);
        g.fillStyle = "#e5322d";
        g.fillRect(x, y - 1, 1, 3);
        g.fillRect(x - 1, y, 3, 1);
        break;
      case "foul":
        g.fillStyle = OUTLINE;
        g.fillRect(x - 1, y - 3, 3, 7);
        g.fillStyle = "#ffe14d";
        g.fillRect(x, y - 2, 1, 3);
        g.fillRect(x, y + 2, 1, 1);
        break;
      case "var": {
        g.fillStyle = OUTLINE;
        g.fillRect(x - 9, y - 4, 19, 9);
        g.fillStyle = "#2b6cff";
        g.fillRect(x - 8, y - 3, 17, 7);
        g.fillStyle = "#ffffff";
        // "VAR" em fonte 3x5
        const font: Record<string, string[]> = { V: ["101", "101", "101", "101", "010"], A: ["010", "101", "111", "101", "101"], R: ["110", "101", "110", "101", "101"] };
        "VAR".split("").forEach((ch, i) => {
          font[ch].forEach((row, ry) => row.split("").forEach((c, rx) => c === "1" && g.fillRect(x - 6 + i * 5 + rx, y - 2 + ry, 1, 1)));
        });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- componente

// ---------------------------------------------------------------- gráficos Ultra
// Camada extra desenhada por cima do campo em pixel art, na resolução real da tela (devicePixelRatio):
// sombra e rastro da bola, torcida animada com bandeiras nas cores de cada clube, sinalizadores e
// fogos nos gols, refletores em jogos à noite, chuva e câmera que acompanha a bola.
// Só usa Math.random e um gerador próprio por partida: nunca mexe no gerador do mundo.
export type GraphicsMode = "ultra" | "leve";
const GFX_KEY = "ldb.graphics";

/** Aparelho aguenta o modo Ultra? (tela densa, vários núcleos e sem pedido de menos movimento) */
export function capableDevice(): boolean {
  try {
    const cores = navigator.hardwareConcurrency ?? 4;
    return (window.devicePixelRatio || 1) >= 2 && cores >= 6 && !prefersReducedMotion();
  } catch {
    return false;
  }
}

export function readGraphics(): GraphicsMode {
  try {
    const v = localStorage.getItem(GFX_KEY);
    if (v === "ultra" || v === "leve") return v;
  } catch {
    /* sem armazenamento local */
  }
  return capableDevice() ? "ultra" : "leve";
}

export function saveGraphics(m: GraphicsMode) {
  try {
    localStorage.setItem(GFX_KEY, m);
  } catch {
    /* vale só nesta sessão */
  }
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; glow?: boolean }

class UltraFX {
  anim: PitchAnim;
  night: boolean;
  rain: boolean;
  trail: { x: number; y: number; h: number }[] = [];
  parts: Particle[] = [];
  drops: { x: number; y: number; s: number }[] = [];
  lastCelebr: unknown = null;
  cam = { x: CX, y: CY, z: 1 };
  t = 0;
  colors: [string[], string[]];

  constructor(anim: PitchAnim) {
    this.anim = anim;
    // clima e horário fixos por partida (gerador próprio)
    const r = makeRng(anim.sim.f.id * 7919 + 13);
    this.night = r() < 0.45;
    this.rain = r() < 0.18;
    const hc = anim.sim.sides[0].club.colors, ac = anim.sim.sides[1].club.colors;
    this.colors = [[hc[0], hc[1], "#ffffff"], [ac[0], ac[1], "#ffffff"]];
    for (let i = 0; i < 140; i++) this.drops.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 });
  }

  /** Avança partículas, rastro e câmera. dt em ms. */
  update(dt: number) {
    this.t += dt;
    const a = this.anim;
    const b = a.ball;
    this.trail.push({ x: b.x, y: b.y, h: b.h });
    if (this.trail.length > 10) this.trail.shift();
    if (a.celebr && a.celebr !== this.lastCelebr) {
      this.lastCelebr = a.celebr;
      this.goalBurst(a.celebr.side);
    }
    if (!a.celebr) this.lastCelebr = null;
    const k = dt / 16.7;
    for (const p of this.parts) {
      p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.02 * k; p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    if (this.rain) for (const d of this.drops) {
      d.y += 3.2 * d.s * k; d.x -= 0.8 * d.s * k;
      if (d.y > H) { d.y = -4; d.x = Math.random() * (W + 30); }
    }
    // câmera: segue a bola; perto do gol (lance de perigo) aproxima suavemente
    const danger = b.x < PX0 + BOX_D + 12 || b.x > PX1 - BOX_D - 12;
    const tz = a.celebr ? 1.18 : danger && a.mode === "play" ? 1.32 : 1.12;
    const e = Math.min(1, 0.0035 * dt);
    this.cam.z += (tz - this.cam.z) * e;
    this.cam.x += (b.x - this.cam.x) * Math.min(1, e * 1.6);
    this.cam.y += (b.y - this.cam.y) * Math.min(1, e * 1.6);
  }

  /** Gol: sinalizadores na torcida de quem marcou e fogos de artifício. */
  goalBurst(side: 0 | 1) {
    const cols = this.colors[side];
    for (let i = 0; i < 70; i++) {
      const top = Math.random() < 0.5;
      this.parts.push({
        x: Math.random() * W, y: top ? rnd(2, PY0 - 6) : rnd(PY1 + 4, H - 2),
        vx: rnd(-0.15, 0.15), vy: rnd(-0.35, -0.08), life: rnd(1400, 2600), max: 2600,
        color: cols[i % 2], size: rnd(1.5, 3.5), glow: i % 5 === 0,
      });
    }
    for (let f = 0; f < 4; f++) {
      const cx = rnd(20, W - 20), cy = rnd(10, H / 2);
      for (let i = 0; i < 26; i++) {
        const ang = (i / 26) * Math.PI * 2, sp = rnd(0.6, 1.3);
        this.parts.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rnd(700, 1200), max: 1200, color: i % 3 ? cols[f % 3] : "#fff6b0", size: 1.2, glow: true });
      }
    }
  }

  /** Câmera como transform CSS no palco (o canvas em pixel art continua nítido). */
  cameraCss(): string {
    const z = this.cam.z;
    const ox = clamp((CX - this.cam.x) / W, -0.5, 0.5) * 100 * (z - 1);
    const oy = clamp((CY - this.cam.y) / H, -0.5, 0.5) * 100 * (z - 1);
    return `translate(${ox.toFixed(2)}%, ${oy.toFixed(2)}%) scale(${z.toFixed(3)})`;
  }

  draw(g: CanvasRenderingContext2D, cw: number, ch: number) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.setTransform(cw / W, 0, 0, ch / H, 0, 0);
    const t = this.t / 1000;
    // torcida animada: bandeiras nas cores dos dois clubes (pulam mais no gol)
    const party = this.anim.celebr ? 2.2 : 1;
    for (let i = 0; i < 46; i++) {
      const top = i % 2 === 0;
      const side = i % 4 < 2 ? 0 : 1;
      const x = ((i * 37) % (W - 8)) + 4;
      const y0 = top ? 6 + (i % 3) * 3 : PY1 + 6 + (i % 3) * 3;
      const wave = Math.sin(t * 5 * party + i) * 1.6 * party;
      g.fillStyle = this.colors[side][i % 2];
      g.globalAlpha = 0.85;
      g.fillRect(x, y0 + wave - 3, 0.4, 4);
      const flutter = Math.sin(t * 9 + i * 1.7) * 0.8;
      g.beginPath();
      g.moveTo(x + 0.4, y0 + wave - 3);
      g.lineTo(x + 4 + flutter, y0 + wave - 2.2);
      g.lineTo(x + 0.4, y0 + wave - 1);
      g.fill();
    }
    g.globalAlpha = 1;
    // sombra e rastro da bola
    const b = this.anim.ball;
    if (b.h > 0.2) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.beginPath();
      g.ellipse(b.x + b.h * 0.25, b.y + 0.6 + b.h * 0.15, 1.4 + b.h * 0.05, 0.7, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 1; i < this.trail.length; i++) {
      const p0 = this.trail[i - 1], p1 = this.trail[i];
      const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (d < 0.25 || d > 20) continue;
      g.strokeStyle = `rgba(255,255,255,${((i / this.trail.length) * 0.45).toFixed(3)})`;
      g.lineWidth = 0.4 + (i / this.trail.length) * 0.8;
      g.beginPath();
      g.moveTo(p0.x, p0.y - p0.h);
      g.lineTo(p1.x, p1.y - p1.h);
      g.stroke();
    }
    // partículas (sinalizadores, fogos)
    for (const p of this.parts) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      if (p.glow) {
        const r = p.size * 3;
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, p.color);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    // noite: bordas escuras e brilho dos quatro refletores
    if (this.night) {
      const v = g.createRadialGradient(CX, CY, 30, CX, CY, W * 0.7);
      v.addColorStop(0, "rgba(0,0,20,0)");
      v.addColorStop(1, "rgba(0,0,25,0.45)");
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      for (const [lx, ly] of [[4, 4], [W - 4, 4], [4, H - 4], [W - 4, H - 4]]) {
        const fl = g.createRadialGradient(lx, ly, 0, lx, ly, 60);
        fl.addColorStop(0, "rgba(255,250,215,0.35)");
        fl.addColorStop(0.15, "rgba(255,250,215,0.12)");
        fl.addColorStop(1, "rgba(255,250,215,0)");
        g.fillStyle = fl;
        g.fillRect(lx - 60, ly - 60, 120, 120);
      }
      g.globalCompositeOperation = "source-over";
    }
    // chuva
    if (this.rain) {
      g.strokeStyle = "rgba(200,220,255,0.35)";
      g.lineWidth = 0.35;
      g.beginPath();
      for (const d of this.drops) { g.moveTo(d.x, d.y); g.lineTo(d.x - 1.2 * d.s, d.y + 3.5 * d.s); }
      g.stroke();
      g.fillStyle = "rgba(40,60,90,0.12)";
      g.fillRect(0, 0, W, H);
    }
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export interface MatchViewProps {
  sim: MatchSim;
  /** muda a cada minuto simulado */
  tick: number;
  /** intervalo do relógio da partida (ms por minuto de jogo) */
  msPerMin: number;
  paused: boolean;
  /** apresentação antes do apito inicial (foto do estádio + escudos) */
  intro: boolean;
  /** o relógio segura no gol (1x/2x): o lance do gol pode ser mostrado com calma */
  goalHold: boolean;
  /** a bola entrou: hora de comemorar */
  onGoal?: (e: MatchEvent) => void;
  /** desfecho de um lance perigoso (defesa, trave, para fora) — para o "uhhh" da torcida */
  onBeat?: (e: MatchEvent) => void;
  onSkipIntro?: () => void;
  /** gráficos Ultra (camada em alta resolução, câmera, efeitos) ou Leve (só o pixel art) */
  ultra?: boolean;
  /** cena de lance decisivo na tela (true) ou acabou (false): o relógio deve segurar */
  onCinema?: (on: boolean) => void;
}

/** Campo em pixel art com os jogadores se movendo e a legenda do lance. */
export function MatchView(props: MatchViewProps) {
  const { sim, tick, intro } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLElement>(null);
  const animRef = useRef<PitchAnim | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const kick = useRef<() => void>(() => undefined);
  const stageRef = useRef<HTMLDivElement>(null);

  // cria a animação, o laço de desenho e o ajuste de tamanho
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) return;
    g.imageSmoothingEnabled = false;
    const anim = new PitchAnim(sim, {
      caption: (text, color) => {
        if (capRef.current) capRef.current.textContent = text;
        if (dotRef.current) dotRef.current.style.background = color;
      },
      goal: (e) => propsRef.current.onGoal?.(e),
      beat: (e) => propsRef.current.onBeat?.(e),
      cine: (spec) => {
        const host = stageRef.current;
        if (!host || document.hidden) return;
        cine?.destroy();
        anim.frozen = true;
        propsRef.current.onCinema?.(true);
        const resume = () => {
          anim.frozen = false;
          propsRef.current.onCinema?.(false);
          kick.current();
        };
        cine = playCinematic(host, spec, {
          onEnd: resume,
          onReplay: () => propsRef.current.onCinema?.(true),
          onReplayEnd: () => propsRef.current.onCinema?.(false),
        });
      },
    });
    let cine: CineHandle | null = null;
    anim.rich = !!propsRef.current.ultra;
    anim.reduced = prefersReducedMotion();
    anim.ms = propsRef.current.msPerMin;
    anim.goalHold = propsRef.current.goalHold;
    animRef.current = anim;
    if (propsRef.current.intro) anim.startIntro();
    else if (sim.minute === 0 && sim.half === 1) anim.say("A bola vai rolar…");
    else if (sim.finished) anim.say("Fim de jogo!");
    else if (sim.phase.atk != null) anim.say(`Bola com o ${sim.sides[sim.phase.atk].club.name}`, sim.phase.atk);

    const fx = propsRef.current.ultra ? new UltraFX(anim) : null;
    const fxCanvas = fxRef.current;
    const fg = fx && fxCanvas ? fxCanvas.getContext("2d") : null;
    if (camRef.current && !fx) camRef.current.style.transform = "";
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = 0;
      if (!last) last = t;
      const dt = t - last;
      // Leve: ~30 quadros por segundo. Ultra: sem limite (acompanha a tela, até 120 Hz)
      if (dt >= (fx ? 1 : 31)) {
        last = t;
        if (!anim.frozen) anim.update(Math.min(dt, 100));
        anim.draw(g);
        if (fx && fg && fxCanvas) {
          fx.update(Math.min(dt, 100));
          fx.draw(fg, fxCanvas.width, fxCanvas.height);
          if (camRef.current) camRef.current.style.transform = fx.cameraCss();
        }
      }
      if (!propsRef.current.paused && !document.hidden && !anim.idle()) raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || propsRef.current.paused || document.hidden || anim.idle()) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    kick.current = () => {
      anim.draw(g);
      start();
    };
    anim.draw(g);
    start();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const avail = wrap.clientWidth;
      const maxH = Math.max(170, window.innerHeight * 0.36);
      let k = Math.max(1, Math.floor((avail * dpr) / W));
      while (k > 1 && (H * k) / dpr > maxH) k--;
      canvas.style.width = `${(W * k) / dpr}px`;
      canvas.style.height = `${(H * k) / dpr}px`;
      if (fxCanvas) {
        // camada Ultra na resolução real da tela (devicePixelRatio inteiro)
        fxCanvas.width = W * k;
        fxCanvas.height = H * k;
        fxCanvas.style.width = canvas.style.width;
        fxCanvas.style.height = canvas.style.height;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener("resize", resize);
    const vis = () => start();
    document.addEventListener("visibilitychange", vis);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", vis);
      kick.current = () => undefined;
      animRef.current = null;
      if (cine) {
        cine.destroy();
        if (anim.frozen) propsRef.current.onCinema?.(false);
      }
    };
  }, [sim, props.ultra]);

  // velocidade e segura-no-gol vêm sempre da última renderização
  useEffect(() => {
    const a = animRef.current;
    if (!a) return;
    a.ms = props.msPerMin;
    a.goalHold = props.goalHold;
  });

  // novo minuto: monta o roteiro do lance
  useEffect(() => {
    animRef.current?.onTick();
    kick.current();
  }, [tick]);

  // pausa / volta
  useEffect(() => {
    kick.current();
  }, [props.paused]);

  const home = sim.sides[0].club;
  const away = sim.sides[1].club;
  const photo = !!home.stadiumImg && !sim.f.neutral;
  return (
    <div className="mv" ref={wrapRef}>
      <div className={`mv-stage${props.ultra ? " mv-ultra" : ""}${intro ? " sa-fly" : ""}`} ref={stageRef}>
        <div className="mv-cam" ref={camRef}>
          <canvas ref={canvasRef} className="mv-canvas" width={W} height={H} aria-label={`Campo: ${home.name} x ${away.name}`} role="img" />
          {props.ultra && <canvas ref={fxRef} className="mv-fx" aria-hidden="true" />}
        </div>
        {intro && <StadiumBanner club={home} away={away} neutral={!!sim.f.neutral} stage={sim.f.stage} /> /* [stadium-art] */}
        {intro && (
          <div className="mv-intro" onClick={props.onSkipIntro}>
            <div className="mv-intro-fallback">
              <b>🏟️ {sim.f.neutral ? "Campo neutro" : home.stadium}</b>
              {!sim.f.neutral && home.capacity > 0 && <span>{home.capacity.toLocaleString("pt-BR")} lugares · {home.city}</span>}
            </div>
            {photo && <div className="mv-intro-photo"><StadiumPhoto club={home} /></div>}
            <div className="mv-intro-crests">
              <Crest club={home} size={44} />
              <b>×</b>
              <Crest club={away} size={44} />
            </div>
          </div>
        )}
      </div>
      <div className="mv-cap" aria-live="polite">
        <i ref={dotRef} />
        <span ref={capRef}>A bola vai rolar…</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- comemoração do gol
const CONFETTI = 34;

/** Foto do autor do gol, escudo, "GOOOL!" pulando e confete em pixel com as cores do clube. */
export function GoalCelebration({ e, sim, top }: { e: MatchEvent; sim: MatchSim; top?: number | null }) {
  const side = e.side ?? 0;
  const club = sim.sides[side].club;
  const p = e.pid != null ? sim.w.players[e.pid] : undefined;
  const own = e.type === "owngoal";
  const pClub = own ? sim.sides[1 - side].club : club;
  const pieces = useMemo(() => {
    const cols = [club.colors[0], club.colors[1], club.colors[2], "#f5c542", club.colors[0]];
    return Array.from({ length: CONFETTI }, (_, i) => ({
      left: `${(i / CONFETTI) * 100 + Math.random() * 3}%`,
      size: 5 + Math.floor(Math.random() * 3) * 2,
      bg: cols[i % cols.length],
      delay: `${Math.random() * 0.45}s`,
      dur: `${1.3 + Math.random() * 0.8}s`,
      dx: `${Math.round((Math.random() - 0.5) * 80)}px`,
    }));
  }, [e]);
  const [H, A] = sim.sides;
  return (
    <>
      <div className="mv-confetti" aria-hidden="true">
        {pieces.map((c, i) => (
          <i key={i} style={{ left: c.left, width: c.size, height: c.size, background: c.bg, animationDelay: c.delay, animationDuration: c.dur, "--dx": c.dx } as CSSProperties} />
        ))}
      </div>
      <div className="mv-goal" style={top != null ? { top } : undefined} role="status">
        <div className="mv-goal-card" style={{ "--club": club.colors[0] } as CSSProperties}>
          <div className="mv-goal-pics">
            {p ? <Avatar p={p} club={pClub} season={sim.w.season} size={72} /> : <Crest club={club} size={64} />}
            {p && <span className="mv-goal-crest"><Crest club={club} size={30} /></span>}
          </div>
          <div className="mv-goal-txt">GOOOL!</div>
          <div className="mv-goal-name">
            {p ? sim.name(p.id) : club.name}
            {own ? " (contra)" : e.type === "pen-goal" ? " (pênalti)" : ""}
            {" · "}{e.min}'
          </div>
          <div className="mv-goal-score">{H.club.abbr} {H.goals} × {A.goals} {A.club.abbr}</div>
        </div>
      </div>
    </>
  );
}


// ---------------------------------------------------------------- cartão pós-jogo
/** Cartão do fim de jogo: placar, xG, craque do jogo e as notas dos dois times. */
export function PostMatchCard({ w, f, r, label }: { w: World; f: Fixture; r: MatchResult; label: string }) {
  const H = w.clubs[f.home], A = w.clubs[f.away];
  const xg = r.stats.xg;
  const xgTot = xg[0] + xg[1] || 1;
  const motm = r.motm != null ? w.players[r.motm] : null;
  const goals = r.events.filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal");
  const rows = (side: 0 | 1) =>
    r.lineups[side].filter((id) => w.players[id] && r.ratings[id] != null).sort((a, b) => r.ratings[b] - r.ratings[a]);
  return (
    <div className="pm-card" style={{ "--h": H.colors[0], "--a": A.colors[0] } as CSSProperties} role="region" aria-label="Resumo da partida">
      <div className="center small" style={{ fontWeight: 700 }}>{label}</div>
      <div className="pm-score mt8">
        <Crest club={H} size={40} />
        <div className="center">
          <div className="big">{r.hg} × {r.ag}</div>
          {r.pens && <div className="tiny">pên. {r.pens[0]} × {r.pens[1]}</div>}
        </div>
        <Crest club={A} size={40} />
      </div>
      <div className="row tiny mt8"><span>xG {xg[0].toFixed(2)}</span><span className="grow center muted">gols esperados</span><span>{xg[1].toFixed(2)}</span></div>
      <div className="pm-xg">
        <i style={{ width: `${(xg[0] / xgTot) * 100}%`, background: H.colors[0] }} />
        <i style={{ width: `${(xg[1] / xgTot) * 100}%`, background: A.colors[0] === H.colors[0] ? "#9aa5a0" : A.colors[0] }} />
      </div>
      <div className="row tiny muted"><span>Chutes {r.stats.shots[0]} ({r.stats.onTarget[0]} no gol)</span><span className="grow" /><span>{r.stats.shots[1]} ({r.stats.onTarget[1]} no gol)</span></div>
      {goals.length > 0 && (
        <div className="small mt8 col gap4">
          {goals.map((e, i) => (
            <span key={i}>⚽ {e.min}' {e.pid ? w.players[e.pid]?.name : ""}{e.type === "pen-goal" ? " (pên.)" : e.type === "owngoal" ? " (contra)" : ""} — {(e.side === 0 ? H : A).abbr}</span>
          ))}
        </div>
      )}
      {motm && (
        <div className="pm-motm">
          <Avatar p={motm} club={motm.clubId ? w.clubs[motm.clubId] : null} season={w.season} size={44} />
          <div className="grow">
            <div className="tiny muted">⭐ Craque do jogo</div>
            <b>{motm.name}</b>
          </div>
          <b style={{ fontSize: 22 }}>{r.ratings[motm.id]?.toFixed(1)}</b>
        </div>
      )}
      <div className="pm-cols">
        {([0, 1] as const).map((side) => (
          <div key={side} style={{ minWidth: 0 }}>
            <b className="tiny">{(side === 0 ? H : A).abbr}</b>
            {rows(side).map((id) => {
              const v = r.ratings[id];
              return (
                <div key={id} className="pm-r">
                  <span className="ellipsis">{w.players[id].name.split(" ").slice(-1)[0]}</span>
                  <b className={v >= 7.5 ? "hi" : v < 6 ? "lo" : ""}>{v.toFixed(1)}</b>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
