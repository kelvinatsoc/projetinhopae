// Personalidade dos jogadores no campinho (modo Ultra): porte pela altura, cabelo e pele pelo rosto,
// estilo de jogo visível (driblador faz pedalada, centroavante sobe mais, velocista dispara,
// goleiro voa) e poses extras (chute, cabeçada, carrinho, queda, comemorações).
// Tudo determinístico a partir do jogador (nada de Math.random aqui, exceto onde o chamador passa a
// semente) e nunca mexe no gerador do mundo.
import type { Player, Race } from "../engine/types";
import { makeRng } from "../engine/rng";

// ---------------------------------------------------------------- aparência
export type PlayStyle = "dribbler" | "target" | "speedster" | "keeper" | "engine" | "normal";
export type HairStyle = "short" | "buzz" | "afro" | "long" | "bald" | "mohawk";
export type Celebration = "arms" | "knee" | "flip" | "pile" | "run";

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** -1 baixo, 0 médio, 1 alto */
  tall: -1 | 0 | 1;
  /** físico forte: tronco mais largo */
  broad: boolean;
  style: PlayStyle;
  num: number;
  beard: boolean;
}

const SKIN: Record<Race, string[]> = {
  white: ["#f4cfa6", "#e8b98d", "#f0c49a"],
  brown: ["#c98d5b", "#b57a4a", "#d29c6c"],
  black: ["#7c4c2b", "#61391f", "#8a5634"],
  asian: ["#efc99a", "#e3b585", "#f2d0a4"],
};
const HAIR = ["#1d140c", "#2e1f12", "#4a3020", "#101010", "#2a2a2a"];

