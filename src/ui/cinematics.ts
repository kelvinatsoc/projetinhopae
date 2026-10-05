// "Lance decisivo": nos gols, pênaltis e grandes chances (modo Ultra, velocidades lentas), o campo
// visto de cima dá lugar a uma cena curta em pixel art com câmera de transmissão atrás do
// finalizador: sprites grandes com número nas costas, drible no zagueiro, barreira na falta,
// corrida para o pênalti, chute em câmera lenta (rastro no chute forte, curva no chute colocado,
// bicicleta, voleio, cabeçada), ponta dos dedos do goleiro, faísca na trave e a rede balançando.
// Toque para pular; ao fim aparece o botão de replay (com a câmera espelhada).
// Usa só Math.random para enfeites (torcida, faíscas): nunca mexe no gerador do mundo.
import type { Look, ShotStyle, Celebration } from "./matchSprites";
import { hash } from "./matchSprites";
import "./cinematics.css";

export type CineOutcome = "goal" | "save" | "post" | "miss";

export interface CineKit {
  shirt: string;
  sleeve: string;
  shorts: string;
  socks: string;
  pattern: "solid" | "stripes" | "hoops";
  stripe: string;
}
export interface CineActor {
  look: Look;
  kit: CineKit;
  name: string;
}
export interface CineSpec {
  outcome: CineOutcome;
  style: ShotStyle;
  shooter: CineActor;
  keeper: CineActor | null;
  defender: CineActor | null;
  /** cor do time que ataca (faixa do letreiro, torcida) */
  color: string;
  defColor: string;
  dribble: boolean;
  celebration: Celebration;
  title: string;
  seed: number;
}

// ---------------------------------------------------------------- quando mostrar
export interface CineAsk {
  outcome: CineOutcome;
  penalty: boolean;
  ownGoal?: boolean;
  xg: number;
  min: number;
  /** minuto do último lance decisivo mostrado (para não cansar) */
  lastMin: number | null;
  seed: number;
}

/** Decide se o lance vira cena: todo gol e pênalti; defesa/trave/para fora só em chance clara. */
export function wantsCinematic(a: CineAsk): boolean {
  if (a.ownGoal) return false;
  if (a.penalty) return true;
  if (a.outcome === "goal") return true;
  const recent = a.lastMin != null && a.min - a.lastMin < 8 && a.min >= a.lastMin;
  if (recent) return false;
  const h = hash(a.seed, a.min, 77) % 100;
  if (a.outcome === "post") return a.xg >= 0.12 || h < 50;
  if (a.outcome === "save") return a.xg >= 0.3 ? h < 70 : a.xg >= 0.18 && h < 30;
  return a.xg >= 0.35 && h < 35;
}

// ---------------------------------------------------------------- linha do tempo
export type PhaseName = "banner" | "dribble" | "approach" | "strike" | "flight" | "outcome";
export interface Phase { name: PhaseName; start: number; dur: number }

/** Fases da cena (ms reais). O voo é a câmera lenta. */
export function phasesOf(spec: Pick<CineSpec, "style" | "dribble" | "outcome">): Phase[] {
  const list: [PhaseName, number][] = [["banner", 550]];
  if (spec.dribble) list.push(["dribble", 1500]);
  const pen = spec.style === "penalty";
  list.push(["approach", pen ? 1300 : spec.style === "freekick" ? 1000 : 700]);
  list.push(["strike", spec.style === "bicycle" ? 600 : spec.style === "header" ? 500 : 300]);
  list.push(["flight", spec.style === "bicycle" || spec.style === "curl" ? 1250 : spec.style === "chip" ? 1150 : 950]);
  list.push(["outcome", spec.outcome === "goal" ? 1900 : 1400]);
  let t = 0;
  return list.map(([name, dur]) => {
    const p = { name, start: t, dur };
    t += dur;
    return p;
  });
}

export function totalOf(phases: Phase[]): number {
  const l = phases[phases.length - 1];
  return l.start + l.dur;
}

/** Cena (estado puro: avança com update, desenha com draw). */
export class CineScene {
  spec: CineSpec;
  phases: Phase[];
  total: number;
  t = 0;
  replay = false;
  aim: -1 | 1;
  high: boolean;
  wall: number;
  crowd: { x: number; y: number; c: string; p: number }[] = [];
  sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  private sparked = false;
  private touched = false;

  constructor(spec: CineSpec) {
    this.spec = spec;
    this.phases = phasesOf(spec);
    this.total = totalOf(this.phases);
    const h = hash(spec.seed, 3);
    this.aim = h % 2 ? 1 : -1;
    this.high = spec.style === "chip" || spec.style === "freekick" || (h >> 3) % 3 === 0;
    this.wall = spec.style === "freekick" ? 4 : 0;
    const cols = [spec.color, spec.defColor, "#f2f2f2", "#d8c39a", "#2b2b2b"];
    for (let i = 0; i < 260; i++) this.crowd.push({ x: Math.random() * CW, y: 2 + Math.random() * 14, c: cols[i % cols.length], p: Math.random() * 6 });
  }

  get done(): boolean {
    return this.t >= this.total;
  }

