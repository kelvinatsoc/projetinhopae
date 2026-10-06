// Torcida brasileira: quem canta no estádio, com que força e o que ela sente a cada minuto.
// Lógica pura (sem DOM nem Web Audio), testada em tests/torcida.test.ts. Usada pelo mixador de
// som (audio.ts) e pelas animações das arquibancadas (MatchView 2D e o 3D Retrô PS1).
//
// Só clubes brasileiros e a Seleção Brasileira ganham a torcida "completa" (cantos, olé, vaia,
// sinalizadores, bandeirões). Clubes estrangeiros mandantes continuam com o som genérico.
import type { Club } from "../engine/types";

/** Ids que o jogo usa (ou pode usar) para a Seleção Brasileira. */
const SELECAO_IDS = new Set(["nt-BRA", "brasil", "selecao", "selecao-brasileira"]);

export function isSelecao(c: Pick<Club, "id">): boolean {
  return SELECAO_IDS.has(c.id);
}

export function isBrazilian(c: Pick<Club, "id" | "country">): boolean {
  return c.country === "BRA" || isSelecao(c);
}

/**
 * Gravações reais de torcida por clube (id do jogo -> arquivos em media/audio/).
 * Só entra aqui o clube que tem gravação livre da própria torcida; o resto usa o canto genérico.
 */
export const CLUB_TORCIDA: Record<string, { chant?: string; goal?: string }> = {
  vasco: { chant: "audio/br/vasco-canto.m4a", goal: "audio/br/vasco-gol.m4a" },
  gremio: { goal: "audio/br/gremio-gol.m4a" },
};

/** Sons da torcida brasileira genérica e da Seleção (caminhos relativos a media/). */
export const BR_SOUNDS = {
  bed: "audio/br/arquibancada.m4a", // ambiente de arquibancada cheia, em laço
  chant: "audio/br/canto.m4a", // canto de arquibancada genérico, em laço
  goal: ["audio/br/gol.m4a", "audio/br/gol2.m4a"], // explosão no gol
  ooh: "audio/br/uh.m4a", // "uhhh!" numa chance
  boo: "audio/br/vaia.m4a", // vaia
  ole: "audio/br/ole.m4a", // olé / festa (ola na arquibancada)
  selecaoBed: "audio/br/selecao.m4a", // ambiente de jogo da Seleção
  selecaoChant: "audio/br/selecao-canto.m4a", // torcida da Seleção cantando
} as const;

