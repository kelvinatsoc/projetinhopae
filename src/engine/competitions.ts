// Competições: tabelas, mata-matas, sorteios e avanço de fases.
import { continentalDays, copaDays, isWorldCupYear, leagueDays, serieBPlayoffDays, serieCDays } from "./calendar";
import { ESTADUAIS } from "../data/estaduais";
import { createEstaduais, isEstadual, progressEstadual } from "./estaduais";
import { progressHooks } from "./hooks";
import { rand, shuffle } from "./rng";
import type { Club, Competition, Fixture, TableRow, Tie, World } from "./types";

// nomes comerciais oficiais (temporada 2025/26) dos estaduais; a estrutura continua em estaduais.ts
const ESTADUAL_OFFICIAL: Record<string, string> = {
  "est-SP": "Paulistão Casas Bahia",
  "est-RS": "Gauchão Ipiranga",
};

export const COMP_META: Record<string, { name: string; short: string; color: string; tier: number }> = {
  serieA: { name: "Brasileirão Betano Série A", short: "Série A", color: "#22c55e", tier: 1 },
  serieB: { name: "Brasileirão Superbet Série B", short: "Série B", color: "#3b82f6", tier: 4 },
  serieC: { name: "Brasileirão Série C", short: "Série C", color: "#a855f7", tier: 5 },
  copaBR: { name: "Copa Betano do Brasil", short: "Copa do Brasil", color: "#eab308", tier: 2 },
  liberta: { name: "CONMEBOL Libertadores", short: "Libertadores", color: "#d4a017", tier: 0 },
  sula: { name: "CONMEBOL Sul-Americana", short: "Sul-Americana", color: "#06b6d4", tier: 3 },
};
// estaduais: nomes em português nas telas de tabela, jogos, histórico e troféus
ESTADUAIS.forEach((e, i) => { COMP_META[e.id] = { name: ESTADUAL_OFFICIAL[e.id] ?? e.name, short: e.short, color: e.color, tier: 10 + i }; });

export const STAGE_NAMES: Record<string, string> = {
  league: "Pontos corridos",
  group: "Fase de grupos",
  playoff: "Playoffs de acesso",
  r64: "Primeira fase",
  r32: "Segunda fase",
  r16: "Oitavas de final",
  qf: "Quartas de final",
  sf: "Semifinal",
  final: "Final",
  done: "Encerrada",
  ko: "Playoff da fase eliminatória",
  third: "Disputa do 3º lugar",
  friendly: "Amistosos",
};

/** Registra nome/cor/ordem de uma competição criada em tempo de execução (ligas do mundo, Champions...). */
export function registerComp(id: string, meta: { name: string; short: string; color: string; tier: number }) {
  COMP_META[id] = meta;
}

export { progressHooks } from "./hooks";

// ---------------------------------------------------------------- índices
let idxWorld: World | null = null;
let idxArr: Fixture[] | null = null;
let idxMap = new Map<number, Fixture>();
let idxComp: Map<string, Fixture[]> | null = null;

/** Descarta os índices de jogos (chamar depois de trocar ou filtrar w.fixtures). */
export function resetFixtureIndex() {
  idxWorld = null;
  idxArr = null;
  idxComp = null;
}

function ensureIndex(w: World) {
  if (idxWorld !== w || idxArr !== w.fixtures || idxMap.size !== w.fixtures.length) {
    idxWorld = w;
    idxArr = w.fixtures;
    idxMap = new Map(w.fixtures.map((f) => [f.id, f]));
    idxComp = null;
  }
}

export function fixtureById(w: World, id: number): Fixture | undefined {
  ensureIndex(w);
  return idxMap.get(id);
}

/** Jogos de uma competição (índice). */
export function compFixtures(w: World, compId: string): Fixture[] {
  ensureIndex(w);
  if (!idxComp) {
    idxComp = new Map();
    for (const f of w.fixtures) {
      let l = idxComp.get(f.comp);
      if (!l) idxComp.set(f.comp, (l = []));
      l.push(f);
    }
  }
  return idxComp.get(compId) ?? [];
}

