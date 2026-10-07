// Lógica pura do modo "📼 Retrô PS1" (sem three.js, sem DOM): o retrato de um quadro da animação
// do campinho, a câmera de transmissão estilo Winning Eleven, o buffer do replay, a resolução
// interna e a quantização de 15 bits com pontilhado ordenado (a mesma conta roda no shader).
import { pitchToWorld, PITCH_LEN } from "../pitchGeom";

export type Ps1Pose = "kick" | "header" | "slide" | "fall" | "knee" | "flip" | "stepover" | "card" | "volley" | "bicycle" | "pass" | "save" | "special";

export interface Ps1Player {
  /** índice estável do jogador na animação */
  id: number;
  side: 0 | 1 | 2;
  grp: number;
  /** posição no mundo (metros) */
  x: number;
  z: number;
  vx: number;
  vz: number;
  walk: number;
  /** goleiro voando: 0..1 do salto (-1 = não) */
  dive: number;
  diveDir: number;
  down: boolean;
  arms: boolean;
  sad: boolean;
  pose: Ps1Pose | null;
  /** progresso da pose 0..1 */
  poseS: number;
  shirt: string;
  sleeve: string;
  pattern: string;
  stripe: string;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  num: number;
  name: string;
  /** visual individual (modo PS2): estilo de cabelo, altura -1/0/1, porte forte, barba */
  hairStyle?: string;
  tall?: number;
  broad?: boolean;
  beard?: boolean;
}

/** Golpe especial em andamento (para câmera lenta, close, brilho e rastro da bola). */
export interface Ps1Special {
  /** id do jogador que executa */
  who: number;
  name: string;
  colors: [string, string];
  /** ms desde o começo do golpe */
  t: number;
  /** a bola já chegou (impacto)? ms desde o impacto, -1 = ainda não */
  impact: number;
  save: boolean;
}

export interface Ps1Snapshot {
  now: number;
  players: Ps1Player[];
  ball: { x: number; z: number; h: number };
  /** id do jogador com a bola (ou para quem ela vai) */
  holder: number | null;
  celebrating: boolean;
  /** time que fez o último gol (para a câmera do replay) */
  goalSide: 0 | 1 | null;
  netShake: 0 | 1 | null;
  cheer: boolean;
  special?: Ps1Special | null;
}

/** Converte a posição do campinho (pixels do modo 2D) para metros do 3D. */
export function toWorld(x: number, y: number): [number, number] {
  return pitchToWorld(x, y);
}

