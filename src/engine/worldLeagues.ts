import { progressHooks } from "./hooks";
// Ligas estrangeiras (Europa e resto do mundo): criação da temporada ago–mai, avanço, títulos,
// finanças por liga, simulação rápida dos jogos sem o usuário e a virada do ano (competições "carry").
import type { WorldData } from "../data/worldTypes";
import { euroLeagueDays, yearLen } from "./calendar";
import { addFixture, compFixtures, needsPenalties, newComp, newRow, registerComp, resetFixtureIndex, roundRobin, sortTable, stageDone } from "./competitions";
import { elevenStrength, quickEleven, quickResult } from "./fastsim";
import { squadOf } from "./lineup";
import { addNews } from "./news";
import { shuffle } from "./rng";
import type { Club, Competition, Fixture, MatchResult, NewsKind, World } from "./types";
import { createUefaSeason, UEFA_METAS } from "./uefa";
import { registerYearMetas } from "./worldYear";
import { createAcle, registerContinentalMetas } from "./continental";

export { LEAGUE_MONEY, leagueWageMult, worldBalance } from "./worldMoney";

export const isWorldClub = (c: Club | undefined) => !!c?.league;

/** Notícia do exterior: no máximo 3 por semana, a menos que seja forçada (envolve o usuário ou o Brasil). */
export function worldNews(w: World, title: string, body: string, opts: { force?: boolean; kind?: NewsKind; clubId?: string; pid?: number } = {}) {
  if (!opts.force) {
    let n = 0;
    for (let i = w.news.length - 1; i >= 0 && n < 3; i--) {
      const it = w.news[i];
      if (it.season !== w.season || it.day < w.day - 6) break;
      if (it.world) n++;
    }
    if (n >= 3) return;
  }
  addNews(w, opts.kind ?? "season", title, body, { world: true, clubId: opts.clubId, pid: opts.pid });
}

// ---------------------------------------------------------------- metadados
export function registerWorldMetas(w: World) {
  if (!w.wl) return;
  Object.values(w.wl.leagues).forEach((l, i) => registerComp(l.id, { name: l.name, short: l.short, color: l.color, tier: 30 + i }));
  for (const [id, m] of Object.entries(UEFA_METAS)) registerComp(id, m);
  registerYearMetas(w);
  registerContinentalMetas();
}

export function initWorldLeagues(w: World, data: WorldData, migrating: boolean) {
  const leagues: NonNullable<World["wl"]>["leagues"] = {};
  for (const l of data.leagues) {
    leagues[l.id] = { id: l.id, name: l.name, short: l.short, country: l.country, confed: l.confed, calendar: l.calendar, relegation: l.relegation, color: l.color };
  }
  const ucl = data.leagues.flatMap((l) => l.ucl2026Seeds ?? []);
  const uel = data.leagues.flatMap((l) => l.uel2026Seeds ?? []);
  w.wl = {
    leagues,
    // save antigo depois de 1º/jul: as ligas só começam no ano seguinte
    startYear: migrating && w.day >= 181 ? w.season + 1 : w.season,
    seeds: ucl.length || uel.length ? { ucl, uel } : undefined,
  };
  registerWorldMetas(w);
}

export const leagueClubs = (w: World, id: string) =>
  Object.values(w.clubs).filter((c) => c.league === id).map((c) => c.id).sort();

// ---------------------------------------------------------------- criação (dia 181)
/** Temporada label "2026/27". */
export const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

/** Remove uma competição encerrada e os jogos dela. */
export function dropComp(w: World, id: string) {
  delete w.comps[id];
  w.fixtures = w.fixtures.filter((f) => f.comp !== id);
  resetFixtureIndex();
}

