import type { Attrs, Player, Pos } from "./types";

export const POSITIONS: Pos[] = ["GOL", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "PD", "PE", "ATA"];

export const POS_NAME: Record<Pos, string> = {
  GOL: "Goleiro",
  ZAG: "Zagueiro",
  LD: "Lateral-direito",
  LE: "Lateral-esquerdo",
  VOL: "Volante",
  MC: "Meio-campista",
  MEI: "Meia",
  PD: "Ponta-direita",
  PE: "Ponta-esquerda",
  ATA: "Atacante",
};

/** Setor da posição: usado para ordenar listas e montar linhas do time. */
export const POS_GROUP: Record<Pos, "GK" | "DEF" | "MID" | "ATT"> = {
  GOL: "GK", ZAG: "DEF", LD: "DEF", LE: "DEF", VOL: "MID", MC: "MID", MEI: "MID", PD: "ATT", PE: "ATT", ATA: "ATT",
};

export const POS_ORDER: Record<Pos, number> = {
  GOL: 0, LD: 1, ZAG: 2, LE: 3, VOL: 4, MC: 5, MEI: 6, PD: 7, PE: 8, ATA: 9,
};

type W = Partial<Record<keyof Attrs, number>>;

/** Peso de cada atributo no overall de cada posição. */
export const WEIGHTS: Record<Pos, W> = {
  GOL: { gol: 0.86, pas: 0.04, fis: 0.05, vel: 0.05 },
  ZAG: { def: 0.52, fis: 0.26, vel: 0.1, pas: 0.1, dri: 0.02 },
  LD: { def: 0.34, vel: 0.24, pas: 0.18, fis: 0.12, dri: 0.12 },
  LE: { def: 0.34, vel: 0.24, pas: 0.18, fis: 0.12, dri: 0.12 },
  VOL: { def: 0.4, pas: 0.28, fis: 0.2, dri: 0.08, vel: 0.04 },
  MC: { pas: 0.38, dri: 0.2, def: 0.14, fis: 0.14, fin: 0.08, vel: 0.06 },
  MEI: { pas: 0.32, dri: 0.3, fin: 0.2, vel: 0.1, fis: 0.04, def: 0.04 },
  PD: { vel: 0.28, dri: 0.34, fin: 0.2, pas: 0.14, fis: 0.04 },
  PE: { vel: 0.28, dri: 0.34, fin: 0.2, pas: 0.14, fis: 0.04 },
  ATA: { fin: 0.5, vel: 0.14, dri: 0.14, fis: 0.16, pas: 0.06 },
};

/** Perfil típico (diferença em relação ao overall) para gerar atributos. */
export const PROFILE: Record<Pos, Attrs> = {
  GOL: { gol: 2, vel: -22, fin: -45, pas: -22, dri: -32, def: -30, fis: -8 },
  ZAG: { def: 5, fis: 3, vel: -6, pas: -8, dri: -15, fin: -25, gol: 0 },
  LD: { def: 0, vel: 3, pas: -2, fis: -3, dri: -3, fin: -18, gol: 0 },
  LE: { def: 0, vel: 3, pas: -2, fis: -3, dri: -3, fin: -18, gol: 0 },
  VOL: { def: 4, pas: 0, fis: 2, dri: -6, vel: -6, fin: -15, gol: 0 },
  MC: { pas: 4, dri: 1, def: -5, fis: -3, fin: -6, vel: -4, gol: 0 },
  MEI: { pas: 4, dri: 5, fin: 1, vel: -2, fis: -10, def: -22, gol: 0 },
  PD: { vel: 5, dri: 5, fin: -1, pas: -4, fis: -10, def: -25, gol: 0 },
  PE: { vel: 5, dri: 5, fin: -1, pas: -4, fis: -10, def: -25, gol: 0 },
  ATA: { fin: 6, vel: 1, dri: 0, fis: 1, pas: -8, def: -30, gol: 0 },
};