  phase(): { p: Phase; s: number } {
    for (const p of this.phases) if (this.t < p.start + p.dur) return { p, s: Math.min(1, Math.max(0, (this.t - p.start) / p.dur)) };
    const p = this.phases[this.phases.length - 1];
    return { p, s: 1 };
  }

  /** O lance está em câmera lenta? (para o selo "câmera lenta") */
  slow(): boolean {
    const n = this.phase().p.name;
    return n === "flight" || n === "strike";
  }

  update(dt: number) {
    this.t = Math.min(this.total, this.t + dt);
    const k = dt / 16.7;
    for (const s of this.sparks) {
      s.x += s.vx * k;
      s.y += s.vy * k;
      s.vy += 0.06 * k;
      s.life -= dt;
    }
    if (this.sparks.length) this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  restart(replay: boolean) {
    this.t = replay ? this.phases.find((p) => p.name === (this.spec.dribble ? "dribble" : "approach"))!.start : 0;
    this.replay = replay;
    this.sparked = false;
    this.touched = false;
    this.sparks = [];
  }

  skip() {
    this.t = this.total;
  }

  // ------------------------------------------------ desenho
  draw(g: CanvasRenderingContext2D) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.replay) {
      g.translate(CW, 0);
      g.scale(-1, 1);
    }
    const { p, s } = this.phase();
    const sp = this.spec;
    const shake = p.name === "flight" && sp.style === "power" && s < 0.15 ? Math.round(Math.random() * 2 - 1) : 0;
    g.translate(shake, 0);
    this.drawBackdrop(g, p.name === "outcome" && sp.outcome === "goal");
    const ball = this.ballPos(p.name, s);
    const net = p.name === "outcome" && sp.outcome === "goal" ? Math.max(0, 1 - s * 1.2) : 0;
    this.drawGoal(g, net, ball.tx, ball.ty);
    // goleiro
    if (sp.keeper) this.drawKeeper(g, p.name, s);
    // barreira
    if (this.wall && (p.name === "approach" || p.name === "strike" || p.name === "flight" || p.name === "banner")) {
      const jump = p.name === "flight" && s < 0.6 ? Math.round(Math.sin(s / 0.6 * Math.PI) * 4) : 0;
      for (let i = 0; i < this.wall; i++) {
        const a = sp.defender ?? sp.keeper;
        if (a) drawBig(g, 62 + i * 10, 74 - jump, 2, a, "wall", "front", this.t, i % 2 ? 1 : -1);
      }
    }
    // zagueiro (drible)
    if (sp.defender && p.name === "dribble") this.drawDribble(g, s);
    else if (sp.defender && p.name === "banner" && sp.dribble) drawBig(g, 80, 84, 3, sp.defender, "stand", "front", this.t, 1);
    else if (sp.defender && !this.wall && (p.name === "approach" || p.name === "strike" || p.name === "flight") && sp.dribble) {
      // o zagueiro driblado fica no chão
      drawBig(g, 80 - this.dribDir() * 30, 94, 3, sp.defender, "down", "front", this.t, -this.dribDir());
    }
    // bola atrás do finalizador quando já viajou longe
    const ballFar = ball.y < 80;
    if (ballFar) this.drawBall(g, ball);
    if (p.name !== "dribble") {
      // finalizador à esquerda do quadro, para o goleiro ficar visível
      g.save();
      if (sp.style !== "penalty" && sp.style !== "freekick") g.translate(SHX, 0);
      this.drawShooter(g, p.name, s);
      g.restore();
    }
    if (!ballFar) this.drawBall(g, ball);
    for (const k of this.sparks) {
      g.fillStyle = k.c;
      g.fillRect(Math.round(k.x), Math.round(k.y), 1, 1);
    }
    // faixas de cinema
    const bar = p.name === "banner" ? Math.round(9 * s) : 9;
    g.fillStyle = "#000";
    g.fillRect(-2, 0, CW + 4, bar);
    g.fillRect(-2, CH - bar, CW + 4, bar);
    g.restore();
  }

  private dribDir(): 1 | -1 {
    return hash(this.spec.seed, 9) % 2 ? 1 : -1;
  }

  private drawBackdrop(g: CanvasRenderingContext2D, party: boolean) {
    // arquibancada
    g.fillStyle = "#151c22";
    g.fillRect(-4, 0, CW + 8, 22);
    const t = this.t / 1000;
    for (const f of this.crowd) {
      const jump = party ? Math.abs(Math.sin(t * 9 + f.p)) * 2 : Math.abs(Math.sin(t * 2 + f.p)) * 0.6;
      g.fillStyle = f.c;
      g.fillRect(Math.round(f.x), Math.round(f.y - jump), 1, 2);
    }
    if (party) {
      // bandeiras
      for (let i = 0; i < 6; i++) {
        const x = 10 + i * 27, w = Math.sin(t * 6 + i) * 2;
        g.fillStyle = i % 2 ? this.spec.color : "#ffffff";
        g.fillRect(x, 3, 6 + Math.round(w), 4);
        g.fillStyle = "#222";
        g.fillRect(x - 1, 3, 1, 9);
      }
    }
    // placas de publicidade
    g.fillStyle = "#0b1f2e";
    g.fillRect(-4, 20, CW + 8, 4);
    g.fillStyle = this.spec.color;
    for (let x = 4; x < CW; x += 24) g.fillRect(x, 21, 12, 2);
    // gramado em perspectiva
    for (let y = 24; y < CH; y++) {
      const band = Math.floor(Math.pow((y - 18) / 6, 1.35)) % 2;
      g.fillStyle = band ? "#3f9a45" : "#378c3d";
      g.fillRect(-4, y, CW + 8, 1);
    }
    // grande área em perspectiva
    g.fillStyle = "rgba(230,244,230,0.85)";
    g.fillRect(GX0 - 4, GY1 + 2, GX1 - GX0 + 8, 1);
    g.fillRect(14, 70, CW - 28, 1);
    for (let y = GY1 + 2; y < 70; y++) {
      const k = (y - GY1 - 2) / (70 - GY1 - 2);
      g.fillRect(Math.round(GX0 - 4 - k * (GX0 - 18)), y, 1, 1);
      g.fillRect(Math.round(GX1 + 4 + k * (CW - 18 - GX1)), y, 1, 1);
    }
    g.fillRect(CW / 2 - 1, 78, 2, 1); // marca do pênalti
  }

  private drawGoal(g: CanvasRenderingContext2D, ripple: number, bx: number, by: number) {
    // rede (com ondulação a partir do ponto do gol)
    const t = this.t / 1000;
    g.fillStyle = "rgba(255,255,255,0.32)";
    for (let x = GX0 + 2; x < GX1; x += 3) {
      for (let y = GY0 + 2; y < GY1; y += 3) {
        let dx = 0, dy = 0;
        if (ripple > 0) {
          const d = Math.hypot(x - bx, y - by);
          const wv = Math.sin(d * 0.6 - t * 30) * ripple * Math.max(0, 1 - d / 40) * 3;
          dx = ((x - bx) / (d || 1)) * wv;
          dy = ((y - by) / (d || 1)) * wv - Math.max(0, 1 - d / 18) * ripple * 3;
        }
        g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
      }
    }
    // traves
    g.fillStyle = "#0d1a12";
    g.fillRect(GX0 - 2, GY0 - 2, GX1 - GX0 + 4, 4);
    g.fillRect(GX0 - 2, GY0 - 2, 4, GY1 - GY0 + 3);
    g.fillRect(GX1 - 2, GY0 - 2, 4, GY1 - GY0 + 3);
    g.fillStyle = "#f4f6f4";
    g.fillRect(GX0 - 1, GY0 - 1, GX1 - GX0 + 2, 2);
    g.fillRect(GX0 - 1, GY0 - 1, 2, GY1 - GY0 + 1);
    g.fillRect(GX1 - 1, GY0 - 1, 2, GY1 - GY0 + 1);
    g.fillStyle = "rgba(230,244,230,0.85)";
    g.fillRect(4, GY1, CW - 8, 1);
  }

  /** Alvo final da bola (no plano do gol) conforme o desfecho. */
  private target(): { x: number; y: number } {
    const sp = this.spec;
    const a = this.aim;
    const hi = this.high;
    switch (sp.outcome) {
      case "goal":
        return { x: CW / 2 + a * (GX1 - GX0) * 0.38, y: hi ? GY0 + 6 : GY1 - 5 };
      case "save":
        return { x: CW / 2 + a * (GX1 - GX0) * 0.33, y: hi ? GY0 + 7 : GY1 - 7 };
      case "post":
        return { x: a > 0 ? GX1 : GX0, y: hi ? GY0 + 10 : GY1 - 8 };
      default:
        return hi ? { x: CW / 2 + a * 20, y: GY0 - 14 } : { x: a > 0 ? GX1 + 14 : GX0 - 14, y: GY1 - 6 };
    }
  }

  /** Bola: posição na tela e tamanho (perspectiva). */
  ballPos(ph: PhaseName, s: number): { x: number; y: number; r: number; tx: number; ty: number; h: number } {
    const sp = this.spec;
    const T = this.target();
    const foot = { x: 86 + SHX, y: 95 };
    if (ph === "banner" || ph === "dribble" || ph === "approach") {
      if (sp.style === "header" || sp.style === "volley" || sp.style === "bicycle") {
        // cruzamento chegando pelo alto
        if (ph !== "approach") return { x: -10, y: 30, r: 2, tx: T.x, ty: T.y, h: 0 };
        return { x: -10 + s * 90, y: 30 + s * 40, r: 2 + s, tx: T.x, ty: T.y, h: 0 };
      }
      if (ph === "approach") {
        const startY = sp.style === "penalty" || sp.style === "freekick" ? 80 : 99;
        if (sp.style === "penalty" || sp.style === "freekick") return { x: CW / 2, y: startY, r: 2, tx: T.x, ty: T.y, h: 0 };
        return { x: foot.x - 4 + s * 4, y: 99 - s * 4, r: 3, tx: T.x, ty: T.y, h: 0 };
      }
      return { x: foot.x, y: 99, r: 3, tx: T.x, ty: T.y, h: 0 };
    }
    let from = sp.style === "penalty" || sp.style === "freekick" ? { x: CW / 2, y: 80 } : foot;
    if (sp.style === "header") from = { x: 82 + SHX, y: 62 };
    if (sp.style === "bicycle" || sp.style === "volley") from = { x: 80 + SHX, y: 74 };
    if (ph === "strike") return { x: from.x, y: from.y, r: 3, tx: T.x, ty: T.y, h: 0 };
    if (ph === "flight") {
      // câmera lenta: começa rápido, desacelera perto do gol (o momento da defesa)
      const e = 1 - Math.pow(1 - s, 2.2);
      let x = from.x + (T.x - from.x) * e;
      let y = from.y + (T.y - from.y) * e;
      if (sp.style === "curl" || sp.style === "freekick") x += Math.sin(e * Math.PI) * -this.aim * 22;
      if (sp.style === "chip") y -= Math.sin(e * Math.PI) * 26;
      if (sp.style === "freekick") y -= Math.sin(e * Math.PI) * 16;
      const r = 3 - e * 1.6;
      return { x, y, r, tx: T.x, ty: T.y, h: 0 };
    }
    // desfecho
    const sp2 = this.spec.outcome;
    if (sp2 === "goal") return { x: T.x + this.aim * s * 2, y: T.y + s * 6, r: 1.4, tx: T.x, ty: T.y, h: 0 };
    if (sp2 === "save") return { x: T.x + this.aim * s * 30, y: T.y - Math.sin(s * Math.PI) * 14 - s * 8, r: 1.4 + s, tx: T.x, ty: T.y, h: 0 };
    if (sp2 === "post") return { x: T.x - this.aim * s * 26, y: T.y + s * 30, r: 1.4 + s * 1.2, tx: T.x, ty: T.y, h: 0 };
    return { x: T.x + this.aim * s * 10, y: T.y - s * 12, r: 1.4 - s * 0.6, tx: T.x, ty: T.y, h: 0 };
  }

  private drawBall(g: CanvasRenderingContext2D, b: { x: number; y: number; r: number }) {
    const { p, s } = this.phase();
    const sp = this.spec;
    if (p.name === "outcome" && sp.outcome === "miss" && s > 0.7) return;
    // rastro do chute forte / curva
    if (p.name === "flight") {
      const prev = [0.08, 0.16, 0.24, 0.32].map((d) => this.ballPos("flight", Math.max(0, s - d)));
      prev.forEach((q, i) => {
        g.globalAlpha = (sp.style === "power" || sp.style === "bicycle" || sp.style === "volley" ? 0.55 : 0.3) * (1 - i / 4);
        g.fillStyle = i < 1 ? "#ffffff" : sp.color;
        const w = Math.max(1, Math.round(q.r * 1.6));
        g.fillRect(Math.round(q.x - w / 2), Math.round(q.y - w / 2), w, w);
      });
      g.globalAlpha = 1;
      if (sp.style === "power" && s < 0.6) {
        // linhas de velocidade
        g.fillStyle = "rgba(255,255,255,0.6)";
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          g.fillRect(Math.round(b.x + Math.cos(a) * 9), Math.round(b.y + Math.sin(a) * 9), 2, 1);
        }
      }
    }
    // sombra no gramado
    if (b.y > GY1) {
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(Math.round(b.x - b.r), Math.round(Math.max(b.y + b.r, GY1 + 1)), Math.round(b.r * 2), 1);
    }
    const r = Math.max(1, Math.round(b.r));
    g.fillStyle = "#0d1a12";
    g.fillRect(Math.round(b.x - r - 1), Math.round(b.y - r), r * 2 + 2, r * 2);
    g.fillRect(Math.round(b.x - r), Math.round(b.y - r - 1), r * 2, r * 2 + 2);
    g.fillStyle = "#ffffff";
    g.fillRect(Math.round(b.x - r), Math.round(b.y - r), r * 2, r * 2);
    if (r >= 2) {
      g.fillStyle = "#3a3a3a";
      const spin = Math.floor(this.t / 70) % 2;
      g.fillRect(Math.round(b.x - 1 + spin), Math.round(b.y - 1), 1, 1);
    }
    // eventos de contato
    if (p.name === "outcome" && s > 0 && !this.sparked) {
      this.sparked = true;
      const T = this.target();
      if (sp.outcome === "post") this.spark(T.x, T.y, ["#fff6b0", "#ffd83a", "#ffffff"], 26, 1.4);
      if (sp.outcome === "save") this.spark(T.x, T.y, ["#ffffff", "#bfe8ff"], 14, 0.9);
      if (sp.outcome === "goal") this.spark(T.x, T.y, ["#ffffff"], 10, 0.6);
    }
  }

  spark(x: number, y: number, cols: string[], n: number, pow: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * pow;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.5, life: 300 + Math.random() * 400, c: cols[i % cols.length] });
    }
  }

  private drawKeeper(g: CanvasRenderingContext2D, ph: PhaseName, s: number) {
    const sp = this.spec;
    const k = sp.keeper!;
    const T = this.target();
    const kx = CW / 2, ky = GY1 + 2;
    // para onde pula: no gol e na trave/para fora, em geral erra o lado ou chega atrasado
    const right = sp.outcome === "save" ? this.aim : sp.outcome === "goal" ? (hash(sp.seed, 21) % 3 === 0 ? this.aim : -this.aim) : this.aim;
    if (ph === "flight") {
      const start = sp.outcome === "save" ? 0.25 : 0.45;
      if (s > start) {
        const q = Math.min(1, (s - start) / (1 - start));
        const reach = sp.outcome === "save" ? Math.abs(T.x - kx) - 4 : 24;
        const x = kx + right * q * reach;
        const y = ky - Math.sin(q * Math.PI * 0.8) * (this.high ? 12 : 4);
        drawBig(g, x, y, 2, k, "dive", "front", this.t, right, q * (this.high ? 70 : 85));
        // ponta dos dedos
        if (sp.outcome === "save" && q > 0.85 && !this.touched) {
          this.touched = true;
          this.spark(T.x - right * 2, T.y, ["#ffffff", "#9fd8ff"], 10, 0.7);
        }
        return;
      }
      drawBig(g, kx, ky, 2, k, "ready", "front", this.t, 1);
      return;
    }
    if (ph === "outcome") {
      const reach = sp.outcome === "save" ? Math.abs(T.x - kx) - 4 : 24;
      const x = kx + right * reach;
      drawBig(g, x, ky, 2, k, "down", "front", this.t, right);
      return;
    }
    // esperando, balançando de um lado para o outro (no pênalti mais nervoso)
    const sway = Math.sin(this.t / (sp.style === "penalty" ? 180 : 320)) * 2;
    drawBig(g, kx + sway, ky, 2, k, "ready", "front", this.t, 1);
  }

  private drawDribble(g: CanvasRenderingContext2D, s: number) {
    const sp = this.spec;
    const d = sp.defender!;
    const dir = this.dribDir();
    // 0-0.45 pedaladas; 0.45-0.6 corte; 0.6-1 zagueiro dá o carrinho no vazio, atacante passa
    const sx = 80 + (s < 0.45 ? Math.sin(s * 40) * 3 : s < 0.6 ? dir * ((s - 0.45) / 0.15) * 16 : dir * 16 - dir * ((s - 0.6) / 0.4) * 10);
    const sy = 99 - (s > 0.6 ? (s - 0.6) / 0.4 * 6 : 0);
    if (s < 0.5) drawBig(g, 80 + Math.sin(s * 40) * -2, 84, 3, d, "ready", "front", this.t, 1);
    else drawBig(g, 80 - dir * ((s - 0.5) / 0.5) * 30, 86 + ((s - 0.5) / 0.5) * 8, 3, d, s > 0.62 ? "slide" : "ready", "front", this.t, -dir);
    const bx = sx + (s < 0.45 ? 0 : dir * 3);
    drawBig(g, sx, sy, 4, sp.shooter, s < 0.45 ? "stepover" : "run", "back", this.t, dir);
    g.fillStyle = "#0d1a12";
    g.fillRect(Math.round(bx) - 3, Math.round(sy) - 4, 6, 5);
    g.fillStyle = "#fff";
    g.fillRect(Math.round(bx) - 2, Math.round(sy) - 3, 4, 3);
  }

  private drawShooter(g: CanvasRenderingContext2D, ph: PhaseName, s: number) {
    const sp = this.spec;
    const a = sp.shooter;
    const pen = sp.style === "penalty" || sp.style === "freekick";
    if (ph === "banner") {
      drawBig(g, pen ? 60 : 82, 99, 4, a, "stand", "back", this.t, 1);
      return;
    }
    if (ph === "approach") {
      if (pen) {
        // corrida para a bola na diagonal
        const x = 60 + s * 20, y = 99 - s * 6;
        drawBig(g, x, y, 4, a, s < 0.25 ? "stand" : "run", "back", this.t, 1);
        return;
      }
      if (sp.style === "header" || sp.style === "bicycle" || sp.style === "volley") {
        drawBig(g, 82, 99 - s * 14, 4, a, "run", "back", this.t, 1);
        return;
      }
      drawBig(g, 84, 99, 4, a, "run", "back", this.t, 1);
      return;
    }
    if (ph === "strike" || ph === "flight") {
      const q = ph === "strike" ? s : 1;
      if (sp.style === "header") {
        const j = Math.sin(Math.min(1, q + (ph === "flight" ? 0 : 0)) * Math.PI) * 14;
        drawBig(g, 82, 85 - (ph === "strike" ? j : Math.max(0, 14 - s * 30)), 4, a, "header", "back", this.t, 1);
        return;
      }
      if (sp.style === "bicycle") {
        const rot = ph === "strike" ? q * 200 : 200 + Math.min(1, s * 2) * 160;
        const lift = ph === "strike" ? Math.sin(q * Math.PI * 0.6) * 18 : Math.max(0, 16 - s * 40);
        drawBig(g, 82, 88 - lift, 4, a, "kick", "back", this.t, 1, rot);
        return;
      }
      const x = pen ? 80 : sp.style === "volley" ? 82 : 84;
      const y = pen ? 93 : sp.style === "volley" ? 85 : 99;
      drawBig(g, x, y, 4, a, ph === "strike" && q < 0.4 ? "windup" : "kick", "back", this.t, 1, sp.style === "volley" ? -25 : 0);
      return;
    }
    // desfecho: comemora virado para a câmera, ou mãos na cabeça
    if (sp.outcome === "goal") {
      const c = sp.celebration;
      if (c === "knee") drawBig(g, 80 + Math.min(1, s * 1.5) * 10, 100 - Math.min(1, s * 1.5) * 4, 4, a, "knee", "front", this.t, 1);
      else if (c === "flip") drawBig(g, 80, 99 - Math.sin(Math.min(1, s * 1.6) * Math.PI) * 20, 4, a, "tuck", "front", this.t, 1, Math.min(1, s * 1.6) * -360);
      else if (c === "pile") {
        drawBig(g, 80, 99, 4, a, "arms", "front", this.t, 1);
        // companheiros chegando para o "montinho"
        const mate = { ...a, look: { ...a.look, num: (a.look.num % 11) + 2, hairStyle: "short" as const } };
        const q = Math.min(1, s * 1.4);
        drawBig(g, 80 - 50 + q * 40, 99, 4, mate, q < 1 ? "run" : "arms", "back", this.t, 1);
        drawBig(g, 80 + 50 - q * 38, 100, 4, { ...mate, look: { ...mate.look, num: mate.look.num + 3, hairStyle: "afro" } }, q < 1 ? "run" : "arms", "back", this.t, -1);
      } else drawBig(g, 80 + Math.sin(this.t / 200) * (c === "run" ? 14 : 2), 99, 4, a, "arms", "front", this.t, 1);
      return;
    }
    drawBig(g, 84, 99, 4, a, "despair", sp.outcome === "save" ? "back" : "front", this.t, 1);
  }
}