export interface CrowdProfile {
  /** torcida brasileira completa (cantos, olé, vaia...) */
  brazilian: boolean;
  selecao: boolean;
  /** tamanho da torcida 0..1 (reputação do mandante × capacidade do estádio) */
  size: number;
  /** id do clube cuja torcida domina o estádio (mandante, ou o time do usuário em campo neutro) */
  clubId: string;
  /** a torcida dominante é a do lado 0 (mandante) ou 1 */
  side: 0 | 1;
  /** caminhos dos sons */
  bed: string;
  chant: string;
  goal: string[];
  /** a torcida deste clube tem gravação própria */
  clubSpecific: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Tamanho da torcida (0..1): reputação do clube pesa mais; estádio grande enche o som. */
export function crowdSize(c: Pick<Club, "rep" | "capacity">, neutral = false): number {
  const rep = clamp01((c.rep ?? 50) / 100);
  const cap = clamp01(Math.log10(Math.max(1000, c.capacity || 5000) / 1000) / Math.log10(80)); // 1 mil -> 0, 80 mil -> 1
  const s = 0.15 + 0.55 * rep + 0.3 * cap;
  return clamp01(neutral ? s * 0.8 : s);
}

/**
 * Perfil da torcida da partida. null = sem torcida brasileira (fica o som genérico de antes).
 * userSide decide a torcida em campo neutro (a do usuário, se for brasileiro).
 */
export function crowdProfile(home: Club, away: Club, neutral: boolean, userSide: 0 | 1 = 0): CrowdProfile | null {
  let side: 0 | 1 = 0;
  let club = home;
  if (neutral) {
    const mine = userSide === 0 ? home : away;
    const other = userSide === 0 ? away : home;
    if (isBrazilian(mine)) { club = mine; side = userSide; } else if (isBrazilian(other)) { club = other; side = (1 - userSide) as 0 | 1; } else return null;
  } else if (!isBrazilian(home)) return null;
  const selecao = isSelecao(club);
  const own = CLUB_TORCIDA[club.id];
  const bed = selecao ? BR_SOUNDS.selecaoBed : BR_SOUNDS.bed;
  const chant = selecao ? BR_SOUNDS.selecaoChant : own?.chant ?? BR_SOUNDS.chant;
  const goal = own?.goal ? [own.goal, ...BR_SOUNDS.goal] : [...BR_SOUNDS.goal];
  return {
    brazilian: true,
    selecao,
    size: selecao ? 1 : crowdSize(club, neutral),
    clubId: club.id,
    side,
    bed,
    chant,
    goal,
    clubSpecific: !!own,
  };
}

// ---------------------------------------------------------------- humor da torcida
export interface MoodInput {
  minute: number;
  /** gols [lado 0, lado 1] */
  goals: [number, number];
  /** posse acumulada (minutos com a bola) */
  poss: [number, number];
  shots: [number, number];
  /** quem atacou no último minuto (null = bola parada / intervalo) */
  atk: 0 | 1 | null;
  /** minutos seguidos com a bola do lado da torcida (pressão) */
  streak: number;
}

export interface Mood {
  /** força do ambiente 0..1.6 (1 = normal) */
  intensity: number;
  /** mistura do canto contínuo 0..1 */
  chant: number;
  /** a torcida está vaiando o próprio time */
  boo: boolean;
  /** a torcida grita "olé" (time dominando e ganhando) */
  ole: boolean;
}

/**
 * O que a torcida dominante (lado `side`) está sentindo agora. Função pura: o mesmo placar e as
 * mesmas estatísticas dão sempre o mesmo humor.
 */
export function crowdMood(m: MoodInput, side: 0 | 1, size: number): Mood {
  const o = (1 - side) as 0 | 1;
  const diff = m.goals[side] - m.goals[o];
  const totPoss = m.poss[0] + m.poss[1];
  const myPoss = totPoss > 0 ? m.poss[side] / totPoss : 0.5;
  const shotsDiff = m.shots[side] - m.shots[o];
  const late = m.minute >= 75;
  // base: torcida grande faz mais barulho; ataque do time levanta a arquibancada
  let intensity = 0.65 + 0.35 * size;
  if (m.atk === side) intensity += 0.15 + Math.min(0.25, m.streak * 0.06);
  else if (m.atk === o) intensity -= 0.08;
  if (diff > 0) intensity += Math.min(0.25, diff * 0.1);
  if (diff < 0) intensity -= Math.min(0.3, -diff * 0.12);
  if (late && diff === 0) intensity += 0.12; // fim de jogo empatado: pressão
  if (late && diff === -1) intensity += 0.1; // empurrando para o empate
  intensity = Math.max(0.35, Math.min(1.6, intensity));
  // vaia: perdendo por 2+, ou perdendo no fim e sendo dominado
  const boo = m.minute >= 20 && (diff <= -2 || (late && diff < 0 && (myPoss < 0.45 || shotsDiff < -3)));
  // olé: ganhando com folga e com a bola (troca de passes)
  const ole = m.minute >= 30 && diff >= 2 && m.atk === side && myPoss >= 0.52 && m.streak >= 2;
  const chant = boo ? 0.15 : Math.max(0.2, Math.min(1, 0.45 + 0.4 * size + (diff > 0 ? 0.15 : 0) - (diff < 0 ? 0.2 : 0)));
  return { intensity, chant, boo, ole };
}

// ---------------------------------------------------------------- visual
/** Força da festa nas arquibancadas (0..1): sinalizadores, bandeirões, mosaico. */
export function festaLevel(home: Pick<Club, "rep" | "capacity" | "country" | "id">, neutral: boolean): number {
  if (!isBrazilian(home)) return 0;
  return isSelecao(home) ? 1 : Math.max(0.25, crowdSize(home, neutral));
}