/** No dia 181: fecha as temporadas ago–mai anteriores e cria as novas (ligas, Champions e Europa League). */
export function createWorldSeason(w: World) {
  const wl = w.wl;
  if (!wl || w.season < wl.startYear || wl.createdYear === w.season) return;
  const y = w.season;
  // tabelas finais da temporada anterior (para as vagas continentais)
  const prev: Record<string, string[]> = {};
  for (const l of Object.values(wl.leagues)) {
    if (l.calendar !== "aug-may") continue;
    const old = w.comps[l.id];
    if (old) { prev[l.id] = sortTable(old.table.slice()).map((r) => r.club); dropComp(w, l.id); }
  }
  const prevUcl = w.comps.ucl?.champion;
  for (const id of [...Object.keys(UEFA_METAS), "acle"]) if (w.comps[id]) dropComp(w, id);
  for (const l of Object.values(wl.leagues)) {
    if (l.calendar !== "aug-may") continue;
    const teams = leagueClubs(w, l.id);
    if (teams.length < 4) continue;
    const comp = newComp(w, l.id, "league", teams);
    Object.assign(comp, { carry: true, lite: true, label: seasonLabel(y), region: l.confed });
    w.comps[l.id] = comp;
    const rounds = roundRobin(shuffle(teams.slice()));
    const all = [...rounds, ...rounds.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
    const days = euroLeagueDays(y, all.length);
    all.forEach((pairs, i) => {
      for (const [home, away] of pairs) addFixture(w, { comp: l.id, stage: "league", round: i + 1, day: days[i], home, away });
    });
    comp.table = teams.map(newRow);
  }
  wl.createdYear = y;
  createUefaSeason(w, prev, prevUcl);
  createAcle(w, prev);
  worldNews(w, `Começa a temporada europeia ${seasonLabel(y)}`, "As grandes ligas da Europa voltam a campo em agosto. Acompanhe tudo em Competições › Europa.", { force: true });
}

// ---------------------------------------------------------------- avanço
/** Entrega o troféu de uma competição do mundo assim que ela termina (não espera o fim do ano brasileiro). */
export function awardWorldComp(w: World, comp: Competition) {
  if (comp.awarded || !comp.champion) return;
  comp.awarded = true;
  const club = w.clubs[comp.champion];
  club?.trophies.push({ comp: comp.id, name: `${comp.name} ${comp.label ?? comp.season}`, season: comp.season });
}

function progressLeague(w: World, comp: Competition): boolean {
  if (!w.wl?.leagues[comp.id] || comp.format !== "league") return false;
  if (comp.stage !== "league" || !stageDone(w, comp, "league")) return true;
  sortTable(comp.table);
  comp.champion = comp.table[0].club;
  comp.runnerUp = comp.table[1]?.club;
  const rel = w.wl.leagues[comp.id].relegation;
  if (rel > 0) comp.relegated = comp.table.slice(-rel).map((r) => r.club); // zona de rebaixamento (liga fechada no jogo)
  comp.stage = "done";
  comp.done = true;
  awardWorldComp(w, comp);
  const up = comp.table.findIndex((r) => r.club === w.userClubId);
  if (up >= 0) w.wl.userLast = { comp: comp.id, pos: up + 1, season: comp.season, year: w.season };
  const champ = w.clubs[comp.champion];
  worldNews(w, `🏆 ${champ.name} é campeão: ${comp.name} ${comp.label}`, `${champ.full} conquista o título com ${comp.table[0].pts} pontos.`, { force: comp.champion === w.userClubId, clubId: champ.id });
  return true;
}
progressHooks.push((w, comp) => progressLeague(w, comp));

// ---------------------------------------------------------------- simulação rápida
/** Resultado rápido de um jogo de clubes (liga estrangeira, Champions...). */
export function fastFixture(w: World, f: Fixture): MatchResult {
  const H = w.clubs[f.home], A = w.clubs[f.away];
  const xiH = quickEleven(squadOf(w, H), f.comp), xiA = quickEleven(squadOf(w, A), f.comp);
  const r = quickResult(xiH, xiA, elevenStrength(xiH, H.level - 4), elevenStrength(xiA, A.level - 4), { neutral: f.neutral });
  if (needsPenalties(w, f, r.hg, r.ag)) {
    let a = 3 + Math.floor((r.hg * 7 + f.id) % 3), b = 3 + Math.floor((r.ag * 5 + f.id * 3) % 3);
    if (a === b) a++;
    r.pens = [a, b];
  }
  return r;
}

/** Guarda menos dados dos jogos do mundo já disputados (save menor). */
export function compactResult(r: MatchResult) {
  r.ratings = {};
  r.lineups = [[], []];
  r.events = r.events.filter((e) => e.type === "goal" || e.type === "pen-goal" || e.type === "owngoal");
}

// ---------------------------------------------------------------- virada do ano
export interface Carry { comps: Competition[]; fixtures: Fixture[] }

/** Separa as competições que atravessam o ano (ainda em andamento) antes de startSeason zerar tudo. */
export function takeCarry(w: World): Carry {
  const comps = Object.values(w.comps).filter((c) => c.carry && !c.done);
  const ids = new Set(comps.map((c) => c.id));
  // competições "carry" já encerradas também ficam (tabela final e vagas continentais no dia 181)
  for (const c of Object.values(w.comps)) if (c.carry && c.done) { comps.push(c); ids.add(c.id); }
  const fixtures = w.fixtures.filter((f) => ids.has(f.comp));
  return { comps, fixtures };
}

/** Recoloca as competições carregadas, com os dias deslocados para o novo ano. */
export function restoreCarry(w: World, carry: Carry, prevYear: number) {
  const shift = yearLen(prevYear);
  for (const c of carry.comps) w.comps[c.id] = c;
  for (const f of carry.fixtures) { f.day -= shift; w.fixtures.push(f); }
  resetFixtureIndex();
}

/** Ids das competições que atravessam o ano (gols/cartões/suspensões nelas são preservados). */
export const carryCompIds = (w: World) => new Set(Object.values(w.comps).filter((c) => c.carry).map((c) => c.id));

/** Jogos do mundo que ainda faltam nesse ano (dezembro, depois do fim do Brasileirão). */
export function pendingWorldBefore(w: World, day: number): Fixture[] {
  const out: Fixture[] = [];
  for (const c of Object.values(w.comps)) if (c.carry) for (const f of compFixtures(w, c.id)) if (!f.result && f.day < day) out.push(f);
  return out;
}
