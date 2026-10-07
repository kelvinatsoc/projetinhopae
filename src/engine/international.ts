// Seleções: datas FIFA, convocações (o jogador fica fora do clube), amistosos, Eliminatórias da CONMEBOL
// e Copa do Mundo (48 seleções: 12 grupos de 4, 2 primeiros + 8 melhores terceiros, mata-mata desde os 32 avos).
// As seleções ficam em w.intl.nts e os jogos em w.intl.fixtures (fora de w.fixtures, que é só de clubes).
import type { NationalTeamDef } from "../data/worldTypes";
import { dayOf, intlWindows, isContinentalYear, isWorldCupYear, yearLen } from "./calendar";
import { applyToTable, newRow, roundRobin, sortTable } from "./competitions";
import { elevenStrength, quickEleven, quickResult } from "./fastsim";
import { chance, randInt, rand, shuffle } from "./rng";
import type { Competition, Fixture, IntlState, NationalTeam, Player, Pos, Tie, World } from "./types";
import { worldNews } from "./worldLeagues";
import { ntJobTick } from "./ntManager";

export const INTL_META: Record<string, { name: string; short: string; color: string }> = {
  fr: { name: "Amistosos internacionais", short: "Amistosos", color: "#64748b" },
  wc: { name: "Copa do Mundo FIFA", short: "Copa do Mundo", color: "#c9a227" },
  wcq: { name: "Eliminatórias Sul-Americanas", short: "Eliminatórias", color: "#0f9d58" },
  euro: { name: "UEFA Euro", short: "Euro", color: "#143cdb" },
  ca: { name: "Copa América", short: "Copa América", color: "#d4a017" },
  euroq: { name: "Eliminatórias da Euro", short: "Elim. Euro", color: "#143cdb" },
};
export const intlKind = (compId: string) => compId.split("-")[0];

export function initIntl(w: World, defs: NationalTeamDef[]) {
  const nts: Record<string, NationalTeam> = {};
  for (const d of defs) {
    const c = [...d.colors];
    while (c.length < 3) c.push("#FFFFFF");
    nts[d.id] = {
      id: d.id, fifa: d.fifa, name: d.name, confed: d.confed, tier: d.rankingTier, level: d.level,
      colors: c.slice(0, 3) as [string, string, string], logo: d.logo === 1 || undefined,
      pool: d.pool.slice(), wc2026: d.wc2026?.slice(), trophies: [], form: [],
    };
  }
  w.intl = { nts, comps: {}, fixtures: [], callups: {}, rel: {}, honors: [] };
}

export const ntName = (w: World, id: string) => w.intl?.nts[id]?.name ?? id;
export const ntOfNat = (w: World, nat: string) => w.intl?.nts[`nt-${nat}`];

// ---------------------------------------------------------------- convocação
const GROUP: Record<Pos, 0 | 1 | 2 | 3> = { GOL: 0, ZAG: 1, LD: 1, LE: 1, VOL: 2, MC: 2, MEI: 2, PD: 3, PE: 3, ATA: 3 };
const QUOTA_23 = [3, 7, 7, 6];
const QUOTA_26 = [3, 9, 8, 6];

/** Índice nome|ano -> jogador real (para as listas do world.json). */
function keyIndex(w: World): Map<string, Player> {
  const m = new Map<string, Player>();
  for (const p of Object.values(w.players)) {
    if (!p.real) continue;
    const k = `${p.name}|${p.born}`;
    const o = m.get(k);
    if (!o || p.ovr > o.ovr) m.set(k, p);
  }
  return m;
}

/**
 * O técnico da seleção escolhe os melhores disponíveis da nacionalidade (com cota por setor).
 * Quem está na lista oficial (`fixed`, ex.: convocação da Copa 2026) entra primeiro.
 */