export const ATTR_NAMES: Record<keyof Attrs, string> = {
  vel: "Velocidade",
  fin: "Finalização",
  pas: "Passe",
  dri: "Drible",
  def: "Marcação",
  fis: "Físico",
  gol: "Goleiro",
};

export function rawOvr(a: Attrs, pos: Pos): number {
  const w = WEIGHTS[pos];
  let s = 0;
  for (const k in w) s += (a[k as keyof Attrs] ?? 0) * (w[k as keyof Attrs] ?? 0);
  return Math.round(s);
}

// Penalidade por jogar fora da posição (em pontos de overall).
const NEAR: Record<Pos, Partial<Record<Pos, number>>> = {
  GOL: {},
  ZAG: { VOL: 6, LD: 7, LE: 7 },
  LD: { LE: 5, PD: 7, ZAG: 7, VOL: 9, MC: 10 },
  LE: { LD: 5, PE: 7, ZAG: 7, VOL: 9, MC: 10 },
  VOL: { MC: 3, ZAG: 6, MEI: 7, LD: 9, LE: 9 },
  MC: { VOL: 3, MEI: 3, PD: 8, PE: 8 },
  MEI: { MC: 3, PD: 5, PE: 5, ATA: 6, VOL: 7 },
  PD: { PE: 4, MEI: 5, ATA: 6, LD: 8, MC: 9 },
  PE: { PD: 4, MEI: 5, ATA: 6, LE: 8, MC: 9 },
  ATA: { PD: 6, PE: 6, MEI: 6 },
};

export function familiarityPenalty(p: Player, pos: Pos): number {
  if (p.pos === pos) return 0;
  if (p.sec.includes(pos)) return 1;
  if (pos === "GOL" || p.pos === "GOL") return 25;
  // Polivalente: adapta-se melhor às posições vizinhas
  const ver = !!p.traits?.includes("VER");
  const adj = (n: number) => (ver ? Math.max(1, n - 2) : n);
  let pen = 14;
  const near = NEAR[p.pos][pos];
  if (near !== undefined) pen = adj(near);
  else {
    // vizinho via posição secundária
    for (const s of p.sec) {
      const n = NEAR[s]?.[pos];
      if (n !== undefined) pen = Math.min(pen, adj(n) + 2);
    }
  }
  // treinando a posição nova no treino individual: a penalidade cai conforme o progresso
  if (p.tf?.k === "pos" && p.tf.pos === pos) pen = Math.max(1, Math.round(pen * (1 - p.tf.prog / 100)));
  return pen;
}

/** Overall do jogador numa posição específica (considera atributos + adaptação). */
export function ovrAt(p: Player, pos: Pos): number {
  return Math.max(1, rawOvr(p.attrs, pos) - familiarityPenalty(p, pos));
}

export function recalcOvr(p: Player) {
  p.ovr = rawOvr(p.attrs, p.pos);
}

// ---------------------------------------------------------------- formações
export interface Slot {
  pos: Pos;
  x: number; // 0 (esquerda) a 100 (direita)
  y: number; // 0 (próprio gol) a 100 (gol adversário)
}

const G: Slot = { pos: "GOL", x: 50, y: 5 };
const back4: Slot[] = [
  { pos: "LD", x: 86, y: 25 },
  { pos: "ZAG", x: 62, y: 19 },
  { pos: "ZAG", x: 38, y: 19 },
  { pos: "LE", x: 14, y: 25 },
];
const back3: Slot[] = [
  { pos: "ZAG", x: 72, y: 20 },
  { pos: "ZAG", x: 50, y: 17 },
  { pos: "ZAG", x: 28, y: 20 },
];