export function addFixture(w: World, f: Omit<Fixture, "id">): Fixture {
  const fx: Fixture = { id: w.nextId++, ...f };
  w.fixtures.push(fx);
  if (idxWorld === w && idxArr === w.fixtures) {
    idxMap.set(fx.id, fx);
    if (idxComp) {
      let l = idxComp.get(fx.comp);
      if (!l) idxComp.set(fx.comp, (l = []));
      l.push(fx);
    }
  }
  return fx;
}

// ---------------------------------------------------------------- tabela
export const newRow = (club: string): TableRow => ({ club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export function applyToTable(rows: TableRow[], home: string, away: string, hg: number, ag: number) {
  const h = rows.find((r) => r.club === home);
  const a = rows.find((r) => r.club === away);
  if (!h || !a) return;
  h.p++; a.p++;
  h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
  if (hg > ag) { h.w++; a.l++; h.pts += 3; push(h, "V"); push(a, "D"); }
  else if (hg < ag) { a.w++; h.l++; a.pts += 3; push(a, "V"); push(h, "D"); }
  else { h.d++; a.d++; h.pts++; a.pts++; push(h, "E"); push(a, "E"); }
}

function push(r: TableRow, x: string) {
  r.form.push(x);
  if (r.form.length > 5) r.form.shift();
}

export function sortTable(rows: TableRow[]): TableRow[] {
  return rows.sort((x, y) => y.pts - x.pts || y.w - x.w || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || x.club.localeCompare(y.club));
}

// ---------------------------------------------------------------- round-robin
export function roundRobin(teams: string[]): [string, string][][] {
  const arr = teams.slice();
  if (arr.length % 2) arr.push("__bye__");
  const n = arr.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "__bye__" || b === "__bye__") continue;
      const swap = i === 0 ? r % 2 === 1 : i % 2 === 1;
      pairs.push(swap ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

export function newComp(w: World, id: string, format: Competition["format"], teams: string[]): Competition {
  const meta = COMP_META[id];
  return {
    id, name: meta.name, short: meta.short, format, season: w.season, teams,
    table: [], groups: [], ties: [], stage: format === "league" ? "league" : format === "groups" ? "group" : "r64",
    done: false, color: meta.color, tier: meta.tier,
  };
}

function leagueFixtures(w: World, comp: Competition, days: number[], double: boolean) {
  const rounds = roundRobin(shuffle(comp.teams.slice()));
  const all = double ? [...rounds, ...rounds.map((r) => r.map(([h, a]) => [a, h] as [string, string]))] : rounds;
  all.forEach((pairs, i) => {
    for (const [home, away] of pairs) addFixture(w, { comp: comp.id, stage: "league", round: i + 1, day: days[i], home, away });
  });
  comp.table = comp.teams.map(newRow);
}

// ---------------------------------------------------------------- mata-mata
export function createTie(
  w: World, comp: Competition, stage: string, a: string, b: string, legs: 1 | 2, days: number[],
  opts: { neutral?: boolean; advantage?: string } = {},
): Tie {
  const tie: Tie = { id: w.nextId++, comp: comp.id, stage, a, b, legs, fixtures: [], advantage: opts.advantage };
  const f1 = addFixture(w, { comp: comp.id, stage, round: 1, day: days[0], home: a, away: b, tie: tie.id, leg: legs === 2 ? 1 : undefined, neutral: opts.neutral });
  tie.fixtures.push(f1.id);
  if (legs === 2) {
    const f2 = addFixture(w, { comp: comp.id, stage, round: 2, day: days[1], home: b, away: a, tie: tie.id, leg: 2 });
    tie.fixtures.push(f2.id);
  }
  comp.ties.push(tie);
  return tie;
}

/** Placar agregado do confronto, do ponto de vista de A e B. */
export function tieAggregate(w: World, tie: Tie): { a: number; b: number; played: number } {
  let ga = 0, gb = 0, played = 0;
  for (const id of tie.fixtures) {
    const f = fixtureById(w, id);
    if (!f?.result) continue;
    played++;
    if (f.home === tie.a) { ga += f.result.hg; gb += f.result.ag; }
    else { ga += f.result.ag; gb += f.result.hg; }
  }
  return { a: ga, b: gb, played };
}

/** Diz se a partida (último jogo de um confronto) precisa de pênaltis com o placar dado. */
export function needsPenalties(w: World, f: Fixture, hg: number, ag: number): boolean {
  if (!f.tie) return false;
  const comp = w.comps[f.comp];
  const tie = comp?.ties.find((t) => t.id === f.tie);
  if (!tie || tie.advantage) return false;
  if (tie.legs === 1) return hg === ag;
  if (f.leg !== 2) return false;
  const agg = tieAggregate(w, tie);
  // agg ainda não inclui este jogo
  const aGoals = agg.a + (f.home === tie.a ? hg : ag);
  const bGoals = agg.b + (f.home === tie.a ? ag : hg);
  return aGoals === bGoals;
}

function resolveTie(w: World, tie: Tie) {
  if (tie.winner) return;
  const agg = tieAggregate(w, tie);
  if (agg.played < tie.fixtures.length) return;
  if (agg.a > agg.b) tie.winner = tie.a;
  else if (agg.b > agg.a) tie.winner = tie.b;
  else if (tie.advantage) tie.winner = tie.advantage;
  else {
    const last = fixtureById(w, tie.fixtures[tie.fixtures.length - 1])!;
    const pens = last.result?.pens;
    if (pens) tie.winner = pens[0] > pens[1] ? last.home : last.away;
    else tie.winner = rand() < 0.5 ? tie.a : tie.b;
  }
}

export const stageDone = (w: World, comp: Competition, stage: string) =>
  compFixtures(w, comp.id).every((f) => f.stage !== stage || !!f.result);

// ---------------------------------------------------------------- criação da temporada
export interface SeasonEntrants {
  serieA: string[];
  serieB: string[];
  serieC: string[];
  copa: string[];
  liberta: string[];
  sula: string[];
}

export function createSeasonCompetitions(w: World, e: SeasonEntrants) {
  const y = w.season;
  w.comps = {};
  const days = leagueDays(y, !!w.intl && isWorldCupYear(y));

  const a = newComp(w, "serieA", "league", e.serieA);
  leagueFixtures(w, a, days, true);
  w.comps.serieA = a;

  const b = newComp(w, "serieB", "league", e.serieB);
  leagueFixtures(w, b, days, true);
  w.comps.serieB = b;

  const c = newComp(w, "serieC", "league", e.serieC);
  leagueFixtures(w, c, serieCDays(y).rounds, false);
  w.comps.serieC = c;

  const copa = newComp(w, "copaBR", "cup", e.copa);
  copa.stage = "r64";
  w.comps.copaBR = copa;
  drawCopaFirstRound(w, copa);

  for (const [id, teams, thu] of [["liberta", e.liberta, false], ["sula", e.sula, true]] as const) {
    const comp = newComp(w, id, "groups", teams.slice());
    w.comps[id] = comp;
    drawGroups(w, comp, continentalDays(y, thu).groups);
  }

  createEstaduais(w);
}

const strength = (w: World, id: string) => {
  const c = w.clubs[id];
  const divRank = { A: 4, B: 3, C: 2, D: 1, F: 3.5 }[c.div];
  return divRank * 100 + c.level;
};

function drawCopaFirstRound(w: World, comp: Competition) {
  const d = copaDays(w.season);
  const sorted = comp.teams.slice().sort((x, y) => strength(w, y) - strength(w, x));
  const n = sorted.length;
  const strong = shuffle(sorted.slice(0, n / 2));
  const weak = shuffle(sorted.slice(n / 2));
  // jogo único na casa do time mais fraco; empate vai para os pênaltis
  for (let i = 0; i < n / 2; i++) createTie(w, comp, "r64", weak[i], strong[i], 1, d.r64);
}

function drawGroups(w: World, comp: Competition, days: number[]) {
  const sorted = comp.teams.slice().sort((x, y) => w.clubs[y].level + w.clubs[y].rep / 10 - (w.clubs[x].level + w.clubs[x].rep / 10));
  const pots = [0, 1, 2, 3].map((i) => shuffle(sorted.slice(i * 8, i * 8 + 8)));
  let best: string[][] = [];
  let bestScore = Infinity;
  // tenta alguns sorteios evitando dois times do mesmo país no grupo
  for (let attempt = 0; attempt < 60; attempt++) {
    const groups: string[][] = Array.from({ length: 8 }, () => []);
    for (const pot of pots) {
      const p = shuffle(pot.slice());
      p.forEach((t, i) => groups[i].push(t));
    }
    let score = 0;
    for (const g of groups) {
      const countries = g.map((t) => w.clubs[t].country);
      score += countries.length - new Set(countries).size;
    }
    if (score < bestScore) { bestScore = score; best = groups; }
    if (score === 0) break;
  }
  const letters = "ABCDEFGH";
  comp.groups = best.map((teams, i) => ({ name: `Grupo ${letters[i]}`, teams, table: teams.map(newRow) }));
  comp.groups.forEach((g, gi) => {
    const rr = roundRobin(g.teams);
    const all = [...rr, ...rr.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
    all.forEach((pairs, ri) => {
      for (const [home, away] of pairs) addFixture(w, { comp: comp.id, stage: "group", round: ri + 1, day: days[ri], home, away, group: gi });
    });
  });
}

// ---------------------------------------------------------------- resultado
export function recordResult(w: World, f: Fixture) {
  const comp = w.comps[f.comp];
  if (!comp || !f.result) return;
  const { hg, ag } = f.result;
  if (f.stage === "league") applyToTable(comp.table, f.home, f.away, hg, ag);
  else if (f.stage === "group" && f.group !== undefined) applyToTable(comp.groups[f.group].table, f.home, f.away, hg, ag);
  if (f.tie) {
    const tie = comp.ties.find((t) => t.id === f.tie);
    if (tie) resolveTie(w, tie);
  }
}

/** Avança fases de todas as competições quando a fase atual termina. */
export function progressCompetitions(w: World): string[] {
  const news: string[] = [];
  for (const comp of Object.values(w.comps)) {
    if (comp.done) continue;
    for (let guard = 0; guard < 3; guard++) {
      const before = comp.stage;
      progressOne(w, comp, news);
      if (comp.stage === before || comp.done) break;
    }
  }
  return news;
}

export function stageTies(comp: Competition, stage: string) {
  return comp.ties.filter((t) => t.stage === stage);
}

export function winners(comp: Competition, stage: string): string[] {
  return stageTies(comp, stage).map((t) => t.winner!).filter(Boolean);
}

export function allTiesDone(comp: Competition, stage: string) {
  const ts = stageTies(comp, stage);
  return ts.length > 0 && ts.every((t) => !!t.winner);
}

function progressOne(w: World, comp: Competition, news: string[]) {
  const y = w.season;
  const name = (id: string) => w.clubs[id]?.name ?? id;
  if (comp.region && comp.region !== "BRA") { for (const h of progressHooks) if (h(w, comp, news)) return; }
  else if (isEstadual(comp)) progressEstadual(w, comp, news);
  else if (comp.id === "serieA" && comp.stage === "league" && stageDone(w, comp, "league")) {
    sortTable(comp.table);
    comp.champion = comp.table[0].club;
    comp.runnerUp = comp.table[1].club;
    comp.relegated = comp.table.slice(-4).map((r) => r.club);
    comp.stage = "done"; comp.done = true;
    news.push(`🏆 ${name(comp.champion)} é campeão do Brasileirão Série A ${y}!`);
  } else if (comp.id === "serieB") {
    if (comp.stage === "league" && stageDone(w, comp, "league")) {
      sortTable(comp.table);
      const t = comp.table.map((r) => r.club);
      comp.champion = t[0];
      comp.runnerUp = t[1];
      comp.promoted = [t[0], t[1]];
      comp.relegated = t.slice(-4);
      const d = serieBPlayoffDays(y);
      // melhor colocado decide em casa e avança com empate no agregado
      createTie(w, comp, "playoff", t[5], t[2], 2, d, { advantage: t[2] });
      createTie(w, comp, "playoff", t[4], t[3], 2, d, { advantage: t[3] });
      comp.stage = "playoff";
      news.push(`🏆 ${name(t[0])} é campeão da Série B ${y}! ${name(t[0])} e ${name(t[1])} sobem direto.`);
    } else if (comp.stage === "playoff" && allTiesDone(comp, "playoff")) {
      const ws = winners(comp, "playoff");
      comp.promoted = [...(comp.promoted ?? []), ...ws];
      comp.stage = "done"; comp.done = true;
      news.push(`⬆️ ${ws.map(name).join(" e ")} vencem os playoffs e sobem para a Série A!`);
    }
  } else if (comp.id === "serieC") {
    const d = serieCDays(y);
    if (comp.stage === "league" && stageDone(w, comp, "league")) {
      sortTable(comp.table);
      const t = comp.table.map((r) => r.club);
      comp.relegated = t.slice(-2);
      for (const [hi, lo] of [[0, 7], [1, 6], [2, 5], [3, 4]]) createTie(w, comp, "qf", t[lo], t[hi], 2, d.qf, { advantage: t[hi] });
      comp.stage = "qf";
    } else if (comp.stage === "qf" && allTiesDone(comp, "qf")) {
      const ws = winners(comp, "qf");
      comp.promoted = ws;
      news.push(`⬆️ ${ws.map(name).join(", ")} conquistam o acesso à Série B!`);
      const pos = (id: string) => comp.table.findIndex((r) => r.club === id);
      const pair = (x: string, z: string) => (pos(x) < pos(z) ? [z, x] : [x, z]);
      const [a1, b1] = pair(ws[0], ws[3]);
      const [a2, b2] = pair(ws[1], ws[2]);
      createTie(w, comp, "sf", a1, b1, 2, d.sf, { advantage: b1 });
      createTie(w, comp, "sf", a2, b2, 2, d.sf, { advantage: b2 });
      comp.stage = "sf";
    } else if (comp.stage === "sf" && allTiesDone(comp, "sf")) {
      const ws = winners(comp, "sf");
      const pos = (id: string) => comp.table.findIndex((r) => r.club === id);
      const [fa, fb] = pos(ws[0]) < pos(ws[1]) ? [ws[1], ws[0]] : [ws[0], ws[1]];
      createTie(w, comp, "final", fa, fb, 2, d.final, { advantage: fb });
      comp.stage = "final";
    } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
      const t = stageTies(comp, "final")[0];
      comp.champion = t.winner;
      comp.runnerUp = t.winner === t.a ? t.b : t.a;
      comp.stage = "done"; comp.done = true;
      news.push(`🏆 ${name(t.winner!)} é campeão da Série C ${y}!`);
    }
  } else if (comp.id === "copaBR") {
    const d = copaDays(y);
    const order = ["r64", "r32", "r16", "qf", "sf", "final"] as const;
    const i = order.indexOf(comp.stage as (typeof order)[number]);
    if (i >= 0 && allTiesDone(comp, comp.stage)) {
      if (comp.stage === "final") {
        const t = stageTies(comp, "final")[0];
        comp.champion = t.winner;
        comp.runnerUp = t.winner === t.a ? t.b : t.a;
        comp.stage = "done"; comp.done = true;
        news.push(`🏆 ${name(t.winner!)} conquista a Copa do Brasil ${y}!`);
        return;
      }
      const next = order[i + 1];
      const ws = shuffle(winners(comp, comp.stage));
      for (let k = 0; k < ws.length; k += 2) {
        let [x, z] = [ws[k], ws[k + 1]];
        if (next === "r32") {
          // jogo único: manda o time de divisão inferior
          if (strength(w, x) < strength(w, z)) [x, z] = [z, x];
          createTie(w, comp, next, z, x, 1, d.r32);
        } else {
          createTie(w, comp, next, x, z, 2, d[next]);
        }
      }
      comp.stage = next;
    }
  } else if (comp.format === "groups") {
    const thu = comp.id === "sula";
    const d = continentalDays(y, thu);
    if (comp.stage === "group" && stageDone(w, comp, "group")) {
      const first: { club: string; g: number }[] = [];
      const second: { club: string; g: number }[] = [];
      comp.groups.forEach((g, gi) => {
        sortTable(g.table);
        first.push({ club: g.table[0].club, g: gi });
        second.push({ club: g.table[1].club, g: gi });
      });
      // sorteio: primeiros x segundos de grupos diferentes; primeiro decide em casa
      let pairs: [string, string][] = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        const s = shuffle(second.slice());
        if (first.every((f, i) => f.g !== s[i].g)) {
          pairs = first.map((f, i) => [s[i].club, f.club]);
          break;
        }
      }
      if (!pairs.length) pairs = first.map((f, i) => [second[(i + 1) % 8].club, f.club]);
      for (const [x, z] of pairs) createTie(w, comp, "r16", x, z, 2, d.r16);
      comp.stage = "r16";
    } else if (["r16", "qf", "sf"].includes(comp.stage) && allTiesDone(comp, comp.stage)) {
      const next = comp.stage === "r16" ? "qf" : comp.stage === "qf" ? "sf" : "final";
      const ws = shuffle(winners(comp, comp.stage));
      if (next === "final") createTie(w, comp, "final", ws[0], ws[1], 1, d.final, { neutral: true });
      else for (let k = 0; k < ws.length; k += 2) createTie(w, comp, next, ws[k], ws[k + 1], 2, d[next]);
      comp.stage = next;
    } else if (comp.stage === "final" && allTiesDone(comp, "final")) {
      const t = stageTies(comp, "final")[0];
      comp.champion = t.winner;
      comp.runnerUp = t.winner === t.a ? t.b : t.a;
      comp.stage = "done"; comp.done = true;
      news.push(`🏆 ${name(t.winner!)} é campeão da ${comp.name} ${y}!`);
    }
  }
}

// ---------------------------------------------------------------- consultas
export function clubFixtures(w: World, clubId: string): Fixture[] {
  return w.fixtures.filter((f) => f.home === clubId || f.away === clubId).sort((a, b) => a.day - b.day);
}

export function nextFixture(w: World, clubId: string): Fixture | undefined {
  let best: Fixture | undefined;
  for (const f of w.fixtures) {
    if (f.result || (f.home !== clubId && f.away !== clubId)) continue;
    if (!best || f.day < best.day) best = f;
  }
  return best;
}

export function leagueOf(w: World, clubId: string): Competition | undefined {
  const lg = w.clubs[clubId]?.league;
  if (lg) {
    // liga do mundo (Argentina: o torneio em andamento)
    const list = [w.comps[lg], w.comps[`${lg}a`], w.comps[`${lg}c`]].filter((c): c is Competition => !!c && c.teams.includes(clubId));
    return list.find((c) => !c.done) ?? list[list.length - 1];
  }
  const div = w.clubs[clubId]?.div;
  return div === "A" ? w.comps.serieA : div === "B" ? w.comps.serieB : div === "C" ? w.comps.serieC : undefined;
}

export function tablePosition(comp: Competition | undefined, clubId: string): number | null {
  if (!comp) return null;
  const rows = sortTable(comp.table.slice());
  const i = rows.findIndex((r) => r.club === clubId);
  return i >= 0 ? i + 1 : null;
}

export function clubsByIds(w: World, ids: string[]): Club[] {
  return ids.map((id) => w.clubs[id]).filter(Boolean);
}