export function pickSquad(w: World, nt: NationalTeam, size: 23 | 26, fixed?: string[], idx?: Map<string, Player>): Player[] {
  const chosen: Player[] = [];
  const taken = new Set<number>();
  if (fixed?.length) {
    const ix = idx ?? keyIndex(w);
    for (const k of fixed) {
      const p = ix.get(k);
      if (p && p.clubId && !taken.has(p.id) && p.injury <= 10) { chosen.push(p); taken.add(p.id); }
    }
  }
  const pool = new Set(nt.pool);
  const cands = Object.values(w.players)
    .filter((p) => p.nat === nt.fifa && p.clubId && !p.youth && p.injury <= 7 && !taken.has(p.id))
    .map((p) => ({ p, s: p.ovr + (pool.has(`${p.name}|${p.born}`) ? 2 : 0) + p.fame * 0.02 }))
    .sort((a, b) => b.s - a.s || a.p.id - b.p.id);
  const quota = size === 26 ? QUOTA_26 : QUOTA_23;
  const have = [0, 0, 0, 0];
  for (const p of chosen) have[GROUP[p.pos]]++;
  for (const { p } of cands) {
    if (chosen.length >= size) break;
    const g = GROUP[p.pos];
    if (have[g] >= quota[g]) continue;
    chosen.push(p); taken.add(p.id); have[g]++;
  }
  // setores sem gente suficiente: completa com os melhores restantes
  for (const { p } of cands) { if (chosen.length >= size) break; if (!taken.has(p.id)) { chosen.push(p); taken.add(p.id); } }
  return chosen.slice(0, size);
}

/** Convoca uma seleção até o dia `until` (inclusive). */
export function callUp(w: World, ntId: string, until: number, size: 23 | 26 = 23, fixed?: string[], idx?: Map<string, Player>) {
  const intl = w.intl!;
  const nt = intl.nts[ntId];
  if (!nt) return [];
  release(w, ntId, false);
  // seleção do usuário: a convocação escolhida por ele (completada se faltar gente)
  const mine = ntId === w.ntJob && intl.userSquad?.length
    ? intl.userSquad.map((id) => w.players[id]).filter((p) => p && p.clubId && p.injury <= 7 && p.nat === nt.fifa)
    : null;
  const squad = mine && mine.length >= 16 ? mine.slice(0, 26) : pickSquad(w, nt, size, fixed, idx);
  for (const p of squad) p.away = ntId;
  intl.callups[ntId] = squad.map((p) => p.id);
  intl.rel[ntId] = until;
  return squad;
}

/** Devolve os convocados aos clubes; `risk` = pode voltar machucado. */
export function release(w: World, ntId: string, risk: boolean) {
  const intl = w.intl!;
  const hurt: Player[] = [];
  for (const id of intl.callups[ntId] ?? []) {
    const p = w.players[id];
    if (!p || p.away !== ntId) continue;
    p.away = undefined;
    if (risk && p.injury === 0 && chance(0.015)) {
      p.injury = randInt(5, 21);
      p.injuryName = "Lesão a serviço da seleção";
      hurt.push(p);
    }
  }
  delete intl.callups[ntId];
  delete intl.rel[ntId];
  const mine = hurt.filter((p) => p.clubId === w.userClubId);
  if (mine.length) {
    worldNews(w, `🚑 ${mine.map((p) => p.name).join(", ")} volta${mine.length > 1 ? "m" : ""} machucado${mine.length > 1 ? "s" : ""} da seleção`,
      `${mine.map((p) => `${p.name}: ${p.injury} dias`).join(" · ")}.`, { force: true, kind: "injury", pid: mine[0].id });
  }
}

// ---------------------------------------------------------------- calendário do ano
const nextIntlId = (w: World) => w.nextId++;

function intlComp(w: World, id: string, format: Competition["format"], teams: string[], label: string, region: string): Competition {
  const meta = INTL_META[intlKind(id)];
  const comp: Competition = {
    id, name: meta.name, short: meta.short, format, season: w.season, teams, table: [], groups: [], ties: [],
    stage: format === "groups" ? "group" : format === "league" ? "league" : "friendly", done: false, color: meta.color, tier: 50, label, region,
  };
  w.intl!.comps[id] = comp;
  return comp;
}

function addIntlFixture(w: World, f: Omit<Fixture, "id">): Fixture {
  const fx: Fixture = { id: nextIntlId(w), ...f };
  w.intl!.fixtures.push(fx);
  return fx;
}

const ntPower = (_w: World, nt: NationalTeam) => nt.level;

