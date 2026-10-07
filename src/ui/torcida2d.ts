// Festa da torcida brasileira no campinho em pixel art (modo 2D): bandeirões balançando,
// mosaico na entrada em campo, ola dando a volta no estádio, sinalizadores com fumaça colorida
// e papel picado no gol. Desenha por cima das arquibancadas já pintadas no fundo.
// Desempenho: tudo é pré-alocado no construtor (arrays tipados, cores já em string) e a animação
// depende só do tempo (ms), nunca do número de quadros: mesma velocidade em 60 ou 120 Hz.
import { CX, CY, W } from "./pitchGeom";

export interface FestaFan { x: number; y: number; head: string; body: string; sec: number }

export interface FestaColors {
  /** cores do clube da torcida: [principal, secundária, terceira] */
  club: [string, string, string];
  selecao: boolean;
}

const MAX_SMOKE = 64;
const MAX_PAPER = 140;
const OLA_MS = 9000; // uma volta inteira

/** rgba com alfa em degraus (pré-calculado: nada de string nova a cada quadro) */
function alphaSteps(hex: string, n: number, max: number): string[] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const v = parseInt(h.slice(0, 6), 16) || 0;
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(`rgba(${r},${g},${b},${(((i + 1) / n) * max).toFixed(3)})`);
  return out;
}

export class Festa2D {
  /** força da festa 0..1 (tamanho da torcida) */
  level: number;
  reduced: boolean;
  private fx: Int16Array; // posição dos torcedores da casa
  private fy: Int16Array;
  private fang: Float32Array; // ângulo em volta do campo (0..1), para a ola
  private fbody: string[];
  private fhead: string[];
  private flags: { x: number; y: number; w: number; h: number; ph: number }[] = [];
  private flares: Int16Array; // pares x,y dos sinalizadores
  private nFlares: number;
  // fumaça: x, y, vida (ms restantes), cor
  private sx = new Float32Array(MAX_SMOKE);
  private sy = new Float32Array(MAX_SMOKE);
  private sl = new Float32Array(MAX_SMOKE);
  private sc = new Uint8Array(MAX_SMOKE);
  private smokeCol: string[][];
  // papel picado: x, y, velocidade, fase, cor
  private px = new Float32Array(MAX_PAPER);
  private py = new Float32Array(MAX_PAPER);
  private pv = new Float32Array(MAX_PAPER);
  private pph = new Float32Array(MAX_PAPER);
  private pc = new Uint8Array(MAX_PAPER);
  private pl = new Float32Array(MAX_PAPER);
  private paperCol: string[];
  private flagCol: [string, string, string];
  private selecao: boolean;
  /** até quando os sinalizadores queimam (ms do relógio da animação) */
  private flareUntil = -1;
  private olaAt = -1e9;
  private nextOla: number;
  private tifoUntil = -1;
  private smokeSpawn = 0;
  private now = 0;

