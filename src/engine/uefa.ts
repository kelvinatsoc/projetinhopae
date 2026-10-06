// Champions League e Europa League no formato 2024+ (simplificado): fase de liga de 36 clubes com 8 jogos
// (4 em casa, 4 fora, adversários todos diferentes), 1º–8º direto às oitavas, 9º–24º no playoff (ida e volta),
// mata-mata em ida e volta e final em jogo único em campo neutro.
import { intlWindows, onOrAfter, yearLen } from "./calendar";
import { addFixture, allTiesDone, createTie, newComp, newRow, progressHooks, sortTable, stageDone, stageTies, winners } from "./competitions";
import { awardPrize } from "./finance";
import { rand, shuffle } from "./rng";
import type { Club, Competition, World } from "./types";
import { awardWorldComp, seasonLabel, worldNews } from "./worldLeagues";

export const UEFA_METAS: Record<string, { name: string; short: string; color: string; tier: number }> = {
  ucl: { name: "UEFA Champions League", short: "Champions", color: "#1b3fa0", tier: 20 },
  uel: { name: "UEFA Europa League", short: "Europa League", color: "#ff6900", tier: 21 },
};

/** Vagas por liga (Champions, Europa League). */
const QUOTA: Record<string, [number, number]> = {
  eng1: [4, 2], esp1: [4, 2], ita1: [4, 2], ger1: [4, 2], fra1: [3, 2], por1: [2, 2], ned1: [2, 2], tur1: [1, 2], sco1: [1, 2],
};

/** Prêmios (R$) por fase alcançada. */
const PRIZE: Record<string, Record<string, number>> = {
  ucl: { base: 100_000_000, win: 12_000_000, ko: 10_000_000, r16: 60_000_000, qf: 70_000_000, sf: 90_000_000, final: 100_000_000, champion: 120_000_000 },
  uel: { base: 25_000_000, win: 3_000_000, ko: 3_000_000, r16: 15_000_000, qf: 18_000_000, sf: 25_000_000, final: 30_000_000, champion: 35_000_000 },
};

const SIZE = 36;
const ROUNDS = 8;
const power = (c: Club) => c.level + c.rep / 10;

/** Dias de jogo (relativos a 1º/jan do ano Y da criação), fora das datas FIFA. */
export function uefaDays(y: number, dow: 3 | 4) {
  const blocked = new Set<number>();
  for (const win of intlWindows(y)) for (let d = win.start; d <= win.end; d++) blocked.add(d);
  for (const win of intlWindows(y + 1)) for (let d = win.start; d <= win.end; d++) blocked.add(d + yearLen(y));
  const at = (yy: number, m: number, d: number) => {
    let x = onOrAfter(y, yy, m, d, dow);
    while (blocked.has(x)) x += 7;
    return x;
  };
  const N = y + 1;
  const league = [at(y, 8, 15), at(y, 8, 29), at(y, 9, 20), at(y, 10, 3), at(y, 10, 24), at(y, 11, 8), at(N, 0, 19), at(N, 0, 26)];
  return {
    league,
    ko: [at(N, 1, 16), at(N, 1, 23)],
    r16: [at(N, 2, 3), at(N, 2, 17)],
    qf: [at(N, 3, 6), at(N, 3, 13)],
    sf: [at(N, 3, 27), at(N, 4, 4)],
    final: [dow === 3 ? onOrAfter(y, N, 4, 26, 6) : onOrAfter(y, N, 4, 18, 3)],
  };
}