/** Monta o calendário internacional do ano (idempotente): eliminatórias, Copa e amistosos nas datas livres. */
export function ensureIntlYear(w: World) {
  const intl = w.intl;
  if (!intl || intl.year === w.season) return;
  const y = w.season;
  intl.year = y;
  if (isWorldCupYear(y)) createTournament(w, "wc", y);
  if (isContinentalYear(y)) { createTournament(w, "euro", y); createTournament(w, "ca", y); }
  if (isContinentalYear(y + 1)) createEuroQualifiers(w, y + 1);
  // eliminatórias sul-americanas da próxima Copa: começam no ano seguinte à Copa, 18 rodadas em 2 anos
  if (isWorldCupYear(y - 1)) createQualifiers(w, y + 3);
  // amistosos para quem não joga nas datas FIFA
  const fr = intlComp(w, `fr-${y}`, "cup", [], String(y), "FIFA");
  const ids = Object.keys(intl.nts);
  for (const win of intlWindows(y)) {
    if (win.start <= w.day) continue;
    for (const day of win.days) {
      const busy = new Set<string>();
      for (const f of intl.fixtures) if (f.day === day) { busy.add(f.home); busy.add(f.away); }
      const free = ids.filter((id) => !busy.has(id))
        .map((id) => ({ id, s: ntPower(w, intl.nts[id]) + rand() * 8 }))
        .sort((a, b) => b.s - a.s).map((x) => x.id);
      for (let i = 0; i + 1 < free.length; i += 2) {
        const [h, a] = rand() < 0.5 ? [free[i], free[i + 1]] : [free[i + 1], free[i]];
        addIntlFixture(w, { comp: fr.id, stage: "friendly", round: 1, day, home: h, away: a });
        fr.teams.push(h, a);
      }
    }
  }
}

