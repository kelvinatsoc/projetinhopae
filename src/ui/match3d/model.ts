// Lógica pura da partida em 3D (sem three.js, sem DOM): o retrato de um quadro da animação do
// campinho, as câmeras (transmissão, replay, close, câmera livre), o buffer do replay e a
// resolução de renderização por nível de qualidade.
import { pitchToWorld, PITCH_LEN } from "../pitchGeom";

export type Pose3D = "kick" | "header" | "slide" | "fall" | "knee" | "flip" | "stepover" | "card" | "volley" | "bicycle" | "pass" | "save" | "special";

export interface Player3D {
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
  pose: Pose3D | null;
  /** progresso da pose 0..1 */
  poseS: number;
  shirt: string;
  sleeve: string;
  pattern: string;
  stripe: string;
  /** uniforme real ("clubId:índice"): o tronco usa makeKitTexture (src/ui/kitTexture.ts) */
  kit?: string;
  shorts: string;
  socks: string;
  skin: string;
  hair: string;
  num: number;
  name: string;
  /** visual individual: estilo de cabelo, altura -1/0/1, porte forte, barba */
  hairStyle?: string;
  tall?: number;
  broad?: boolean;
  beard?: boolean;
}

/** Golpe especial em andamento (para câmera lenta, close, brilho e rastro da bola). */
export interface Special3D {
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

export interface MatchSnapshot {
  now: number;
  players: Player3D[];
  ball: { x: number; z: number; h: number };
  /** id do jogador com a bola (ou para quem ela vai) */
  holder: number | null;
  celebrating: boolean;
  /** time que fez o último gol (para a câmera do replay) */
  goalSide: 0 | 1 | null;
  netShake: 0 | 1 | null;
  cheer: boolean;
  special?: Special3D | null;
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
export function lerpSnapshot(a: MatchSnapshot, b: MatchSnapshot, t: number): MatchSnapshot {
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
  frames: MatchSnapshot[] = [];
  constructor(public seconds = 5, public hz = 30) {}
  push(s: MatchSnapshot) {
    const last = this.frames[this.frames.length - 1];
    if (last && s.now - last.now < 1000 / this.hz - 0.5) return;
    if (last && s.now < last.now) this.frames = [];
    this.frames.push(s);
    const cut = s.now - this.seconds * 1000;
    while (this.frames.length > 2 && this.frames[0].now < cut) this.frames.shift();
  }
  /** Copia os quadros até o momento do gol (inclusive um pouco depois). */
  clip(): MatchSnapshot[] {
    return this.frames.slice();
  }
  /** Quadro do clip no tempo t (ms desde o começo do clip). */
  static at(clip: MatchSnapshot[], t: number): MatchSnapshot | null {
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
  static duration(clip: MatchSnapshot[]): number {
    return clip.length < 2 ? 0 : clip[clip.length - 1].now - clip[0].now;
  }
}

export interface CamPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

/**
 * Câmera de transmissão de TV: de lado, no alto da arquibancada, acompanhando a bola
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

/** Qualidade gráfica (só desempenho): Alta é o padrão. */
export type Quality = "alta" | "media" | "baixa";

/** Resolução de renderização: escala de pixels por nível (alta = até 2x, teto de 2000 px de largura). */
export function renderRes(cssW: number, cssH: number, dpr: number, q: Quality, dyn = 1): { w: number; h: number; ratio: number } {
  const cap = q === "alta" ? 2 : q === "media" ? 1.5 : 1;
  let ratio = Math.max(0.5, Math.min(dpr, cap) * dyn);
  if (cssW * ratio > 2000) ratio = 2000 / cssW;
  return { w: Math.round(cssW * ratio), h: Math.round(cssH * ratio), ratio };
}

export interface FreeCam {
  /** giro em volta do alvo (rad) e inclinação (rad, 0.08..1.45) */
  yaw: number;
  pitch: number;
  /** distância ao alvo (m) */
  dist: number;
  /** deslocamento do alvo no gramado */
  panX: number;
  panZ: number;
}

export const FREE_MIN = 4;
export const FREE_MAX = 175;

/** Limita a câmera livre (do close no jogador ao estádio inteiro). */
export function clampFree(f: FreeCam): FreeCam {
  return {
    yaw: f.yaw,
    // de longe, a câmera sobe acima das arquibancadas (nunca fica atrás do paredão)
    pitch: Math.max(0.08, Math.asin(Math.min(0.95, 62 / Math.max(1, f.dist))) * Math.min(1, Math.max(0, (f.dist - 25) / 30)), Math.min(1.45, f.pitch)),
    dist: Math.max(FREE_MIN, Math.min(FREE_MAX, f.dist)),
    panX: Math.max(-70, Math.min(70, f.panX)),
    panZ: Math.max(-50, Math.min(50, f.panZ)),
  };
}

/** Pose da câmera livre: orbita o alvo (bola + deslocamento). */
export function freeCamPose(f: FreeCam, tx: number, tz: number): CamPose {
  const c = Math.cos(f.pitch);
  const x = tx + f.panX, z = tz + f.panZ;
  return {
    pos: [x + Math.sin(f.yaw) * c * f.dist, 0.6 + Math.sin(f.pitch) * f.dist, z + Math.cos(f.yaw) * c * f.dist],
    look: [x, f.dist < 12 ? 1.1 : 0.4, z],
    fov: 40,
  };
}

/** Câmera livre a partir da pose da TV (para a transição não dar pulo). */
export function freeFromPose(c: CamPose): FreeCam {
  const dx = c.pos[0] - c.look[0], dy = c.pos[1] - c.look[1], dz = c.pos[2] - c.look[2];
  const dist = Math.hypot(dx, dy, dz);
  return clampFree({ yaw: Math.atan2(dx, dz), pitch: Math.asin(dy / Math.max(1e-3, dist)), dist, panX: 0, panZ: 0 });
}
