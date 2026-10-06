import { progressHooks } from "./hooks";
// Ligas do mundo no ano civil (fev–dez): Argentina (Torneo Apertura e Clausura, em duas zonas + mata-mata)
// e MLS (conferências Leste/Oeste + playoffs). Formatos simplificados; jogos sem o usuário na simulação rápida.
import { dayOf, intlWindows, isClubWorldCupYear, isWorldCupYear, onOrAfter, spreadPick, weeklyPool } from "./calendar";
import { addFixture, allTiesDone, createTie, newComp, newRow, registerComp, roundRobin, sortTable, stageDone, stageTies, winners } from "./competitions";
import { shuffle } from "./rng";
import type { Club, Competition, World } from "./types";
import { awardWorldComp, worldNews } from "./worldLeagues";

type Mode = "cross" | "within";
interface Spec { id: string; league: string; name: string; short: string; from: [number, number]; to: [number, number]; dows: number[]; double: boolean; mode: Mode; ko: [number, number][]; neutralFinal: boolean }

/** Os torneios de cada liga fev–dez. */
function specsFor(w: World, league: string): Spec[] {
  const l = w.wl!.leagues[league];
  if (league === "arg1") {
    return [
      { id: "arg1a", league, name: "Torneo Apertura", short: "Apertura", from: [1, 1], to: [4, 17], dows: [0, 1], double: false, mode: "cross", ko: [[4, 24], [4, 31], [5, 3], [5, 7]], neutralFinal: true },
      { id: "arg1c", league, name: "Torneo Clausura", short: "Clausura", from: [6, 20], to: [10, 1], dows: [0, 1], double: false, mode: "cross", ko: [[10, 8], [10, 15], [10, 22], [10, 29]], neutralFinal: true },
    ];
  }
  return [{ id: league, league, name: l.name, short: l.short, from: [1, 21], to: [9, 18], dows: [6, 2], double: true, mode: "within", ko: [[9, 24], [9, 31], [10, 21], [10, 28], [11, 5]], neutralFinal: false }];
}

const power = (c: Club) => c.level + c.rep / 10;

/** Divide a liga em duas zonas (pelos dados ou alternando por força). */
function zonesOf(w: World, league: string): string[][] {
  const clubs = Object.values(w.clubs).filter((c) => c.league === league).sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id));
  const byZone = new Map<string, string[]>();
  if (clubs.every((c) => c.zone)) {
    for (const c of clubs) (byZone.get(c.zone!) ?? byZone.set(c.zone!, []).get(c.zone!)!).push(c.id);
    if (byZone.size === 2) return [...byZone.keys()].sort().map((k) => byZone.get(k)!);
  }
  const a: string[] = [], b: string[] = [];
  clubs.forEach((c, i) => ((i % 4 === 0 || i % 4 === 3) ? a : b).push(c.id));
  return [a, b];
}

/** Bloqueios do calendário (Copa do Mundo, Mundial de Clubes). */
function skips(y: number): [number, number][] {
  const out: [number, number][] = [];
  if (isWorldCupYear(y)) out.push([dayOf(y, y, 5, 1), dayOf(y, y, 6, 20)]);
  if (isClubWorldCupYear(y)) out.push([dayOf(y, y, 5, 8), dayOf(y, y, 6, 16)]);
  return out;
}

/** Dias do mata-mata: no dia da semana do torneio, fora das datas FIFA, sempre crescentes. */
function koDays(y: number, s: Spec): number[] {
  const wins = intlWindows(y);
  const out: number[] = [];
  for (const [m, d] of s.ko) {
    let x = onOrAfter(y, y, m, d, s.dows[0]);
    while (wins.some((win) => x >= win.start - 1 && x <= win.end) || (out.length && x <= out[out.length - 1])) x += 7;
    out.push(x);
  }
  return out;
}

export function registerYearMetas(w: World) {
  if (!w.wl) return;
  Object.values(w.wl.leagues).forEach((l, i) => {
    if (l.calendar !== "feb-dec") return;
    for (const s of specsFor(w, l.id)) registerComp(s.id, { name: s.name, short: s.short, color: l.color, tier: 40 + i });
  });
}