function createQualifiers(w: World, wcYear: number) {
  const intl = w.intl!;
  const teams = Object.values(intl.nts).filter((n) => n.confed === "CONMEBOL").map((n) => n.id).sort();
  if (teams.length < 4) return;
  const y = w.season;
  const comp = intlComp(w, `wcq-${wcYear}`, "league", teams, `${y}–${y + 1}`, "CONMEBOL");
  comp.carry = true;
  comp.table = teams.map(newRow);
  const days: number[] = [];
  for (const yy of [y, y + 1]) {
    const off = yy === y ? 0 : yearLen(y);
    for (const win of intlWindows(yy)) if (yy > y || win.start > w.day) days.push(...win.days.map((d) => d + off));
  }
  const rr = roundRobin(shuffle(teams.slice()));
  const all = [...rr, ...rr.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
  all.forEach((pairs, i) => {
    if (i >= days.length) return;
    for (const [home, away] of pairs) addIntlFixture(w, { comp: comp.id, stage: "league", round: i + 1, day: days[i], home, away });
  });
}

// ---------------------------------------------------------------- torneios (Copa do Mundo, Euro, Copa América)
export type TourKind = "wc" | "euro" | "ca";
export interface TourSpec {
  kind: TourKind; size: number; d0: number; callup: number; md: number[];
  ko: Record<string, number>; perDay: Record<string, number>; third: boolean; region: string;
}

/** Calendário de cada torneio (dias relativos a 1º/jan do ano). */
export function tourSpec(kind: TourKind, y: number): TourSpec {
  if (kind === "wc") {
    const d0 = dayOf(y, y, 5, 11); // abertura 11/jun, final 19/jul
    return { kind, size: 48, d0, callup: d0 - 10, md: [0, 5, 10], ko: { r32: d0 + 16, r16: d0 + 21, qf: d0 + 26, sf: d0 + 30, third: d0 + 37, final: d0 + 38 }, perDay: { r32: 4, r16: 2 }, third: true, region: "FIFA" };
  }
  if (kind === "euro") {
    const d0 = dayOf(y, y, 5, 9); // 9/jun a 9/jul
    return { kind, size: 24, d0, callup: d0 - 10, md: [0, 5, 10], ko: { r16: d0 + 16, qf: d0 + 21, sf: d0 + 25, final: d0 + 30 }, perDay: { r16: 2 }, third: false, region: "UEFA" };
  }
  const d0 = dayOf(y, y, 5, 12); // Copa América: 12/jun a 4/jul
  return { kind, size: 16, d0, callup: d0 - 10, md: [0, 4, 8], ko: { qf: d0 + 13, sf: d0 + 17, third: d0 + 21, final: d0 + 22 }, perDay: { qf: 2 }, third: true, region: "CONMEBOL" };
}

/** Compatibilidade: dias da Copa do Mundo. */
export function worldCupDays(y: number) {
  const t = tourSpec("wc", y);
  return { callup: t.callup, md: t.md.map((m) => t.d0 + m), r32: t.ko.r32, r16: t.ko.r16, qf: t.ko.qf, sf: t.ko.sf, third: t.ko.third, final: t.ko.final };
}

const byLevel = (a: NationalTeam, b: NationalTeam) => b.level - a.level || a.id.localeCompare(b.id);

/** As 48 seleções da Copa: lista oficial (wc2026) ou as melhores por confederação (eliminatórias para a CONMEBOL). */
export function worldCupEntrants(w: World, y: number): string[] {
  const intl = w.intl!;
  const all = Object.values(intl.nts);
  if (y === 2026) {
    const official = all.filter((n) => n.wc2026?.length).map((n) => n.id);
    if (official.length >= 32) {
      // completa até 48 com as mais fortes (repescagens que os dados não trazem)
      for (const n of all.slice().sort(byLevel)) if (official.length < 48 && !official.includes(n.id)) official.push(n.id);
      return official.slice(0, 48);
    }
  }
  const quota: Record<string, number> = { UEFA: 16, CAF: 9, AFC: 8, CONMEBOL: 6, CONCACAF: 6, OFC: 1 };
  const out: string[] = [];
  const q = intl.comps[`wcq-${y}`];
  const order = (confed: string) => {
    const list = all.filter((n) => n.confed === confed);
    if (confed === "CONMEBOL" && q?.table.length) {
      const pos = new Map(sortTable(q.table.slice()).map((r, i) => [r.club, i]));
      return list.sort((a, b) => (pos.get(a.id) ?? 99) - (pos.get(b.id) ?? 99));
    }
    return list.sort(byLevel);
  };
  for (const [confed, n] of Object.entries(quota)) out.push(...order(confed).slice(0, n).map((x) => x.id));
  const rest = all.filter((n) => !out.includes(n.id)).sort(byLevel);
  while (out.length < 48 && rest.length) out.push(rest.shift()!.id);
  return out.slice(0, 48);
}

/** Euro: anfitriões + os melhores das eliminatórias (ou por força). */
export function euroEntrants(w: World, y: number): string[] {
  const intl = w.intl!;
  const uefa = Object.values(intl.nts).filter((n) => n.confed === "UEFA");
  const hosts = ["nt-ENG", "nt-SCO", "nt-WAL", "nt-IRL"].filter((id) => intl.nts[id]);
  const q = intl.comps[`euroq-${y}`];
  let order: string[];
  if (q?.groups.length) {
    const rows = q.groups.flatMap((g) => sortTable(g.table.slice()).map((r, pos) => ({ id: r.club, pos, pts: r.pts, gd: r.gf - r.ga })));
    rows.sort((a, b) => a.pos - b.pos || b.pts - a.pts || b.gd - a.gd || a.id.localeCompare(b.id));
    order = rows.map((r) => r.id);
  } else order = uefa.sort(byLevel).map((n) => n.id);
  const out = [...hosts];
  for (const id of order) if (out.length < 24 && !out.includes(id)) out.push(id);
  return out;
}

/** Copa América: as 10 da CONMEBOL + 6 convidadas da CONCACAF. */
export function copaAmericaEntrants(w: World): string[] {
  const all = Object.values(w.intl!.nts);
  const sa = all.filter((n) => n.confed === "CONMEBOL").sort(byLevel).map((n) => n.id);
  const guests = all.filter((n) => n.confed === "CONCACAF").sort(byLevel).map((n) => n.id).slice(0, Math.max(0, 16 - sa.length));
  return [...sa, ...guests].slice(0, 16);
}

const TOUR_ID: Record<TourKind, string> = { wc: "wc", euro: "euro", ca: "ca" };

export function createTournament(w: World, kind: TourKind, y: number) {
  const intl = w.intl!;
  const spec = tourSpec(kind, y);
  if (spec.callup <= w.day) return; // save migrado com o torneio já começado: fica para o próximo
  const teams = kind === "wc" ? worldCupEntrants(w, y) : kind === "euro" ? euroEntrants(w, y) : copaAmericaEntrants(w);
  const nGroups = Math.floor(teams.length / 4);
  if (nGroups < 2) return;
  const comp = intlComp(w, `${TOUR_ID[kind]}-${y}`, "groups", teams.slice(0, nGroups * 4), String(y), spec.region);
  const sorted = comp.teams.slice().sort((a, b) => intl.nts[b].level - intl.nts[a].level || a.localeCompare(b));
  const pots = [0, 1, 2, 3].map((i) => shuffle(sorted.slice(i * nGroups, (i + 1) * nGroups)));
  let best: string[][] = [];
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const groups: string[][] = Array.from({ length: nGroups }, () => []);
    for (const pot of pots) shuffle(pot.slice()).forEach((t, i) => groups[i].push(t));
    let score = 0;
    if (kind === "wc") for (const g of groups) {
      const conf: Record<string, number> = {};
      for (const t of g) conf[intl.nts[t].confed] = (conf[intl.nts[t].confed] ?? 0) + 1;
      for (const [c, k] of Object.entries(conf)) score += Math.max(0, k - (c === "UEFA" ? 2 : 1));
    }
    if (score < bestScore) { bestScore = score; best = groups; }
    if (!score) break;
  }
  const letters = "ABCDEFGHIJKL";
  comp.groups = best.map((g, i) => ({ name: `Grupo ${letters[i] ?? i + 1}`, teams: g, table: g.map(newRow) }));
  comp.groups.forEach((g, gi) => {
    const rr = roundRobin(g.teams); // 3 rodadas
    rr.forEach((pairs, ri) => {
      for (const [home, away] of pairs) addIntlFixture(w, { comp: comp.id, stage: "group", round: ri + 1, day: spec.d0 + spec.md[ri] + (gi % 4), home, away, group: gi, neutral: true });
    });
  });
}