/** Escolhe os participantes da Champions e da Europa League a partir das tabelas finais (ou das vagas reais no 1º ano). */
export function uefaEntrants(w: World, prev: Record<string, string[]>, prevUcl?: string): { ucl: string[]; uel: string[] } {
  const leagues = Object.values(w.wl?.leagues ?? {}).filter((l) => l.confed === "UEFA");
  const pool = Object.values(w.clubs).filter((c) => leagues.some((l) => l.id === c.league));
  const ucl: string[] = [], uel: string[] = [];
  const add = (list: string[], id: string | undefined) => { if (id && w.clubs[id] && !ucl.includes(id) && !uel.includes(id)) list.push(id); };
  const seeds = !Object.keys(prev).length ? w.wl?.seeds : undefined;
  if (seeds) {
    seeds.ucl.forEach((id) => add(ucl, id));
    seeds.uel.forEach((id) => add(uel, id));
  } else {
    add(ucl, prevUcl);
    for (const l of leagues) {
      const order = prev[l.id] ?? pool.filter((c) => c.league === l.id).sort((a, b) => power(b) - power(a)).map((c) => c.id);
      const [qu, qe] = QUOTA[l.id] ?? [1, 1];
      let i = 0;
      for (let n = 0; n < qu && i < order.length; i++) { if (!ucl.includes(order[i])) { add(ucl, order[i]); n++; } }
      for (let n = 0; n < qe && i < order.length; i++) { if (!ucl.includes(order[i]) && !uel.includes(order[i])) { add(uel, order[i]); n++; } }
    }
  }
  // completa com os mais fortes que sobraram (representam os clubes de países fora do jogo)
  const rest = pool.filter((c) => !ucl.includes(c.id) && !uel.includes(c.id)).sort((a, b) => power(b) - power(a) || a.id.localeCompare(b.id));
  while (ucl.length < SIZE && rest.length) ucl.push(rest.shift()!.id);
  while (uel.length < SIZE && rest.length) uel.push(rest.shift()!.id);
  return { ucl: ucl.slice(0, SIZE), uel: uel.slice(0, SIZE) };
}

/**
 * Sorteio da fase de liga: 8 rodadas (emparelhamentos perfeitos do método do círculo, sem repetir adversário)
 * e mando por circuito euleriano (4 em casa, 4 fora). Tenta alguns sorteios evitando clubes do mesmo país.
 */
export function leaguePhaseDraw(w: World, teams: string[], rounds = ROUNDS): [string, string][][] {
  const n = teams.length;
  let best: [string, string][][] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 30; attempt++) {
    const arr = shuffle(teams.slice());
    const all: [string, string][][] = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs: [string, string][] = [];
      for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);
      all.push(pairs);
      arr.splice(1, 0, arr.pop()!);
    }
    const chosen = shuffle(all).slice(0, rounds);
    let score = 0;
    for (const r of chosen) for (const [a, b] of r) if (w.clubs[a]?.country === w.clubs[b]?.country) score++;
    if (score < bestScore) { bestScore = score; best = chosen; }
    if (score === 0) break;
  }
  return orient(best);
}

/** Orienta as arestas de um grafo regular de grau par seguindo um circuito euleriano (entrada = saída). */
function orient(rounds: [string, string][][]): [string, string][][] {
  const adj = new Map<string, { to: string; e: number }[]>();
  const edges: { a: string; b: string; used: boolean; dir?: [string, string] }[] = [];
  rounds.forEach((r) => r.forEach(([a, b]) => {
    const e = edges.length;
    edges.push({ a, b, used: false });
    (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, e });
    (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, e });
  }));
  const ptr = new Map<string, number>();
  for (const start of adj.keys()) {
    // Hierholzer iterativo: cada aresta percorrida u -> v vira "u em casa"
    const stack = [start];
    while (stack.length) {
      const u = stack[stack.length - 1];
      const list = adj.get(u)!;
      let i = ptr.get(u) ?? 0;
      while (i < list.length && edges[list[i].e].used) i++;
      ptr.set(u, i);
      if (i === list.length) { stack.pop(); continue; }
      const { to, e } = list[i];
      edges[e].used = true;
      edges[e].dir = [u, to];
      stack.push(to);
    }
  }
  let k = 0;
  return rounds.map((r) => r.map(() => edges[k++].dir!));
}