/** Cria os torneios fev–dez do ano (chamado no início de cada temporada). */
export function createYearLeagues(w: World) {
  const wl = w.wl;
  if (!wl || w.season < wl.startYear) return;
  registerYearMetas(w);
  const y = w.season;
  for (const l of Object.values(wl.leagues)) {
    if (l.calendar !== "feb-dec") continue;
    const zones = zonesOf(w, l.id).filter((z) => z.length >= 2);
    if (zones.length < 2) continue;
    for (const s of specsFor(w, l.id)) {
      const teams = zones.flat();
      const comp = newComp(w, s.id, "groups", teams);
      Object.assign(comp, { lite: true, label: String(y), region: l.confed });
      comp.groups = zones.map((z, i) => ({ name: s.mode === "within" ? (i === 0 ? "Conferência Leste" : "Conferência Oeste") : `Zona ${"AB"[i]}`, teams: z.slice(), table: z.map(newRow) }));
      w.comps[s.id] = comp;
      const plans = comp.groups.map((g) => {
        const rr = roundRobin(shuffle(g.teams.slice()));
        return s.double ? [...rr, ...rr.map((r) => r.map(([h, a]) => [a, h] as [string, string]))] : rr;
      });
      const n = Math.max(...plans.map((p) => p.length));
      const days = spreadPick(weeklyPool(y, s.from, s.to, s.dows, skips(y)), n);
      plans.forEach((rounds, gi) => rounds.forEach((pairs, ri) => {
        for (const [home, away] of pairs) addFixture(w, { comp: s.id, stage: "group", round: ri + 1, day: days[Math.min(ri, days.length - 1)], home, away, group: gi });
      }));
    }
  }
}

const SEED_ORDER: Record<number, number[]> = { 1: [0], 2: [0, 1], 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] };
const STAGE_BY_TIES: Record<number, string> = { 8: "r16", 4: "qf", 2: "sf", 1: "final" };

function progressYear(w: World, comp: Competition): boolean {
  const spec = w.wl && Object.keys(w.wl.leagues).flatMap((id) => w.wl!.leagues[id].calendar === "feb-dec" ? specsFor(w, id) : []).find((s) => s.id === comp.id);
  if (!spec) return false;
  const days = koDays(comp.season, spec);
  const name = (id: string) => w.clubs[id]?.name ?? id;
  if (comp.stage === "group" && stageDone(w, comp, "group")) {
    const tables = comp.groups.map((g) => sortTable(g.table).map((r) => r.club));
    let q = 8;
    while (q > 1 && tables.some((t) => t.length < q)) q /= 2;
    const pairs: [string, string][] = [];
    const order = SEED_ORDER[q];
    if (spec.mode === "cross") {
      const [A, B] = tables;
      for (const [x, y] of [[A, B], [B, A]]) for (let k = 0; k < q / 2; k++) { const i = order[2 * k]; pairs.push([x[i], y[q - 1 - i]]); }
    } else {
      for (const t of tables) for (let k = 0; k < q / 2; k++) { const i = order[2 * k], j = order[2 * k + 1]; pairs.push([t[i], t[j]]); }
    }
    const stage = STAGE_BY_TIES[pairs.length] ?? "r16";
    const di = Math.max(0, days.length - Math.log2(pairs.length * 2));
    for (const [a, b] of pairs) createTie(w, comp, stage, a, b, 1, [days[di]], { neutral: false });
    comp.stage = stage;
  } else if (["r16", "qf", "sf"].includes(comp.stage) && allTiesDone(comp, comp.stage)) {
    const ws = winners(comp, comp.stage);
    const next = STAGE_BY_TIES[ws.length / 2];
    const di = days.length - Math.log2(ws.length);
    // melhor campanha manda o jogo (a final argentina é em campo neutro)
    const pts = (id: string) => comp.groups.flatMap((g) => g.table).find((r) => r.club === id)?.pts ?? 0;
    for (let k = 0; k < ws.length; k += 2) {
      const [a, b] = pts(ws[k]) >= pts(ws[k + 1]) ? [ws[k], ws[k + 1]] : [ws[k + 1], ws[k]];
      createTie(w, comp, next, a, b, 1, [days[di]], { neutral: next === "final" && spec.neutralFinal });
    }
    comp.stage = next;
  } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
    const t = stageTies(comp, "final")[0];
    comp.champion = t.winner;
    comp.runnerUp = t.winner === t.a ? t.b : t.a;
    comp.stage = "done";
    comp.done = true;
    awardWorldComp(w, comp);
    worldNews(w, `🏆 ${name(t.winner!)} é campeão: ${comp.name} ${comp.label}`, `Venceu ${name(comp.runnerUp!)} na final.`, { force: comp.teams.includes(w.userClubId), clubId: t.winner });
  }
  return true;
}
progressHooks.push((w, comp) => progressYear(w, comp));