/** Compatibilidade: cria a Copa do Mundo do ano. */
export const createWorldCup = (w: World, y: number) => createTournament(w, "wc", y);

function intlTie(w: World, comp: Competition, stage: string, a: string, b: string, day: number) {
  const tie: Tie = { id: w.nextId++, comp: comp.id, stage, a, b, legs: 1, fixtures: [] };
  const f = addIntlFixture(w, { comp: comp.id, stage, round: 1, day, home: a, away: b, tie: tie.id, neutral: true });
  tie.fixtures.push(f.id);
  comp.ties.push(tie);
}

const tieRound = (comp: Competition, stage: string) => comp.ties.filter((t) => t.stage === stage);
const roundDone = (comp: Competition, stage: string) => { const t = tieRound(comp, stage); return t.length > 0 && t.every((x) => x.winner); };
const loserOf = (t: Tie) => (t.winner === t.a ? t.b : t.a);
const STAGE_FOR: Record<number, string> = { 32: "r32", 16: "r16", 8: "qf", 4: "sf", 2: "final" };
const NEXT: Record<string, string> = { r32: "r16", r16: "qf", qf: "sf", sf: "final" };
export const tourKindOf = (compId: string): TourKind | null => (["wc", "euro", "ca"].includes(intlKind(compId)) ? (intlKind(compId) as TourKind) : null);