export function createUefaSeason(w: World, prev: Record<string, string[]>, prevUcl?: string) {
  const y = w.season;
  const { ucl, uel } = uefaEntrants(w, prev, prevUcl);
  for (const [id, teams, dow] of [["ucl", ucl, 3], ["uel", uel, 4]] as const) {
    if (teams.length < 10) continue;
    const list = teams.length % 2 ? teams.slice(0, -1) : teams.slice();
    const comp = newComp(w, id, "league", list);
    Object.assign(comp, { carry: true, lite: true, label: seasonLabel(y), region: "UEFA" });
    comp.table = list.map(newRow);
    w.comps[id] = comp;
    const days = uefaDays(y, dow).league;
    leaguePhaseDraw(w, list, Math.min(ROUNDS, list.length - 1)).forEach((pairs, i) => {
      for (const [home, away] of pairs) addFixture(w, { comp: id, stage: "league", round: i + 1, day: days[i], home, away });
    });
  }
}

function prizes(w: World, comp: Competition) {
  const t = PRIZE[comp.id];
  for (const club of comp.teams) {
    let v = t.base + (comp.table.find((r) => r.club === club)?.w ?? 0) * t.win;
    for (const s of ["ko", "r16", "qf", "sf", "final"]) if (comp.ties.some((x) => x.stage === s && (x.a === club || x.b === club))) v += t[s];
    if (comp.champion === club) v += t.champion;
    awardPrize(w, club, v);
  }
}

function progressUefa(w: World, comp: Competition): boolean {
  if (comp.id !== "ucl" && comp.id !== "uel") return false;
  const d = uefaDays(comp.season, comp.id === "ucl" ? 3 : 4);
  // os dias são relativos ao ano de criação; depois da virada do ano, deslocados
  const shift = w.season > comp.season ? -yearLen(comp.season) : 0;
  const at = (xs: number[]) => xs.map((x) => x + shift);
  if (comp.stage === "league" && stageDone(w, comp, "league")) {
    const t = sortTable(comp.table).map((r) => r.club);
    const ko = t.slice(8, 24);
    for (let k = 0; k < ko.length / 2; k++) createTie(w, comp, "ko", ko[ko.length - 1 - k], ko[k], 2, at(d.ko));
    comp.stage = "ko";
    worldNews(w, `${comp.name}: definida a fase eliminatória`, `${t.slice(0, 8).map((id) => w.clubs[id].name).join(", ")} vão direto às oitavas.`);
  } else if (comp.stage === "ko" && allTiesDone(comp, "ko")) {
    const t = sortTable(comp.table.slice()).map((r) => r.club);
    const ws = winners(comp, "ko"); // em ordem: vencedor do 9x24, 10x23, ...
    for (let k = 0; k < 8; k++) createTie(w, comp, "r16", ws[k], t[7 - k], 2, at(d.r16));
    comp.stage = "r16";
  } else if ((comp.stage === "r16" || comp.stage === "qf" || comp.stage === "sf") && allTiesDone(comp, comp.stage)) {
    const next = comp.stage === "r16" ? "qf" : comp.stage === "qf" ? "sf" : "final";
    const ws = winners(comp, comp.stage);
    if (next === "final") createTie(w, comp, "final", ws[0], ws[1], 1, at(d.final), { neutral: true });
    else for (let k = 0; k < ws.length; k += 2) {
      const [a, b] = rand() < 0.5 ? [ws[k], ws[k + 1]] : [ws[k + 1], ws[k]];
      createTie(w, comp, next, a, b, 2, at(d[next]));
    }
    comp.stage = next;
  } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
    const t = stageTies(comp, "final")[0];
    comp.champion = t.winner;
    comp.runnerUp = t.winner === t.a ? t.b : t.a;
    comp.stage = "done";
    comp.done = true;
    awardWorldComp(w, comp);
    prizes(w, comp);
    const c = w.clubs[t.winner!];
    worldNews(w, `🏆 ${c.name} conquista a ${comp.name} ${comp.label}!`, `${c.full} vence ${w.clubs[comp.runnerUp!].name} na final.`, { force: true, clubId: c.id });
  }
  return true;
}
progressHooks.push((w, comp) => progressUefa(w, comp));