export const FORMATIONS: Record<string, Slot[]> = {
  "4-3-3": [G, ...back4,
    { pos: "VOL", x: 50, y: 38 }, { pos: "MC", x: 70, y: 50 }, { pos: "MC", x: 30, y: 50 },
    { pos: "PD", x: 82, y: 74 }, { pos: "ATA", x: 50, y: 82 }, { pos: "PE", x: 18, y: 74 }],
  "4-4-2": [G, ...back4,
    { pos: "PD", x: 85, y: 54 }, { pos: "MC", x: 60, y: 47 }, { pos: "MC", x: 40, y: 47 }, { pos: "PE", x: 15, y: 54 },
    { pos: "ATA", x: 61, y: 80 }, { pos: "ATA", x: 39, y: 80 }],
  "4-2-3-1": [G, ...back4,
    { pos: "VOL", x: 62, y: 39 }, { pos: "VOL", x: 38, y: 39 },
    { pos: "PD", x: 83, y: 64 }, { pos: "MEI", x: 50, y: 61 }, { pos: "PE", x: 17, y: 64 },
    { pos: "ATA", x: 50, y: 84 }],
  "4-1-4-1": [G, ...back4,
    { pos: "VOL", x: 50, y: 35 },
    { pos: "PD", x: 85, y: 57 }, { pos: "MC", x: 62, y: 52 }, { pos: "MC", x: 38, y: 52 }, { pos: "PE", x: 15, y: 57 },
    { pos: "ATA", x: 50, y: 82 }],
  "4-4-2 losango": [G, ...back4,
    { pos: "VOL", x: 50, y: 35 }, { pos: "MC", x: 72, y: 49 }, { pos: "MC", x: 28, y: 49 }, { pos: "MEI", x: 50, y: 63 },
    { pos: "ATA", x: 62, y: 82 }, { pos: "ATA", x: 38, y: 82 }],
  "3-5-2": [G, ...back3,
    { pos: "LD", x: 89, y: 48 }, { pos: "VOL", x: 62, y: 40 }, { pos: "VOL", x: 38, y: 40 }, { pos: "LE", x: 11, y: 48 },
    { pos: "MEI", x: 50, y: 61 },
    { pos: "ATA", x: 61, y: 81 }, { pos: "ATA", x: 39, y: 81 }],
  "5-3-2": [G,
    { pos: "LD", x: 89, y: 33 }, { pos: "ZAG", x: 70, y: 20 }, { pos: "ZAG", x: 50, y: 17 }, { pos: "ZAG", x: 30, y: 20 }, { pos: "LE", x: 11, y: 33 },
    { pos: "VOL", x: 50, y: 42 }, { pos: "MC", x: 70, y: 52 }, { pos: "MC", x: 30, y: 52 },
    { pos: "ATA", x: 61, y: 80 }, { pos: "ATA", x: 39, y: 80 }],
  "3-4-3": [G, ...back3,
    { pos: "LD", x: 87, y: 47 }, { pos: "MC", x: 61, y: 45 }, { pos: "MC", x: 39, y: 45 }, { pos: "LE", x: 13, y: 47 },
    { pos: "PD", x: 80, y: 75 }, { pos: "ATA", x: 50, y: 84 }, { pos: "PE", x: 20, y: 75 }],
  "4-2-4": [G, ...back4,
    { pos: "MC", x: 62, y: 45 }, { pos: "MEI", x: 38, y: 50 },
    { pos: "PD", x: 86, y: 73 }, { pos: "ATA", x: 61, y: 84 }, { pos: "ATA", x: 39, y: 84 }, { pos: "PE", x: 14, y: 73 }],
};

export const FORMATION_DESC: Record<string, string> = {
  "4-3-3": "Equilibrada, com pontas abertos",
  "4-4-2": "Clássica, dois atacantes",
  "4-2-3-1": "Dois volantes e um camisa 10",
  "4-1-4-1": "Compacta, meio-campo forte",
  "4-4-2 losango": "Meio em losango, jogo pelo centro",
  "3-5-2": "Três zagueiros e alas",
  "5-3-2": "Retranca segura",
  "3-4-3": "Ofensiva, três atacantes",
  "4-2-4": "Homenagem à Seleção de 58",
};

export const MENTALITY_NAMES: Record<number, string> = {
  [-2]: "Retranca",
  [-1]: "Defensiva",
  0: "Equilibrada",
  1: "Ofensiva",
  2: "Tudo ao ataque",
};

export const PRESSING_NAMES = ["Marcação baixa", "Marcação média", "Pressão alta"];