function progressTournament(w: World, comp: Competition, kind: TourKind) {
  const intl = w.intl!;
  const spec = tourSpec(kind, comp.season);
  const shift = w.season > comp.season ? -yearLen(comp.season) : 0;
  const name = (id: string) => ntName(w, id);
  const spread = (pairs: [string, string][], stage: string) =>
    pairs.forEach(([a, b], i) => intlTie(w, comp, stage, a, b, spec.ko[stage] + shift + Math.floor(i / (spec.perDay[stage] ?? 1))));
  if (comp.stage === "group" && intl.fixtures.every((f) => f.comp !== comp.id || f.stage !== "group" || f.result)) {
    type Row = { club: string; pos: number; g: number; pts: number; gd: number; gf: number };
    const rows: Row[] = [];
    comp.groups.forEach((g, gi) => sortTable(g.table).forEach((r, pos) => rows.push({ club: r.club, pos, g: gi, pts: r.pts, gd: r.gf - r.ga, gf: r.gf })));
    const rank = (a: Row, b: Row) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club);
    const bracket = 2 ** Math.floor(Math.log2(3 * comp.groups.length));
    const firsts = rows.filter((r) => r.pos === 0).sort(rank);
    const seconds = rows.filter((r) => r.pos === 1).sort(rank);
    const thirds = rows.filter((r) => r.pos === 2).sort(rank);
    const seeds = [...firsts, ...seconds, ...thirds].slice(0, bracket);
    const n = seeds.length;
    const pairs: [Row, Row][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([seeds[i], seeds[n - 1 - i]]);
    // evita reencontro do mesmo grupo trocando adversários entre confrontos vizinhos
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i][0].g !== pairs[i][1].g) continue;
      const j = (i + 1) % pairs.length;
      [pairs[i][1], pairs[j][1]] = [pairs[j][1], pairs[i][1]];
    }
    const stage = STAGE_FOR[n];
    spread(pairs.map(([a, b]) => [a.club, b.club]), stage);
    comp.stage = stage;
    const out = rows.filter((r) => !seeds.includes(r)).map((r) => r.club);
    for (const id of out) intl.rel[id] = Math.min(intl.rel[id] ?? Infinity, w.day);
    worldNews(w, `${comp.name} ${comp.season}: fim da fase de grupos`, `Eliminados: ${out.map(name).join(", ")}.`, { force: out.includes("nt-BRA") });
  } else if (["r32", "r16", "qf"].includes(comp.stage) && roundDone(comp, comp.stage)) {
    const next = NEXT[comp.stage];
    const ts = tieRound(comp, comp.stage);
    const pairs: [string, string][] = [];
    for (let i = 0; i < ts.length / 2; i++) pairs.push([ts[i].winner!, ts[ts.length - 1 - i].winner!]);
    spread(pairs, next);
    for (const t of ts) intl.rel[loserOf(t)] = Math.min(intl.rel[loserOf(t)] ?? Infinity, w.day);
    comp.stage = next;
  } else if (comp.stage === "sf" && roundDone(comp, "sf")) {
    const ts = tieRound(comp, "sf");
    if (spec.third) intlTie(w, comp, "third", loserOf(ts[0]), loserOf(ts[1]), spec.ko.third + shift);
    else for (const t of ts) intl.rel[loserOf(t)] = Math.min(intl.rel[loserOf(t)] ?? Infinity, w.day);
    intlTie(w, comp, "final", ts[0].winner!, ts[1].winner!, spec.ko.final + shift);
    comp.stage = "final";
    worldNews(w, `Final: ${name(ts[0].winner!)} x ${name(ts[1].winner!)}`, `A decisão da ${comp.name} ${comp.season} está definida.`, { force: true });
  } else if (comp.stage === "final" && roundDone(comp, "final") && (!spec.third || roundDone(comp, "third"))) {
    const t = tieRound(comp, "final")[0];
    finishIntlComp(w, comp, t.winner!, loserOf(t));
    for (const id of comp.teams) intl.rel[id] = Math.min(intl.rel[id] ?? Infinity, w.day);
    worldNews(w, `🏆 ${name(t.winner!)} é campeã: ${comp.name} ${comp.season}!`, `${name(t.winner!)} vence ${name(loserOf(t))} na grande final.`, { force: true });
  }
}