// ---------------------------------------------------------------- sprite grande
type BigPose = "stand" | "run" | "kick" | "windup" | "header" | "dive" | "ready" | "down" | "slide" | "arms" | "knee" | "tuck" | "despair" | "stepover" | "wall";

const DIGITS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "011", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

/** Contraste para o número da camisa. */
function numColor(shirt: string): string {
  const n = parseInt(shirt.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.55 ? "#151515" : "#f6f6f6";
}

/**
 * Jogador grande (unidade s px). (x, y) = pés. view: costas (finalizador) ou frente.
 * rot = rotação em graus (bicicleta, mortal, voo do goleiro).
 */
export function drawBig(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: CineActor, pose: BigPose, view: "back" | "front", t: number, dir: number, rot = 0) {
  const L = a.look, K = a.kit;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  const tall = L.tall;
  const H = 14 + (tall > 0 ? 1 : tall < 0 ? -1 : 0);
  if (rot) {
    g.translate(0, -H * s / 2);
    g.rotate((rot * Math.PI) / 180 * (dir < 0 ? -1 : 1));
    g.translate(0, H * s / 2);
  }
  if (pose === "down" || pose === "slide") {
    g.rotate(((dir > 0 ? 1 : -1) * 90 * Math.PI) / 180);
    g.translate(0, s * 2);
  }
  if (pose === "knee") g.translate(0, s * 3);
  const R = (ux: number, uy: number, uw: number, uh: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(ux * s), Math.round((uy - H) * s), Math.max(1, Math.round(uw * s)), Math.max(1, Math.round(uh * s)));
  };
  const O = "#0d1a12";
  const bw = L.broad ? 5 : 4;
  const bx = -bw / 2;
  const torsoTop = 3, torsoH = 5 + (tall > 0 ? 1 : 0) - (tall < 0 ? 1 : 0);
  const shortsY = torsoTop + torsoH;
  const legY = shortsY + 2;
  const legH = H - legY;
  const runF = Math.floor(t / 90) % 4;
  // sombra
  if (!rot && pose !== "down" && pose !== "slide") {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(Math.round(-3 * s), 0, Math.round(6 * s), Math.max(1, Math.round(s / 2)));
  }
  // contorno do corpo
  R(-1.25, -0.25, 2.5, 3.5, O);
  R(bx - 0.25, torsoTop - 0.25, bw + 0.5, torsoH + 2.5, O);
  // braços
  let armUp = pose === "arms" || pose === "despair" || pose === "header" || pose === "wall" && false;
  if (pose === "dive" || pose === "tuck") armUp = true;
  const armSway = pose === "run" ? (runF % 2 ? 1 : -1) : 0;
  const arm = (side: -1 | 1) => {
    const ax = side < 0 ? bx - 1 : bx + bw;
    if (pose === "wall") {
      // mãos protegendo
      R(side < 0 ? bx + 0.5 : bx + bw - 1.5, torsoTop + 3, 1, 1.5, L.skin);
      return;
    }
    if (pose === "despair") {
      R(ax - 0.25, torsoTop - 2.25, 1.5, 3.5, O);
      R(ax, torsoTop - 2, 1, 2, K.sleeve);
      R(side < 0 ? ax + 0.5 : ax - 0.5, -0.5, 1, 1, L.skin);
      return;
    }
    if (armUp) {
      const wave = pose === "arms" ? Math.floor(t / 150) % 2 : 0;
      R(ax - 0.25, torsoTop - 3.25 + (side < 0 ? wave : 1 - wave), 1.5, 4.5, O);
      R(ax, torsoTop - 3 + (side < 0 ? wave : 1 - wave), 1, 3, K.sleeve);
      R(ax, torsoTop - 3 + (side < 0 ? wave : 1 - wave), 1, 1, L.skin);
      return;
    }
    if (pose === "ready") {
      R(ax - 0.25 + side * 0.5, torsoTop - 0.25, 1.5, 4.5, O);
      R(ax + side * 0.5, torsoTop, 1, 2, K.sleeve);
      R(ax + side * 0.5, torsoTop + 2, 1, 2, view === "front" && K.sleeve === K.shirt ? "#f0f0f0" : L.skin);
      return;
    }
    const sw = side * armSway;
    R(ax - 0.25, torsoTop - 0.25 + sw * 0.5, 1.5, 5.5, O);
    R(ax, torsoTop + sw * 0.5, 1, 2.5, K.sleeve);
    R(ax, torsoTop + 2.5 + sw * 0.5, 1, 2, L.skin);
  };
  arm(-1);
  arm(1);
  // cabeça
  const hs = L.hairStyle;
  R(-1, 0, 2, 3, view === "back" ? L.hair : L.skin);
  if (hs === "bald") R(-1, 0, 2, 3, L.skin);
  else if (hs === "afro") R(-1.5, -0.75, 3, view === "back" ? 3.25 : 1.5, L.hair);
  else if (hs === "mohawk") R(-0.25, -0.75, 0.5, 1.5, L.hair);
  else if (hs === "long") {
    R(-1, 0, 2, 1, L.hair);
    if (view === "back") R(-1, 0, 2, 3.5, L.hair);
    else { R(-1.25, 0.5, 0.5, 2.5, L.hair); R(0.75, 0.5, 0.5, 2.5, L.hair); }
  } else R(-1, 0, 2, hs === "buzz" ? 0.5 : 1, L.hair);
  if (view === "back" && hs !== "bald" && hs !== "afro" && hs !== "long") R(-1, 0, 2, 2, L.hair);
  if (view === "back") R(-1, 2, 2, 1, L.skin);
  if (view === "front") {
    R(-0.6, 1.4, 0.4, 0.4, O);
    R(0.2, 1.4, 0.4, 0.4, O);
    if (L.beard) R(-1, 2.3, 2, 0.7, L.hair);
    if (pose === "arms" || pose === "knee") R(-0.4, 2.2, 0.8, 0.5, "#5a1f1f"); // gritando
  }
  // camisa
  R(bx, torsoTop, bw, torsoH, K.shirt);
  if (K.pattern === "stripes") for (let i = 1; i < bw; i += 2) R(bx + i, torsoTop, 0.75, torsoH, K.stripe);
  else if (K.pattern === "hoops") for (let i = 1; i < torsoH; i += 2) R(bx, torsoTop + i, bw, 0.75, K.stripe);
  R(bx, torsoTop, 1, 1.5, K.sleeve);
  R(bx + bw - 1, torsoTop, 1, 1.5, K.sleeve);
  // número (costas grande, frente pequeno)
  const num = String(L.num || 0);
  const px = view === "back" ? Math.max(1, Math.floor(s / 2)) : Math.max(1, Math.floor(s / 4));
  const nw = num.length * 4 - 1;
  const nx = Math.round(-nw * px / 2) + (view === "front" ? Math.round(s) : 0);
  const ny = Math.round((torsoTop + 0.8 - H) * s);
  g.fillStyle = numColor(K.shirt);
  // se o quadro estiver espelhado (replay), desespelha só o número para não ler "01"
  const mirrored = g.getTransform().a < 0;
  if (mirrored) { g.save(); g.translate(2 * nx + nw * px, 0); g.scale(-1, 1); }
  num.split("").forEach((ch, i) => DIGITS[ch]?.forEach((row, ry) => row.split("").forEach((c, rx) => {
    if (c === "1") g.fillRect(nx + (i * 4 + rx) * px, ny + ry * px, px, px);
  })));
  if (mirrored) g.restore();
  // calção
  R(bx, shortsY, bw, 2, K.shorts);
  // pernas
  const leg = (lx: number, lift: number, ext: number) => {
    R(lx - 0.25, legY - lift - 0.25, 1.5, legH + 0.5, O);
    R(lx, legY - lift, 1, legH * 0.45, L.skin);
    R(lx, legY - lift + legH * 0.45, 1, legH * 0.4, K.socks);
    R(lx + ext * 0.3, legY - lift + legH * 0.85, 1.25, legH * 0.15 + 0.25, "#111");
  };
  switch (pose) {
    case "run":
    case "stepover": {
      const f = pose === "stepover" ? Math.floor(t / 120) % 4 : runF;
      const lifts = [[0, 2], [1, 1], [2, 0], [1, 1]][f];
      const sx = pose === "stepover" ? [0, 1, 0, -1][f] : 0;
      leg(-1.5 + sx, lifts[0], 0);
      leg(0.5 - sx, lifts[1], 0);
      break;
    }
    case "kick":
      leg(-1.5, 0, 0);
      leg(0.5, 3, 1);
      break;
    case "windup":
      leg(-1.5, 0, 0);
      leg(0.6, 1.5, -1);
      break;
    case "header":
    case "tuck":
      leg(-1.5, 2, 0);
      leg(0.5, 2, 0);
      break;
    case "knee":
      R(bx, legY, bw, 1.5, K.socks);
      break;
    case "ready":
    case "wall":
      leg(-2, 0, 0);
      leg(1, 0, 0);
      break;
    default:
      leg(-1.5, 0, 0);
      leg(0.5, 0, 0);
  }
  g.restore();
}