  constructor(fans: FestaFan[], colors: FestaColors, level: number, reduced: boolean) {
    this.level = Math.max(0, Math.min(1, level));
    this.reduced = reduced;
    this.selecao = colors.selecao;
    const home = fans.filter((f) => f.sec === 0);
    this.fx = new Int16Array(home.length);
    this.fy = new Int16Array(home.length);
    this.fang = new Float32Array(home.length);
    this.fbody = new Array(home.length);
    this.fhead = new Array(home.length);
    home.forEach((f, i) => {
      this.fx[i] = f.x;
      this.fy[i] = f.y;
      // ângulo normalizado com o campo "achatado" (o estádio é mais largo que alto)
      const a = Math.atan2((f.y - CY) * 1.5, f.x - CX);
      this.fang[i] = (a / (Math.PI * 2) + 1) % 1;
      this.fbody[i] = f.body;
      this.fhead[i] = f.head;
    });
    const [c0, c1, c2] = colors.club;
    this.flagCol = colors.selecao ? ["#1a9a3c", "#f7d117", "#1f3f9a"] : [c0, c1, c2];
    // bandeirões: mais e maiores nas torcidas grandes
    const nFlags = 2 + Math.round(this.level * 4);
    const spots: [number, number, number, number][] = [
      [26, 2, 14, 8], [148, 2, 14, 8], [1, 46, 10, 14], [1, 78, 10, 14], [40, 123, 14, 7], [96, 123, 14, 7], [186, 30, 9, 12],
    ];
    for (let i = 0; i < Math.min(nFlags, spots.length); i++) {
      const [x, y, w, h] = spots[i];
      this.flags.push({ x, y, w, h, ph: i * 1.7 });
    }
    // sinalizadores: na torcida organizada (atrás do gol da esquerda) e no meio da arquibancada de cima
    const nF = 4 + Math.round(this.level * 10);
    this.flares = new Int16Array(nF * 2);
    this.nFlares = nF;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < nF; i++) {
      const behindGoal = i % 3 !== 2;
      this.flares[i * 2] = behindGoal ? 2 + Math.floor(rnd() * 9) : 20 + Math.floor(rnd() * 156);
      this.flares[i * 2 + 1] = behindGoal ? 24 + Math.floor(rnd() * 88) : 3 + Math.floor(rnd() * 8);
    }
    const smokeBase = colors.selecao ? ["#1a9a3c", "#f7d117"] : [c0, c1, "#d63a2a"];
    this.smokeCol = smokeBase.map((c) => alphaSteps(c, 6, 0.55));
    this.paperCol = ["#ffffff", "#ffffff", this.flagCol[0], this.flagCol[1], this.flagCol[2]];
    this.nextOla = 50000 + Math.random() * 40000;
  }

  /** Gol: a torcida dona do estádio comemora (sinalizadores, fumaça, papel picado). */
  goal(forCrowd: boolean) {
    if (!forCrowd || this.reduced) return;
    this.flareUntil = this.now + 5000 + this.level * 3000;
    const n = Math.round(MAX_PAPER * (0.4 + 0.6 * this.level));
    for (let i = 0; i < n; i++) {
      const top = i % 3 !== 0;
      this.px[i] = 12 + Math.random() * (W - 24);
      this.py[i] = top ? 1 + Math.random() * 8 : 122 + Math.random() * 6;
      this.pv[i] = 4 + Math.random() * 7; // px/s
      this.pph[i] = Math.random() * 6.28;
      this.pc[i] = Math.floor(Math.random() * this.paperCol.length);
      this.pl[i] = 2500 + Math.random() * 4000;
    }
    if (Math.random() < 0.5) this.ola();
  }

  /** Mosaico na arquibancada (entrada dos times). */
  tifo(ms = 7000) {
    if (this.reduced) return;
    this.tifoUntil = this.now + ms;
  }

  /** A ola dá uma volta no estádio. */
  ola() {
    if (this.reduced) return;
    if (this.now - this.olaAt < OLA_MS + 4000) return;
    this.olaAt = this.now;
  }

  update(dt: number, now: number) {
    this.now = now;
    if (this.reduced) return;
    // ola espontânea de vez em quando (mais frequente nas torcidas grandes)
    if (now > this.nextOla) {
      this.nextOla = now + 70000 + Math.random() * 60000 * (1.3 - this.level);
      this.ola();
    }
    const s = dt / 1000;
    // fumaça: nasce nos sinalizadores e sobe devagar, se espalhando
    if (now < this.flareUntil) {
      this.smokeSpawn += dt;
      while (this.smokeSpawn > 70) {
        this.smokeSpawn -= 70;
        for (let k = 0; k < MAX_SMOKE; k++) {
          if (this.sl[k] > 0) continue;
          const f = Math.floor(Math.random() * this.nFlares);
          this.sx[k] = this.flares[f * 2] + Math.random() * 2 - 1;
          this.sy[k] = this.flares[f * 2 + 1];
          this.sl[k] = 2600 + Math.random() * 1600;
          this.sc[k] = Math.floor(Math.random() * this.smokeCol.length);
          break;
        }
      }
    }
    for (let k = 0; k < MAX_SMOKE; k++) {
      if (this.sl[k] <= 0) continue;
      this.sl[k] -= dt;
      this.sx[k] += s * (2.2 + Math.sin((now + k * 300) / 700) * 1.4);
      this.sy[k] -= s * 1.6;
    }
    for (let i = 0; i < MAX_PAPER; i++) {
      if (this.pl[i] <= 0) continue;
      this.pl[i] -= dt;
      this.py[i] += s * this.pv[i] * (this.py[i] > 60 ? -1 : 1) * 0.6;
      this.px[i] += s * Math.sin(now / 260 + this.pph[i]) * 6;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    const now = this.now;
    if (this.reduced) {
      this.drawFlags(g, 0);
      return;
    }
    // mosaico (cartões levantados) atrás do gol da esquerda e na arquibancada de cima
    if (now < this.tifoUntil) this.drawTifo(g, now);
    // ola: os torcedores levantam (cabeça 1 px acima + braços) quando a onda passa
    const olaT = now - this.olaAt;
    if (olaT >= 0 && olaT < OLA_MS) {
      const p = olaT / OLA_MS;
      for (let i = 0; i < this.fx.length; i++) {
        let d = this.fang[i] - p;
        d -= Math.round(d);
        const ad = d < 0 ? -d : d;
        if (ad > 0.035) continue;
        const x = this.fx[i], y = this.fy[i];
        g.fillStyle = this.fbody[i];
        g.fillRect(x, y - 1, 1, 2);
        g.fillStyle = this.fhead[i];
        g.fillRect(x, y - 2, 1, 1);
        if (ad < 0.018) {
          g.fillStyle = "#f1c9a0";
          g.fillRect(x, y - 3, 1, 1);
        }
      }
    }
    this.drawFlags(g, now);
    // sinalizadores: ponto bem claro piscando com brilho em volta
    if (now < this.flareUntil) {
      for (let i = 0; i < this.nFlares; i++) {
        const x = this.flares[i * 2], y = this.flares[i * 2 + 1];
        const flick = ((now / 60 + i * 3) | 0) % 3;
        g.fillStyle = flick === 0 ? "#fff6c8" : flick === 1 ? "#ff7a2a" : "#ff3b1f";
        g.fillRect(x, y, 1, 1);
        g.fillStyle = "rgba(255,90,40,0.45)";
        g.fillRect(x - 1, y, 1, 1);
        g.fillRect(x + 1, y, 1, 1);
        g.fillRect(x, y - 1, 1, 1);
      }
    }
    // fumaça colorida
    for (let k = 0; k < MAX_SMOKE; k++) {
      const l = this.sl[k];
      if (l <= 0) continue;
      const age = 1 - l / 4200;
      const sz = 2 + Math.floor(age * 4);
      const col = this.smokeCol[this.sc[k]];
      const ai = Math.max(0, Math.min(col.length - 1, Math.floor((l / 4200) * col.length)));
      g.fillStyle = col[ai];
      g.fillRect(Math.round(this.sx[k] - sz / 2), Math.round(this.sy[k] - sz / 2), sz, sz);
    }
    // papel picado
    for (let i = 0; i < MAX_PAPER; i++) {
      if (this.pl[i] <= 0) continue;
      if (((now / 90 + i) | 0) % 4 === 0) continue; // girando: some e aparece
      g.fillStyle = this.paperCol[this.pc[i]];
      g.fillRect(Math.round(this.px[i]), Math.round(this.py[i]), 1, 1);
    }
  }

  private drawFlags(g: CanvasRenderingContext2D, now: number) {
    const [a, b, c] = this.flagCol;
    for (let k = 0; k < this.flags.length; k++) {
      const f = this.flags[k];
      for (let i = 0; i < f.w; i++) {
        // pano ondulando: cada coluna sobe/desce com uma onda que corre pela bandeira
        const off = this.reduced ? 0 : Math.round(Math.sin(now / 240 - i * 0.7 + f.ph) * 1);
        const x = f.x + i;
        for (let j = 0; j < f.h; j++) {
          let col: string;
          if (this.selecao) {
            // verde, losango amarelo e círculo azul
            const dx = Math.abs(i - (f.w - 1) / 2) / (f.w / 2), dy = Math.abs(j - (f.h - 1) / 2) / (f.h / 2);
            col = dx * dx + dy * dy < 0.18 ? c : dx + dy < 0.85 ? b : a;
          } else {
            // listras do clube + faixa central
            const band = f.w > f.h ? j : i;
            const size = f.w > f.h ? f.h : f.w;
            col = band < size / 3 ? a : band < (2 * size) / 3 ? b : a;
            if (f.w > f.h && j === Math.floor(f.h / 2) && i > 2 && i < f.w - 3) col = c;
          }
          g.fillStyle = col;
          g.fillRect(x, f.y + j + off, 1, 1);
        }
      }
      // mastro
      g.fillStyle = "#d8d8d8";
      g.fillRect(f.x - 1, f.y - 1, 1, f.h + 2);
    }
  }

  private drawTifo(g: CanvasRenderingContext2D, now: number) {
    const [a, b, c] = this.flagCol;
    // atrás do gol da esquerda: faixas horizontais com um "escudo" no meio
    for (let y = 14; y <= 121; y++) {
      for (let x = 0; x <= 11; x++) {
        const dy = (y - 67) / 18, dx = (x - 5.5) / 5;
        let col = Math.floor(y / 9) % 2 ? a : b;
        if (dx * dx + dy * dy < 1) col = c === a || c === b ? (col === a ? b : a) : c;
        // cartões tremendo: alguns falham de vez em quando
        if (((x * 7 + y * 13 + ((now / 400) | 0)) % 29) === 0) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    // arquibancada de cima (fora dos bancos): xadrez nas cores do clube
    for (let y = 2; y <= 8; y++) {
      for (let x = 0; x < W; x++) {
        if (x > 60 && x < 136) continue;
        const col = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? a : b;
        if (((x * 5 + y * 11 + ((now / 400) | 0)) % 31) === 0) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}