// ---------------------------------------------------------------- Eliminatórias da Euro
/** Ano anterior à Euro: grupos de até 6 seleções da UEFA, turno e returno nas datas FIFA. */
function createEuroQualifiers(w: World, euroYear: number) {
  const intl = w.intl!;
  const uefa = Object.values(intl.nts).filter((n) => n.confed === "UEFA").sort(byLevel).map((n) => n.id);
  if (uefa.length < 8) return;
  const y = w.season;
  const g = Math.ceil(uefa.length / 6);
  const comp = intlComp(w, `euroq-${euroYear}`, "groups", uefa, String(y), "UEFA");
  const groups: string[][] = Array.from({ length: g }, () => []);
  // potes pela força, em serpentina
  uefa.forEach((id, i) => groups[Math.floor(i / g) % 2 ? g - 1 - (i % g) : i % g].push(id));
  comp.groups = groups.map((t, i) => ({ name: `Grupo ${"ABCDEFGHIJ"[i]}`, teams: t, table: t.map(newRow) }));
  const days = intlWindows(y).filter((win) => win.start > w.day).flatMap((win) => win.days);
  comp.groups.forEach((grp, gi) => {
    const rr = roundRobin(shuffle(grp.teams.slice()));
    const all = [...rr, ...rr.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
    all.forEach((pairs, ri) => {
      if (ri >= days.length) return;
      for (const [home, away] of pairs) addIntlFixture(w, { comp: comp.id, stage: "group", round: ri + 1, day: days[ri], home, away, group: gi });
    });
  });
}

function finishIntlComp(w: World, comp: Competition, winner: string, runnerUp?: string) {
  comp.champion = winner;
  comp.runnerUp = runnerUp;
  comp.stage = "done";
  comp.done = true;
  const nt = w.intl!.nts[winner];
  nt?.trophies.push({ comp: intlKind(comp.id), name: `${comp.name} ${comp.label ?? comp.season}`, season: comp.season });
  w.intl!.honors.push({ comp: intlKind(comp.id), name: comp.name, season: comp.season, winner, runnerUp });
}

export function progressIntl(w: World) {
  const intl = w.intl!;
  for (const comp of Object.values(intl.comps)) {
    if (comp.done) continue;
    const kind = intlKind(comp.id);
    const tk = tourKindOf(comp.id);
    if (tk) {
      for (let g = 0; g < 4; g++) { const s = comp.stage; progressTournament(w, comp, tk); if (s === comp.stage || comp.done) break; }
    } else if (intl.fixtures.every((f) => f.comp !== comp.id || f.result)) {
      if (kind === "euroq") {
        comp.stage = "done"; comp.done = true;
        worldNews(w, "Eliminatórias da Euro encerradas", `Classificados: ${euroEntrants(w, Number(comp.id.split("-")[1])).map((id) => ntName(w, id)).join(", ")}.`);
      } else if (kind === "wcq") {
        const t = sortTable(comp.table);
        finishIntlComp(w, comp, t[0].club, t[1]?.club);
        worldNews(w, "Eliminatórias encerradas", `Classificados: ${t.slice(0, 6).map((r) => ntName(w, r.club)).join(", ")}.`, { force: true });
      } else if (w.day > 340) {
        comp.stage = "done"; comp.done = true;
      }
    }
  }
}

// ---------------------------------------------------------------- dia a dia
/** Monta o time da seleção para um jogo (convoca na hora se preciso). */
function ntEleven(w: World, ntId: string, day: number): Player[] {
  const intl = w.intl!;
  if (!intl.callups[ntId]) callUp(w, ntId, day);
  const squad = (intl.callups[ntId] ?? []).map((id) => w.players[id]).filter(Boolean);
  return quickEleven(squad, undefined, ntId);
}

export function applyIntl(w: World, f: Fixture, xi: [Player[], Player[]]) {
  const intl = w.intl!;
  const comp = intl.comps[f.comp];
  const r = f.result!;
  if (f.stage === "league") applyToTable(comp.table, f.home, f.away, r.hg, r.ag);
  else if (f.stage === "group" && f.group !== undefined) applyToTable(comp.groups[f.group].table, f.home, f.away, r.hg, r.ag);
  if (f.tie) {
    const tie = comp.ties.find((t) => t.id === f.tie);
    if (tie) tie.winner = r.hg > r.ag ? f.home : r.ag > r.hg ? f.away : r.pens && r.pens[0] > r.pens[1] ? f.home : f.away;
  }
  xi.forEach((list) => list.forEach((p) => { p.caps = (p.caps ?? 0) + 1; }));
  for (const e of r.events) {
    if (e.type !== "goal" || e.pid == null) continue;
    const p = w.players[e.pid];
    if (!p) continue;
    p.intGoals = (p.intGoals ?? 0) + 1;
    p.compGoals[f.comp] = (p.compGoals[f.comp] ?? 0) + 1;
  }
  for (const [id, g, c] of [[f.home, r.hg, r.ag], [f.away, r.ag, r.hg]] as const) {
    const nt = intl.nts[id];
    nt.form.push(g > c ? "V" : g < c ? "D" : "E");
    if (nt.form.length > 5) nt.form.shift();
  }
  r.ratings = {};
  if (f.home === "nt-BRA" || f.away === "nt-BRA") {
    worldNews(w, `Seleção: ${ntName(w, f.home)} ${r.hg} x ${r.ag} ${ntName(w, f.away)}${r.pens ? ` (pên. ${r.pens[0]}-${r.pens[1]})` : ""}`,
      `${intl.comps[f.comp].name}. Gols: ${r.events.filter((e) => e.type === "goal" && e.pid != null).map((e) => w.players[e.pid!]?.name).filter(Boolean).join(", ") || "nenhum"}.`, { force: true });
  }
}

/** Simula os jogos de seleções do dia e avança os torneios. */
export function simulateIntlDay(w: World, day: number) {
  const intl = w.intl;
  if (!intl) return;
  let any = false;
  for (const f of intl.fixtures) {
    if (f.day !== day || f.result) continue;
    if (w.ntJob && (f.home === w.ntJob || f.away === w.ntJob)) continue; // o usuário joga a partida
    const xiH = ntEleven(w, f.home, day), xiA = ntEleven(w, f.away, day);
    const nH = intl.nts[f.home], nA = intl.nts[f.away];
    const sH = 0.7 * elevenStrength(xiH, nH.level) + 0.3 * nH.level;
    const sA = 0.7 * elevenStrength(xiA, nA.level) + 0.3 * nA.level;
    f.result = quickResult(xiH, xiA, sH, sA, { neutral: f.neutral, penalties: !!f.tie });
    applyIntl(w, f, [xiH, xiA]);
    any = true;
  }
  if (any) progressIntl(w);
}

/** Processamento diário das seleções: calendário do ano, convocações e retorno dos jogadores. */
export function intlDaily(w: World) {
  const intl = w.intl;
  if (!intl) return;
  ensureIntlYear(w);
  ntJobTick(w);
  const day = w.day;
  // devolve quem terminou a data FIFA (ou foi eliminado)
  for (const [id, until] of Object.entries(intl.rel)) if (until < day) release(w, id, true);
  // datas FIFA: convoca no primeiro dia
  const win = intlWindows(w.season).find((x) => x.start === day);
  let idx: Map<string, Player> | undefined;
  const called: Player[] = [];
  if (win) {
    const playing = new Set<string>();
    for (const f of intl.fixtures) if (f.day >= win.start && f.day <= win.end) { playing.add(f.home); playing.add(f.away); }
    for (const id of playing) called.push(...callUp(w, id, win.end));
  }
  // torneios: convocação dez dias antes da abertura, até a eliminação
  for (const kind of ["wc", "euro", "ca"] as const) {
    const t = intl.comps[`${kind}-${w.season}`];
    const spec = tourSpec(kind, w.season);
    if (!t || t.done || day !== spec.callup) continue;
    idx ??= keyIndex(w);
    for (const id of t.teams) called.push(...callUp(w, id, spec.ko.final, 26, kind === "wc" && w.season === 2026 ? intl.nts[id].wc2026 : undefined, idx));
    worldNews(w, `Convocações: ${t.name} ${w.season}`, `${t.teams.length} seleções anunciaram suas listas de 26 jogadores.`, { force: true });
  }
  if (called.length) callupNews(w, called);
}

function callupNews(w: World, called: Player[]) {
  const mine = called.filter((p) => p.clubId === w.userClubId);
  const bra = called.filter((p) => p.away === "nt-BRA");
  if (bra.length) {
    worldNews(w, "📋 Convocação da Seleção Brasileira",
      bra.slice().sort((a, b) => b.ovr - a.ovr).map((p) => `${p.name} (${w.clubs[p.clubId!]?.name ?? "—"})`).join(", ") + ".", { force: true });
  }
  if (mine.length) {
    worldNews(w, `🌍 Data FIFA: ${mine.length} convocado${mine.length > 1 ? "s" : ""} do seu elenco`,
      `${mine.map((p) => `${p.name} (${ntName(w, p.away!)})`).join(", ")}. Eles desfalcam o time enquanto estiverem com a seleção.`, { force: true, pid: mine[0].id });
  }
}

// ---------------------------------------------------------------- virada do ano
/** Fim do ano: tira torneios encerrados e desloca os jogos que continuam (eliminatórias) para o novo ano. */
export function intlYearEnd(w: World, prevYear: number) {
  const intl = w.intl;
  if (!intl) return;
  for (const id of Object.keys(intl.rel)) release(w, id, false);
  const keep = new Set(Object.values(intl.comps).filter((c) => c.carry && !c.done).map((c) => c.id));
  for (const id of Object.keys(intl.comps)) if (!keep.has(id)) delete intl.comps[id];
  const shift = yearLen(prevYear);
  intl.fixtures = intl.fixtures.filter((f) => keep.has(f.comp));
  for (const f of intl.fixtures) f.day -= shift;
}

/** Jogos de seleções ainda pendentes antes de `day` (para fechar o ano). */
export const pendingIntlBefore = (w: World, day: number) => (w.intl?.fixtures ?? []).filter((f) => !f.result && f.day < day);

export type { IntlState };