/** Altura da bola: no 2D é em pixels de tela; aqui, metros (com teto para não sumir da câmera). */
export function ballHeight(h: number): number {
  return Math.min(9, Math.max(0, h * 0.55));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpola dois retratos (replay gravado a ~30 Hz tocado na taxa da tela). */
export function lerpSnapshot(a: Ps1Snapshot, b: Ps1Snapshot, t: number): Ps1Snapshot {
  const byId = new Map(b.players.map((p) => [p.id, p]));
  return {
    ...(t < 0.5 ? a : b),
    now: lerp(a.now, b.now, t),
    players: a.players.map((p) => {
      const q = byId.get(p.id);
      if (!q) return p;
      return { ...(t < 0.5 ? p : q), x: lerp(p.x, q.x, t), z: lerp(p.z, q.z, t), walk: lerp(p.walk, q.walk, t) };
    }),
    ball: { x: lerp(a.ball.x, b.ball.x, t), z: lerp(a.ball.z, b.ball.z, t), h: lerp(a.ball.h, b.ball.h, t) },
  };
}

/** Guarda os últimos segundos de jogo para o replay do gol. */
export class ReplayBuffer {
  frames: Ps1Snapshot[] = [];
  constructor(public seconds = 5, public hz = 30) {}
  push(s: Ps1Snapshot) {
    const last = this.frames[this.frames.length - 1];
    if (last && s.now - last.now < 1000 / this.hz - 0.5) return;
    if (last && s.now < last.now) this.frames = [];
    this.frames.push(s);
    const cut = s.now - this.seconds * 1000;
    while (this.frames.length > 2 && this.frames[0].now < cut) this.frames.shift();
  }
  /** Copia os quadros até o momento do gol (inclusive um pouco depois). */
  clip(): Ps1Snapshot[] {
    return this.frames.slice();
  }
  /** Quadro do clip no tempo t (ms desde o começo do clip). */
  static at(clip: Ps1Snapshot[], t: number): Ps1Snapshot | null {
    if (!clip.length) return null;
    const t0 = clip[0].now + t;
    if (t0 <= clip[0].now) return clip[0];
    for (let i = 1; i < clip.length; i++) {
      if (clip[i].now >= t0) {
        const a = clip[i - 1], b = clip[i];
        const span = b.now - a.now;
        return lerpSnapshot(a, b, span > 0 ? (t0 - a.now) / span : 1);
      }
    }
    return clip[clip.length - 1];
  }
  static duration(clip: Ps1Snapshot[]): number {
    return clip.length < 2 ? 0 : clip[clip.length - 1].now - clip[0].now;
  }
}

export interface CamPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

/**
 * Câmera de transmissão do Winning Eleven: de lado, no alto da arquibancada, acompanhando a bola
 * no comprimento do campo (sem passar das áreas) e chegando um pouco mais perto perto do gol.
 */
export function broadcastCam(ballX: number, ballZ: number, aspect: number): CamPose {
  const half = PITCH_LEN / 2;
  const lim = half - (aspect > 1.5 ? 14 : 10);
  const fx = Math.max(-lim, Math.min(lim, ballX));
  const nearGoal = Math.max(0, (Math.abs(ballX) - 30) / (half - 30));
  const zoom = 1 - 0.14 * nearGoal;
  const dist = (aspect < 1.5 ? 58 : 47) * zoom;
  const fz = Math.max(-12, Math.min(14, ballZ * 0.45));
  return {
    pos: [fx, dist * 0.47, fz + dist],
    look: [fx, 0, fz - 2],
    fov: aspect < 1.5 ? 34 : 30,
  };
}

/** Replay do gol: câmera atrás do gol que levou o gol, baixa, olhando o lance. */
export function behindGoalCam(goalSide: 0 | 1, _ballX: number, ballZ: number): CamPose {
  // o time 0 ataca para a direita (x positivo)
  const dir = goalSide === 0 ? 1 : -1;
  const gx = dir * (PITCH_LEN / 2 + 6.5);
  return {
    pos: [gx, 4.2, ballZ * 0.2 + 1.5],
    look: [dir * (PITCH_LEN / 2 - 22), 0.8, ballZ * 0.45],
    fov: 52,
  };
}

/** Suaviza a câmera (independente da taxa de quadros). */
export function easeCam(cur: CamPose, to: CamPose, dt: number, tau = 260): CamPose {
  const k = 1 - Math.exp(-dt / tau);
  const m = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  return { pos: m(cur.pos, to.pos), look: m(cur.look, to.look), fov: lerp(cur.fov, to.fov, k) };
}

/** Resolução interna: 240 linhas, largura conforme a tela (4:3 até 2:1, o resto vira tarja preta). */
export function internalRes(cssW: number, cssH: number): { w: number; h: number; aspect: number } {
  const h = 240;
  const aspect = Math.max(4 / 3, Math.min(2, cssW / Math.max(1, cssH)));
  const w = Math.round((h * aspect) / 2) * 2;
  return { w, h, aspect: w / h };
}

/** Matriz de Bayer 4x4 (pontilhado ordenado do PS1), valores -0.5..0.5. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

/** Canal 0..255 quantizado a 5 bits (15-bit color) com o pontilhado do pixel (x, y). */
export function quant15(c: number, x: number, y: number): number {
  const d = BAYER4[(y & 3) * 4 + (x & 3)] * 8;
  const q = Math.round(Math.max(0, Math.min(255, c + d)) / (255 / 31));
  return Math.round(q * (255 / 31));
}

/** Nome curto para a caixa do jogador (sem acento, maiúsculo, o sobrenome/apelido). */
export function hudName(full: string): string {
  const clean = full.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 .'-]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const last = parts[parts.length - 1];
  const name = parts.length > 1 && last.length <= 2 ? parts.slice(-2).join(" ") : last;
  return name.slice(0, 12);
}

/** Sigla de 3 letras para o placar. */
export function hudAbbr(abbr: string | undefined, name: string): string {
  const src = (abbr && abbr.trim()) || name;
  return src.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "???";
}

/** Ângulo (em torno do eixo vertical) para quem corre na direção (vx, vz); o boneco olha para +z. */
export function facingAngle(vx: number, vz: number, prev: number): number {
  if (Math.hypot(vx, vz) < 1e-4) return prev;
  return Math.atan2(vx, vz);
}

/** Close de TV no jogador do golpe especial: baixa, do lado da câmera principal, olhando o jogador. */
export function closeUpCam(x: number, z: number, attackDir: 1 | -1, t: number): CamPose {
  // gira devagar em volta do jogador, do lado da câmera principal (z positivo), meio de frente
  const orbit = Math.min(1, t / 1600) * 0.45;
  const ang = attackDir * (0.75 - orbit);
  const r = 11 - orbit * 2.5;
  return {
    pos: [x + Math.sin(ang) * r, 3.0 - orbit * 0.6, z + Math.cos(ang) * r],
    look: [x + attackDir * 0.8, 1.1, z],
    fov: 34,
  };
}

/** Resolução interna do modo PS2: alta (até 1,5× a tela em CSS, teto de 1600 px de largura). */
export function hdRes(cssW: number, cssH: number, dpr: number, q = 1): { w: number; h: number; aspect: number } {
  const aspect = Math.max(1, Math.min(2.2, cssW / Math.max(1, cssH)));
  const k = Math.min(dpr, 2) * q;
  const w = Math.min(1600, Math.round((cssW * k) / 2) * 2);
  const h = Math.round(w / aspect / 2) * 2;
  return { w, h, aspect: w / h };
}