/** Hash inteiro simples (para escolhas determinísticas por jogador/lance). */
export function hash(...ns: number[]): number {
  let h = 2166136261;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function heightBucket(cm: number | undefined): -1 | 0 | 1 {
  if (!cm) return 0;
  return cm < 175 ? -1 : cm >= 188 ? 1 : 0;
}

/** Estilo de jogo que aparece na animação (derivado dos atributos e jogadas preferidas). */
export function playStyle(p: Player | undefined): PlayStyle {
  if (!p) return "normal";
  if (p.pos === "GOL") return "keeper";
  const a = p.attrs;
  const t = p.traits ?? [];
  const att = p.pos === "ATA" || p.pos === "PD" || p.pos === "PE" || p.pos === "MEI";
  if (t.includes("DRI") || (a.dri >= 78 && a.dri >= a.vel - 2 && att)) return "dribbler";
  if (t.includes("CAB") || (p.pos === "ATA" && (p.height ?? 0) >= 187 && a.fis >= 70)) return "target";
  if (t.includes("VEL") || (a.vel >= 82 && att)) return "speedster";
  if (a.fis >= 80 && (p.pos === "VOL" || p.pos === "MC")) return "engine";
  return "normal";
}

/** Visual do jogador no campinho e nas cenas de lance decisivo. */
export function lookOf(p: Player | undefined): Look {
  if (!p) return { skin: "#d9a777", hair: "#222", hairStyle: "short", tall: 0, broad: false, style: "normal", num: 0, beard: false };
  // as duas primeiras sorteadas na mesma ordem do visual antigo (mesma pele/cabelo de antes)
  const r = makeRng(p.face.s ^ 0x5bd1e995);
  const tones = SKIN[p.face.r] ?? SKIN.brown;
  const skin = tones[Math.floor(r() * tones.length)];
  let hair = HAIR[Math.floor(r() * HAIR.length)];
  if (p.face.r === "white" && r() < 0.18) hair = "#c9a24e";
  const styles: HairStyle[] = p.face.r === "black" ? ["afro", "buzz", "short", "bald", "mohawk"] : ["short", "short", "long", "buzz", "mohawk", "bald"];
  const hairStyle = styles[hash(p.face.s, 7) % styles.length];
  return {
    skin, hair, hairStyle,
    tall: heightBucket(p.height),
    broad: p.attrs.fis >= 78,
    style: playStyle(p),
    num: p.shirt ?? ((hash(p.id) % 30) + 1),
    beard: hash(p.face.s, 11) % 4 === 0,
  };
}

// ---------------------------------------------------------------- escolhas por lance
export type ShotStyle = "power" | "curl" | "chip" | "volley" | "bicycle" | "header" | "placed" | "freekick" | "penalty";

/**
 * Como o chute vai parecer (puramente visual, não muda o resultado). Determinístico por jogador e
 * minuto: o mesmo lance sempre é desenhado do mesmo jeito (inclusive no replay).
 */
export function shotStyle(p: Player | undefined, kind: "header" | "freekick" | "long" | undefined, min: number, result?: string): ShotStyle {
  if (kind === "header") return "header";
  if (kind === "freekick") return "freekick";
  const h = hash(p?.id ?? 0, min, 31) % 100;
  if (kind === "long") return h < 55 ? "power" : "curl";
  const a = p?.attrs;
  const style = playStyle(p);
  // golaços acrobáticos: raros, mais comuns em gols de quem tem técnica
  if (result === "goal" && a && a.dri >= 70 && h < 7) return "bicycle";
  if (h < 16) return "volley";
  if (style === "dribbler" && h < 40) return h < 30 ? "curl" : "chip";
  if (a && a.fin >= 80 && h < 45) return "placed";
  return h < 70 ? "power" : h < 88 ? "placed" : "curl";
}

export function celebrationFor(p: Player | undefined, seed: number): Celebration {
  const h = hash(p?.id ?? 0, seed | 0, 5) % 100;
  if (p && playStyle(p) === "dribbler" && h < 35) return "flip";
  if (h < 30) return "knee";
  if (h < 55) return "pile";
  if (h < 70) return "run";
  if (h < 82 && p && p.attrs.dri >= 65) return "flip";
  return "arms";
}

// ---------------------------------------------------------------- sprite do campinho
export type Pose = "kick" | "header" | "slide" | "fall" | "knee" | "flip" | "stepover" | "card" | "volley" | "bicycle" | "pass" | "save" | "special";

/** O que o desenho precisa de um jogador (o Dude do MatchView tem tudo isso). */
export interface SpriteDude {
  side: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  walk: number;
  speed: number;
  down: number;
  dive: number;
  diveDir: number;
  arms: number;
  shirt: string;
  sleeve: string;
  shorts: string;
  socks: string;
  pattern: "solid" | "stripes" | "hoops" | "sash" | "halves";
  stripe: string;
  skin: string;
  hair: string;
  look?: Look;
  pose?: Pose;
  poseT0?: number;
  poseUntil?: number;
  poseCard?: "Y" | "R";
}

const OUTLINE = "#0d1a12";

export function setPose(d: SpriteDude, pose: Pose, now: number, dur: number) {
  d.pose = pose;
  d.poseT0 = now;
  d.poseUntil = now + dur;
}

function poseOf(d: SpriteDude, now: number): Pose | null {
  return d.pose && now < (d.poseUntil ?? 0) ? d.pose : null;
}

/** Desenha o jogador do campinho com porte, estilo e poses. holder = está com a bola. */
export function drawPitchDude(g: CanvasRenderingContext2D, d: SpriteDude, now: number, holder: boolean, facing: 1 | -1) {
  const x = Math.round(d.x), y = Math.round(d.y);
  const L = d.look;
  const tall = L?.tall ?? 0;
  const pose = poseOf(d, now);
  const s = pose ? clamp01((now - (d.poseT0 ?? now)) / Math.max(1, (d.poseUntil ?? now) - (d.poseT0 ?? now))) : 0;
  const R = (px: number, py: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(px, py, w, h);
  };
  // deitado: lesão, queda após falta, voo do goleiro, carrinho
  const lyingPose = pose === "fall" || pose === "slide" || pose === "knee";
  if (now < d.down || now < d.dive || lyingPose) {
    const dir = now < d.dive ? d.diveDir : pose === "slide" || pose === "knee" ? facing : 1;
    const lift = now < d.dive ? Math.round(Math.sin(Math.PI * clamp01(1 - (d.dive - now) / 450)) * 3) : pose === "fall" ? Math.round(Math.max(0, Math.sin(Math.PI * s * 1.6)) * 2) : 0;
    const lx = x - 3, ly = y - 3 - lift;
    if (pose === "knee") {
      // deslizando de joelhos, braços abertos
      R(x - 3, y - 7, 6, 7, OUTLINE);
      R(x - 1, y - 6, 2, 1, d.skin);
      R(x - 2, y - 5, 4, 2, d.shirt);
      R(x - 4, y - 8, 1, 3, d.skin);
      R(x + 3, y - 8, 1, 3, d.skin);
      R(x - 2, y - 3, 4, 1, d.shorts);
      R(x - 2 - dir, y - 2, 5, 1, d.socks);
      return;
    }
    R(lx - 1, ly - 1, 9, 4, OUTLINE);
    if (now < d.dive) {
      // goleiro esticado: braços à frente
      R(dir > 0 ? lx + 7 : lx - 2, ly, 2, 1, d.skin);
    }
    R(dir > 0 ? lx + 1 : lx + 4, ly, 2, 2, d.shorts);
    R(lx + 2, ly, 3, 2, d.shirt);
    R(dir > 0 ? lx + 6 : lx, ly, 1, 2, d.skin);
    R(dir > 0 ? lx : lx + 6, ly, 1, 2, d.socks);
    if (pose === "slide") R(dir > 0 ? lx - 2 : lx + 7, ly + 1, 2, 1, d.socks);
    return;
  }
  // pulo: cabeçada (centroavante sobe mais), voleio, bicicleta, mortal
  let jump = 0;
  if (pose === "header") jump = Math.round(Math.sin(Math.PI * s) * (L?.style === "target" || tall > 0 ? 5 : 3));
  if (pose === "bicycle" || pose === "flip") jump = Math.round(Math.sin(Math.PI * s) * 5);
  if (pose === "volley") jump = Math.round(Math.sin(Math.PI * s) * 1);
  if (jump) R(x - 1, y, 3, 1, "rgba(0,0,0,0.25)");
  const by = y - jump;
  // bicicleta / mortal: de cabeça para baixo no meio do pulo
  if ((pose === "bicycle" || pose === "flip") && s > 0.25 && s < 0.75) {
    R(x - 2, by - 8, 4, 8, OUTLINE);
    R(x - 1, by - 7, 2, 1, d.socks);
    R(x - 1, by - 6, 2, 1, d.skin);
    R(x - 2, by - 5, 4, 1, d.shorts);
    R(x - 2, by - 4, 4, 2, d.shirt);
    R(x - 1, by - 2, 2, 1, d.skin);
    R(x - 1, by - 1, 2, 1, d.hair);
    if (pose === "bicycle") R(x + facing * 2, by - 9, 1, 2, d.socks);
    return;
  }
  const speed = Math.hypot(d.vx, d.vy);
  const moving = speed > 0.04;
  const sprint = moving && (d.speed >= 1.5 || L?.style === "speedster" && speed > 0.25);
  const cadence = sprint ? 1.5 : 2.2;
  const frame = moving ? Math.floor(d.walk / cadence) % (sprint ? 4 : 2) : 0;
  const up = d.vy < -0.05 && Math.abs(d.vy) > Math.abs(d.vx);
  const arms = now < d.arms;
  const top = by - 8 - (tall > 0 ? 1 : 0);
  const w = L?.broad ? 5 : 4;
  const tx = x - 2 - (L?.broad ? (facing > 0 ? 0 : 1) : 0);
  const lean = sprint ? facing : 0;
  // contorno
  R(x - 2 + lean, top, 4, 3, OUTLINE);
  R(tx - 1, top + 2, w + 2, by - (top + 2), OUTLINE);
  if (arms || pose === "card") {
    R(x - 4, top - 1, 2, 4, OUTLINE);
    R(x + 2, top - 1, 2, 4, OUTLINE);
  }
  // cabeça e cabelo
  const hs = L?.hairStyle ?? "short";
  const hx = x - 1 + lean;
  if (hs === "afro") R(hx - 1, top, 4, 2, d.hair);
  else if (hs === "mohawk") R(hx, top - 1, 1, 2, d.hair);
  else if (hs !== "bald") R(hx, top + 1, 2, 1, hs === "buzz" ? shade(d.hair, d.skin) : d.hair);
  if (hs === "long") R(facing > 0 ? hx - 1 : hx + 2, top + 1, 1, 2, d.hair);
  R(hx, top + 2, 2, 1, up ? d.hair : d.skin);
  if (hs === "bald") R(hx, top + 1, 2, 1, d.skin);
  if (L?.beard && !up) R(hx + (facing > 0 ? 1 : 0), top + 2, 1, 1, shade(d.hair, d.skin));
  // tronco (alto ganha 1 pixel)
  const ty0 = top + 3;
  const th = 2 + (tall > 0 ? 1 : 0);
  R(tx, ty0, w, th, d.shirt);
  if (d.pattern === "stripes") {
    R(tx + 1, ty0, 1, th, d.stripe);
    R(tx + 3, ty0, 1, th, d.stripe);
  } else if (d.pattern === "hoops") R(tx, ty0 + 1, w, 1, d.stripe);
  else if (d.pattern === "halves") R(tx + (w >> 1), ty0, w - (w >> 1), th, d.stripe);
  else if (d.pattern === "sash") for (let i = 0; i < th; i++) R(tx + 1 + i, ty0 + i, 1, 1, d.stripe);
  if (d.sleeve !== d.shirt) {
    R(tx, ty0, 1, 1, d.sleeve);
    R(tx + w - 1, ty0, 1, 1, d.sleeve);
  }
  if (arms) {
    const wave = Math.floor(now / 160) % 2;
    R(x - 3, ty0 - 2 + wave, 1, 2, d.sleeve);
    R(x + 2, ty0 - 2 + (1 - wave), 1, 2, d.sleeve);
    R(x - 3, ty0 - 3 + wave, 1, 1, d.skin);
    R(x + 2, ty0 - 3 + (1 - wave), 1, 1, d.skin);
  } else if (pose === "card") {
    R(x + 2, ty0 - 2, 1, 2, d.sleeve);
    R(x + 2, ty0 - 4, 2, 2, d.poseCard === "R" ? "#ef3b36" : "#ffd83a");
  } else if (sprint) {
    // braços bombeando na corrida
    const a = frame % 2;
    R(a ? x - 3 : x + 2, ty0 + 1, 1, 1, d.skin);
  }
  // calção e pernas
  const sy = ty0 + th;
  R(tx, sy, w, 1, d.shorts);
  const ly = sy + 1;
  const legH = by - ly;
  if (pose === "kick" || pose === "volley") {
    // perna de apoio + perna do chute esticada para frente
    const back = s < 0.4;
    R(x - 1, ly, 1, legH, d.skin);
    R(x - 1, by - 1, 1, 1, d.socks);
    const kx = back ? x - facing * 2 : x + facing * 2;
    R(kx - (facing < 0 ? 1 : 0), back ? ly + 1 : ly, 2, 1, d.socks);
    return;
  }
  if (pose === "stepover" || (holder && L?.style === "dribbler" && moving && Math.floor(now / 520) % 3 === 0)) {
    // pedalada: a perna passa por cima da bola em arco
    const ph = Math.floor(now / 110) % 4;
    const off = [-2, -1, 1, 2][ph];
    R(x - 1, ly, 1, legH, d.skin);
    R(x - 1, by - 1, 1, 1, d.socks);
    R(x + off, ly, 1, 1, d.socks);
    return;
  }
  const pts: [number, number][] = sprint
    ? [[-2, 1], [-1, 0], [0, -1], [-1, 0]].map(([a, b]) => [a, b] as [number, number])
    : [[frame ? -1 : -2, frame ? 0 : 1]];
  const [o1, o2] = pts[frame % pts.length];
  const l1 = x + o1, l2 = x + o2 + (sprint ? 1 : 0);
  for (const lx of [l1, l2]) {
    if (legH > 1) R(lx, ly, 1, legH - 1, d.skin);
    R(lx, by - 1, 1, 1, d.socks);
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Mistura duas cores hex (meio a meio). */
export function shade(a: string, b: string): string {
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return a;
  const m = pa.map((v, i) => Math.round((v + pb[i]) / 2));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function parse(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- efeitos em pixel (faíscas, rastro)
interface Spark { x: number; y: number; vx: number; vy: number; life: number; c: string }

/** Faíscas na trave, poeira do carrinho, rastro do chute forte: desenhado na escala do campinho. */
export class PixelFX {
  sparks: Spark[] = [];
  streak: { x: number; y: number }[] = [];
  streakColor = "#ffffff";
  streakOn = false;

  burst(x: number, y: number, colors: string[], n = 12, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random() * 0.9) * power;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, life: 260 + Math.random() * 260, c: colors[i % colors.length] });
    }
  }

  update(dt: number, ball: { x: number; y: number; h: number }) {
    const k = dt / 16.7;
    for (const s of this.sparks) {
      s.x += s.vx * k;
      s.y += s.vy * k;
      s.vy += 0.05 * k;
      s.life -= dt;
    }
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.streakOn) {
      this.streak.push({ x: ball.x, y: ball.y - ball.h });
      if (this.streak.length > 9) this.streak.shift();
    } else if (this.streak.length) this.streak.shift();
  }

  draw(g: CanvasRenderingContext2D) {
    const n = this.streak.length;
    for (let i = 0; i < n - 1; i++) {
      const p = this.streak[i];
      g.globalAlpha = ((i + 1) / n) * 0.7;
      g.fillStyle = i > n - 4 ? "#ffffff" : this.streakColor;
      g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 1);
    }
    g.globalAlpha = 1;
    for (const s of this.sparks) {
      g.fillStyle = s.c;
      g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
  }
}
