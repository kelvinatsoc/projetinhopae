// Simulação rápida (Poisson sobre a força das escalações) para jogos do mundo sem o usuário:
// ligas estrangeiras, Champions/Europa League e seleções. Usa o rng do motor (determinística).
import { isAvailable } from "./lineup";
import { chance, pickWeighted, rand } from "./rng";
import type { MatchEvent, MatchResult, Player, Pos } from "./types";

const SCORE_W: Record<Pos, number> = { GOL: 0.02, ZAG: 0.5, LD: 0.45, LE: 0.45, VOL: 0.7, MC: 1.1, MEI: 2.2, PD: 2.6, PE: 2.6, ATA: 4.5 };
const ASSIST_W: Record<Pos, number> = { GOL: 0.05, ZAG: 0.4, LD: 1.2, LE: 1.2, VOL: 0.9, MC: 1.8, MEI: 2.8, PD: 2.4, PE: 2.4, ATA: 1.6 };
const DEF = new Set<Pos>(["ZAG", "LD", "LE", "VOL"]);

/** Os 11 da simulação rápida: o melhor goleiro e os 10 melhores de linha disponíveis (com algum equilíbrio defensivo). */
export function quickEleven(players: Player[], compId?: string, forClubId?: string): Player[] {
  const avail = players.filter((p) => isAvailable(p, compId, forClubId)).sort((a, b) => b.ovr - a.ovr);
  const gk = avail.find((p) => p.pos === "GOL");
  const out = avail.filter((p) => p.pos !== "GOL");
  const defs = out.filter((p) => DEF.has(p.pos)).slice(0, 4);
  const rest = out.filter((p) => !defs.includes(p)).slice(0, 10 - defs.length);
  return [...(gk ? [gk] : []), ...defs, ...rest];
}

/** Força de uma escalação (média dos overalls; faltando gente, completa com `fallback`). */
export function elevenStrength(xi: Player[], fallback: number): number {
  let s = 0;
  for (const p of xi) s += p.ovr * (0.85 + 0.15 * (p.cond / 100));
  return (s + Math.max(0, 11 - xi.length) * fallback) / 11;
}

function poisson(l: number): number {
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L && k < 12);
  return k - 1;
}

/** Gols esperados (mandante, visitante) para forças sH/sA. */
export function expectedGoals(sH: number, sA: number, neutral: boolean): [number, number] {
  const d = sH - sA;
  const base = neutral ? [1.25, 1.25] : [1.42, 1.1];
  return [base[0] * Math.exp(d / 13), base[1] * Math.exp(-d / 13)];
}

/**
 * Resultado rápido entre duas escalações já escolhidas. Gera gols (com autor e assistência), cartões,
 * notas simples e o melhor em campo. `knockout` decide nos pênaltis em caso de empate (o chamador diz quando).
 */
export function quickResult(
  xiH: Player[], xiA: Player[], sH: number, sA: number, opts: { neutral?: boolean; penalties?: boolean } = {},
): MatchResult {
  const [lH, lA] = expectedGoals(sH, sA, !!opts.neutral);
  const hg = poisson(lH), ag = poisson(lA);
  const events: MatchEvent[] = [];
  const ratings: Record<number, number> = {};
  for (const p of xiH) ratings[p.id] = 6.3 + (hg > ag ? 0.4 : hg < ag ? -0.3 : 0);
  for (const p of xiA) ratings[p.id] = 6.3 + (ag > hg ? 0.4 : ag < hg ? -0.3 : 0);
  const goals = (xi: Player[], n: number, side: 0 | 1) => {
    for (let i = 0; i < n; i++) {
      const min = 1 + Math.floor(rand() * 90);
      if (!xi.length) { events.push({ min, type: "goal", side, text: "Gol" }); continue; }
      const sc = pickWeighted(xi, xi.map((p) => SCORE_W[p.pos] * (p.ovr / 70) ** 3));
      const others = xi.filter((p) => p !== sc);
      const as = others.length && chance(0.65) ? pickWeighted(others, others.map((p) => ASSIST_W[p.pos])) : undefined;
      ratings[sc.id] += 1;
      if (as) ratings[as.id] += 0.5;
      events.push({ min, type: "goal", side, pid: sc.id, pid2: as?.id, text: `Gol de ${sc.name}`, key: true });
    }
  };
  goals(xiH, hg, 0);
  goals(xiA, ag, 1);
  const yel: [number, number] = [0, 0];
  ([xiH, xiA] as const).forEach((xi, side) => {
    const n = poisson(1.9);
    for (let i = 0; i < n && xi.length; i++) {
      const p = xi[1 + Math.floor(rand() * (xi.length - 1))] ?? xi[0];
      yel[side]++;
      ratings[p.id] -= 0.2;
      events.push({ min: 1 + Math.floor(rand() * 90), type: "yellow", side: side as 0 | 1, pid: p.id, text: `Amarelo para ${p.name}` });
    }
  });
  events.sort((a, b) => a.min - b.min);
  for (const k of Object.keys(ratings)) ratings[+k] = Math.round(Math.max(4, Math.min(10, ratings[+k])) * 10) / 10;
  let motm: number | undefined;
  for (const [k, v] of Object.entries(ratings)) if (motm === undefined || v > ratings[motm]) motm = +k;
  const possH = Math.round(Math.max(30, Math.min(70, 50 + (sH - sA) * 1.2)));
  const r: MatchResult = {
    hg, ag, events, ratings, motm,
    lineups: [xiH.map((p) => p.id), xiA.map((p) => p.id)],
    stats: {
      poss: [possH, 100 - possH], shots: [hg * 3 + 6 + Math.floor(rand() * 5), ag * 3 + 5 + Math.floor(rand() * 5)],
      onTarget: [hg + 2, ag + 2], corners: [4, 4], fouls: [12, 12], yellows: yel, reds: [0, 0],
      xg: [Math.round(lH * 100) / 100, Math.round(lA * 100) / 100],
    },
  };
  if (opts.penalties && hg === ag) {
    let a = 3 + Math.floor(rand() * 3), b = 3 + Math.floor(rand() * 3);
    if (a === b) { if (rand() < 0.5) a++; else b++; }
    r.pens = [a, b];
  }
  return r;
}
