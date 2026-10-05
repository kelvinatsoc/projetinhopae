// Escalação automática (usada pela IA e pelo botão "Escalar automaticamente").
import { FORMATIONS, ovrAt, POS_GROUP } from "./positions";
import type { Club, Lineup, Player, World } from "./types";

export function isAvailable(p: Player, compId?: string): boolean {
  if (p.injury > 0) return false;
  if (compId && (p.bans[compId] ?? 0) > 0) return false;
  return true;
}

export function squadOf(w: World, club: Club, includeYouth = false): Player[] {
  const out: Player[] = [];
  for (const id of club.players) {
    const p = w.players[id];
    if (p && (includeYouth || !p.youth)) out.push(p);
  }
  return out;
}

const selectScore = (p: Player, pos: Parameters<typeof ovrAt>[1], rotate: boolean) => {
  const base = ovrAt(p, pos);
  const cond = rotate ? 0.55 + 0.45 * (p.cond / 100) : 0.8 + 0.2 * (p.cond / 100);
  return base * cond + (p.morale - 50) * 0.02;
};

/** Melhor escalação para uma formação (atribuição gulosa jogador x posição). */
export function autoLineup(w: World, club: Club, compId?: string, formation = club.tactic.formation, rotate = true): Lineup {
  const slots = FORMATIONS[formation] ?? FORMATIONS["4-3-3"];
  let pool = squadOf(w, club).filter((p) => isAvailable(p, compId));
  if (pool.length < 14) pool = squadOf(w, club, true).filter((p) => isAvailable(p, compId));
  const pairs: { s: number; p: Player; score: number }[] = [];
  slots.forEach((slot, s) => {
    for (const p of pool) pairs.push({ s, p, score: selectScore(p, slot.pos, rotate) });
  });
  pairs.sort((a, b) => b.score - a.score);
  const starters: (number | null)[] = slots.map(() => null);
  const used = new Set<number>();
  for (const { s, p } of pairs) {
    if (starters[s] !== null || used.has(p.id)) continue;
    starters[s] = p.id;
    used.add(p.id);
  }
  const bench = pickBench(pool.filter((p) => !used.has(p.id)));
  const captain = [...used].map((id) => w.players[id]).sort((a, b) => b.fame + b.ovr - (a.fame + a.ovr))[0]?.id;
  return { starters, bench, captain };
}

function pickBench(rest: Player[]): number[] {
  const bench: Player[] = [];
  const byOvr = rest.slice().sort((a, b) => b.ovr - a.ovr);
  const gk = byOvr.find((p) => p.pos === "GOL");
  if (gk) bench.push(gk);
  for (const g of ["DEF", "MID", "ATT"] as const) {
    const p = byOvr.find((x) => !bench.includes(x) && POS_GROUP[x.pos] === g);
    if (p) bench.push(p);
  }
  for (const p of byOvr) {
    if (bench.length >= 9) break;
    if (!bench.includes(p) && p.pos !== "GOL") bench.push(p);
  }
  return bench.map((p) => p.id);
}

/** Garante que a escalação salva do usuário é válida para o jogo (troca lesionados/suspensos). */
export function validLineup(w: World, club: Club, compId?: string): Lineup {
  const saved = club.lineup;
  if (!saved) return autoLineup(w, club, compId, club.tactic.formation, false);
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  const ok = (id: number | null | undefined) => {
    if (id == null) return false;
    const p = w.players[id];
    return !!p && p.clubId === club.id && isAvailable(p, compId);
  };
  const starters = slots.map((_, i) => (ok(saved.starters[i]) ? saved.starters[i] : null));
  const used = new Set(starters.filter((x): x is number => x !== null));
  let bench = saved.bench.filter((id) => ok(id) && !used.has(id));
  // preenche buracos com o melhor disponível (primeiro do banco)
  starters.forEach((id, i) => {
    if (id !== null) return;
    const pool = [...bench.map((b) => w.players[b]), ...squadOf(w, club, true).filter((p) => isAvailable(p, compId))]
      .filter((p) => !used.has(p.id));
    pool.sort((a, b) => ovrAt(b, slots[i].pos) - ovrAt(a, slots[i].pos));
    const best = pool[0];
    if (best) {
      starters[i] = best.id;
      used.add(best.id);
      bench = bench.filter((b) => b !== best.id);
    }
  });
  if (bench.length < 5) {
    const extra = pickBench(squadOf(w, club).filter((p) => isAvailable(p, compId) && !used.has(p.id) && !bench.includes(p.id)));
    bench = [...bench, ...extra].slice(0, 9);
  }
  return { starters, bench, captain: saved.captain && used.has(saved.captain) ? saved.captain : undefined };
}

/** Força média do time titular (para exibir e para a IA). */
export function lineupStrength(w: World, club: Club, lineup: Lineup): number {
  const slots = FORMATIONS[club.tactic.formation] ?? FORMATIONS["4-3-3"];
  let s = 0, n = 0;
  lineup.starters.forEach((id, i) => {
    if (id == null) return;
    s += ovrAt(w.players[id], slots[i].pos);
    n++;
  });
  return n ? s / 11 : 0;
}

export function clubStrength(w: World, club: Club): number {
  return lineupStrength(w, club, autoLineup(w, club, undefined, club.tactic.formation, false));
}

/** A IA escolhe a formação que melhor encaixa no elenco. */
export function bestFormationFor(w: World, club: Club): string {
  let best = club.tactic.formation, bestS = -1;
  for (const f of ["4-3-3", "4-4-2", "4-2-3-1", "4-1-4-1", "3-5-2", "4-4-2 losango"]) {
    const l = autoLineup(w, club, undefined, f, false);
    const slots = FORMATIONS[f];
    let s = 0;
    l.starters.forEach((id, i) => { if (id != null) s += ovrAt(w.players[id], slots[i].pos); });
    if (s > bestS + 2) { bestS = s; best = f; }
  }
  return best;
}