/** Ator da cena a partir do jogador do campinho (cores do uniforme já resolvidas). */
export function actorOf(d: { look?: Look; shirt: string; sleeve: string; shorts: string; socks: string; pattern: CineKit["pattern"]; stripe: string; skin: string; hair: string }, name: string): CineActor {
  const look: Look = d.look ?? { skin: d.skin, hair: d.hair, hairStyle: "short", tall: 0, broad: false, style: "normal", num: 0, beard: false };
  return { look, kit: { shirt: d.shirt, sleeve: d.sleeve, shorts: d.shorts, socks: d.socks, pattern: d.pattern, stripe: d.stripe }, name };
}

// ---------------------------------------------------------------- montagem na tela
export const CW = 160;
export const CH = 104;
const SHX = -26;
const GX0 = 34, GX1 = 126, GY0 = 30, GY1 = 58;

export interface CineHandle {
  skip(): void;
  destroy(): void;
}

export interface CineHooks {
  /** a cena acabou (pulada ou não); o campo volta */
  onEnd: () => void;
  /** replay pedido (o relógio deve segurar de novo) */
  onReplay?: () => void;
  /** replay terminou */
  onReplayEnd?: () => void;
}

/** Monta a cena por cima do campo (dentro de host) e roda o próprio laço de animação. */
export function playCinematic(host: HTMLElement, spec: CineSpec, hooks: CineHooks): CineHandle {
  const scene = new CineScene(spec);
  const root = document.createElement("div");
  root.className = "cine";
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", `${spec.title}: toque para pular`);
  const canvas = document.createElement("canvas");
  canvas.width = CW;
  canvas.height = CH;
  canvas.className = "cine-canvas";
  const label = document.createElement("div");
  label.className = "cine-label";
  label.style.setProperty("--cine-c", spec.color);
  label.innerHTML = `<b></b><span></span>`;
  (label.firstChild as HTMLElement).textContent = spec.title;
  (label.lastChild as HTMLElement).textContent = `${spec.shooter.look.num ? `#${spec.shooter.look.num} ` : ""}${spec.shooter.name}`;
  const slow = document.createElement("div");
  slow.className = "cine-slow";
  slow.textContent = "◀◀ câmera lenta";
  const tip = document.createElement("div");
  tip.className = "cine-skip";
  tip.textContent = "toque para pular ⏭";
  const big = document.createElement("div");
  big.className = "cine-big";
  root.append(canvas, label, slow, tip, big);
  host.appendChild(root);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  let raf = 0;
  let last = 0;
  let ended = false;
  let replayBtn: HTMLButtonElement | null = null;
  let replayTimer = 0;
  let inReplay = false;
  const outcomeWord: Record<CineOutcome, string> = { goal: "GOOOL!", save: "QUE DEFESA!", post: "NA TRAVE!", miss: "PRA FORA!" };

  const loop = (ts: number) => {
    raf = 0;
    const dt = last ? Math.min(50, ts - last) : 16;
    last = ts;
    scene.update(dt);
    scene.draw(g);
    const ph = scene.phase();
    slow.classList.toggle("on", scene.slow());
    const showBig = ph.p.name === "outcome";
    big.textContent = showBig ? (spec.outcome === "save" && spec.style === "penalty" ? "DEFENDEU!" : outcomeWord[spec.outcome]) : "";
    big.classList.toggle("on", showBig);
    big.classList.toggle("goal", showBig && spec.outcome === "goal");
    label.classList.toggle("replay", inReplay);
    if (inReplay) (label.firstChild as HTMLElement).textContent = "REPLAY";
    if (scene.done) return finish();
    raf = requestAnimationFrame(loop);
  };

  const finish = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (inReplay) {
      inReplay = false;
      root.classList.add("out");
      hooks.onReplayEnd?.();
      window.setTimeout(() => root.remove(), 260);
      return;
    }
    if (ended) return;
    ended = true;
    root.classList.add("out");
    hooks.onEnd();
    // botão de replay por alguns segundos
    replayBtn = document.createElement("button");
    replayBtn.type = "button";
    replayBtn.className = "cine-replay";
    replayBtn.textContent = "↺ Replay";
    replayBtn.onclick = (ev) => {
      ev.stopPropagation();
      replayBtn?.remove();
      window.clearTimeout(replayTimer);
      inReplay = true;
      root.classList.remove("out");
      if (!root.isConnected) host.appendChild(root);
      scene.restart(true);
      last = 0;
      hooks.onReplay?.();
      raf = requestAnimationFrame(loop);
    };
    host.appendChild(replayBtn);
    replayTimer = window.setTimeout(() => replayBtn?.remove(), 4500);
    window.setTimeout(() => { if (!inReplay) root.remove(); }, 260);
  };

  root.addEventListener("click", () => {
    scene.skip();
    finish();
  });
  raf = requestAnimationFrame(loop);
  return {
    skip: () => {
      scene.skip();
      finish();
    },
    destroy: () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(replayTimer);
      replayBtn?.remove();
      root.remove();
    },
  };
}
