// Campeonatos estaduais (jan–mar): formatos simplificados, clubes fictícios para completar
// as chaves, premiação e cobrança da diretoria.
import { ESTADUAIS, ESTADUAL_BY_ID, ESTADUAL_PRIZES, isEstadualId, type EstadualDef } from "../data/estaduais";
import { estadualDays } from "./calendar";
import { addFixture, createTie, newRow, roundRobin, sortTable } from "./competitions";
import { awardPrize } from "./finance";
import { addNews } from "./news";
import { generatePlayer, wageFor } from "./player";
import { clamp, hashString, randInt, shuffle } from "./rng";
import { freeShirt } from "./transfers";
import type { Club, Competition, CrestPattern, Pos, TableRow, World } from "./types";

export { ESTADUAIS, isEstadualId };
export const isEstadual = (comp: Competition) => isEstadualId(comp.id);

const strength = (c: Club) => c.level + c.rep / 20;

/** Clubes reais do estado (os mais fortes primeiro). */
function realClubs(w: World, def: EstadualDef): Club[] {
  return Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.region === def.uf && !c.minor)
    .sort((a, b) => strength(b) - strength(a) || a.id.localeCompare(b.id));
}

const CRESTS: CrestPattern[] = ["solid", "vstripes", "hoops", "sash", "diagonal", "halves", "band", "star", "circle", "chevron"];
const PALETTE = ["#FFFFFF", "#000000", "#C8102E", "#0033A0", "#007A33", "#FFD100", "#6B2C91", "#F47B20", "#7A1F1F", "#0B6E99"];
const SQUAD: Pos[] = ["GOL", "GOL", "ZAG", "ZAG", "ZAG", "ZAG", "LD", "LD", "LE", "LE", "VOL", "VOL", "MC", "MC", "MEI", "MEI", "PD", "PD", "PE", "PE", "ATA", "ATA", "ATA"];

function makeMinorClub(w: World, def: EstadualDef, i: number): Club {
  const [name, full, abbr, city] = def.minors[i];
  const h = hashString(`${def.id}:${i}`);
  const c1 = PALETTE[2 + (h % (PALETTE.length - 2))];
  const c2 = h % 3 === 0 ? "#000000" : "#FFFFFF";
  const rep = 10 + (h % 12);
  const level = 56 + (h % 4);
  const club: Club = {
    id: `${def.id.toLowerCase()}-${i + 1}`, name, full, abbr, region: def.uf, city, country: "BRA",
    colors: [c1, c2, c1], crest: CRESTS[h % CRESTS.length],
    stadium: `Estádio Municipal de ${city}`, capacity: 3000 + (h % 10) * 1000,
    rep, level, div: "D", balance: 300_000 + rep * rep * 200,
    players: [], tactic: { formation: "4-4-2", mentality: 0, pressing: 1 },
    youthLevel: 1, youthFac: 1, youthCoach: 1, facilities: 1, ticket: 12,
    history: [], trophies: [], finance: { income: {}, expense: {} },
    jersey: "football", minor: def.uf,
  };
  w.clubs[club.id] = club;
  for (const pos of SQUAD) {
    const p = generatePlayer(w, club, level - 2 + randInt(-2, 2), randInt(19, 32), pos);
    p.wage = Math.round(wageFor(p.ovr, rep, w.season - p.born) * 0.6);
    p.contractEnd = w.season + randInt(1, 2);
    p.pot = Math.max(p.pot, p.ovr);
    p.shirt = freeShirt(w, club, pos);
  }
  return club;
}

/** Garante os clubes fictícios necessários para completar cada estadual (idempotente). */
export function ensureMinorClubs(w: World) {
  for (const def of ESTADUAIS) {
    const need = def.size - Math.min(def.size, realClubs(w, def).length);
    for (let i = 0; i < Math.min(need, def.minors.length); i++) {
      if (!w.clubs[`${def.id.toLowerCase()}-${i + 1}`]) makeMinorClub(w, def, i);
    }
  }
}

function entrants(w: World, def: EstadualDef): string[] {
  const real = realClubs(w, def).slice(0, def.size).map((c) => c.id);
  const minors = Object.values(w.clubs).filter((c) => c.minor === def.uf).map((c) => c.id).sort();
  return [...real, ...minors].slice(0, def.size);
}

/** Cria os estaduais da temporada (chamado por createSeasonCompetitions). */
export function createEstaduais(w: World) {
  ensureMinorClubs(w);
  const d = estadualDays(w.season);
  ESTADUAIS.forEach((def, i) => {
    const teams = entrants(w, def);
    if (teams.length < def.size) return;
    const comp: Competition = {
      id: def.id, name: def.name, short: def.short, format: def.format === "groups16" ? "groups" : "league",
      season: w.season, teams, table: [], groups: [], ties: [], stage: def.format === "groups16" ? "group" : "league",
      done: false, color: def.color, tier: 10 + i,
    };
    w.comps[def.id] = comp;
    if (def.format === "groups16") {
      // potes por força; cada grupo recebe um de cada pote; turno e returno dentro do grupo
      const sorted = teams.slice().sort((a, b) => strength(w.clubs[b]) - strength(w.clubs[a]));
      const pots = [0, 1, 2, 3].map((k) => shuffle(sorted.slice(k * 4, k * 4 + 4)));
      const groups: string[][] = [[], [], [], []];
      for (const pot of pots) pot.forEach((t, gi) => groups[gi].push(t));
      comp.groups = groups.map((g, gi) => ({ name: `Grupo ${"ABCD"[gi]}`, teams: g, table: g.map(newRow) }));
      comp.groups.forEach((g, gi) => {
        const rr = roundRobin(g.teams);
        const all = [...rr, ...rr.map((r) => r.map(([h, a]) => [a, h] as [string, string]))];
        all.forEach((pairs, ri) => {
          for (const [home, away] of pairs) addFixture(w, { comp: def.id, stage: "group", round: ri + 1, day: d.rounds[ri], home, away, group: gi });
        });
      });
    } else {
      const rr = roundRobin(shuffle(teams.slice()));
      rr.forEach((pairs, ri) => {
        for (const [home, away] of pairs) addFixture(w, { comp: def.id, stage: "league", round: ri + 1, day: d.rounds[ri], home, away });
      });
      comp.table = teams.map(newRow);
    }
  });
  setEstadualExpectation(w);
}

// ---------------------------------------------------------------- diretoria
const GOAL_TEXT = {
  title: "Ser campeão",
  final: "Chegar à final",
  semi: "Chegar às semifinais",
  none: "Fazer uma campanha digna",
} as const;

/** Cobrança da diretoria no estadual: os grandes do estado têm de ser campeões. */
export function setEstadualExpectation(w: World) {
  const comp = Object.values(w.comps).find((c) => isEstadual(c) && c.teams.includes(w.userClubId));
  if (!comp) { w.board.estadual = undefined; return; }
  const ranked = comp.teams.slice().sort((a, b) => strength(w.clubs[b]) - strength(w.clubs[a]));
  const rank = ranked.indexOf(w.userClubId) + 1;
  const user = w.clubs[w.userClubId];
  const code = rank === 1 || (rank <= 3 && user.div === "A" && user.rep >= 80) ? "title" : rank <= 2 || (rank <= 4 && user.div === "A") ? "final" : rank <= 4 ? "semi" : "none";
  const text = `${comp.short}: ${GOAL_TEXT[code]}`;
  w.board.estadual = { comp: comp.id, code, text, season: w.season };
  addNews(w, "board", `🎯 Meta no ${comp.short}`, `A diretoria espera: ${GOAL_TEXT[code].toLowerCase()} no ${comp.name} ${w.season}.`);
}

function judgeEstadual(w: World, comp: Competition) {
  const goal = w.board.estadual;
  if (!goal || goal.comp !== comp.id || goal.season !== w.season || goal.judged) return;
  goal.judged = true;
  const u = w.userClubId;
  const reached = comp.champion === u ? 3 : comp.runnerUp === u ? 2 : comp.ties.some((t) => t.stage === "sf" && (t.a === u || t.b === u)) ? 1 : 0;
  const need = { title: 3, final: 2, semi: 1, none: 0 }[goal.code];
  let delta: number;
  let msg: string;
  if (reached >= need) {
    delta = comp.champion === u ? 8 : 3;
    msg = comp.champion === u ? `Título do ${comp.short}! A diretoria comemora.` : `Meta cumprida no ${comp.short}.`;
  } else {
    delta = goal.code === "title" ? -10 : goal.code === "final" ? -6 : -4;
    msg = `A diretoria não gostou da campanha no ${comp.short} (meta: ${GOAL_TEXT[goal.code].toLowerCase()}).`;
  }
  w.board.confidence = clamp(w.board.confidence + delta, w.settings.casual ? 5 : 0, 100);
  addNews(w, "board", delta > 0 ? "🏛️ Diretoria satisfeita" : "🏛️ Diretoria cobra o time", msg);
}

// ---------------------------------------------------------------- andamento
const stageDone = (w: World, comp: Competition, stage: string) =>
  w.fixtures.every((f) => f.comp !== comp.id || f.stage !== stage || !!f.result);
const ties = (comp: Competition, stage: string) => comp.ties.filter((t) => t.stage === stage);
const tiesDone = (comp: Competition, stage: string) => ties(comp, stage).length > 0 && ties(comp, stage).every((t) => !!t.winner);
const winners = (comp: Competition, stage: string) => ties(comp, stage).map((t) => t.winner!).filter(Boolean);

/** Classificação geral da primeira fase (para mandos e cruzamentos). */
function campaign(comp: Competition): string[] {
  const rows: TableRow[] = comp.format === "groups" ? comp.groups.flatMap((g) => g.table) : comp.table;
  return sortTable(rows.slice()).map((r) => r.club);
}

export function progressEstadual(w: World, comp: Competition, news: string[]) {
  const def = ESTADUAL_BY_ID[comp.id];
  if (!def) return;
  const d = estadualDays(comp.season);
  const name = (id: string) => w.clubs[id]?.name ?? id;
  const seed = (id: string) => campaign(comp).indexOf(id);
  const bySeed = (ids: string[]) => ids.slice().sort((a, b) => seed(a) - seed(b));

  if (comp.stage === "group" && stageDone(w, comp, "group")) {
    const g = comp.groups.map((gr) => sortTable(gr.table).map((r) => r.club));
    // 1º de um grupo recebe o 2º do grupo vizinho; jogo único, empate vai para os pênaltis
    for (const [x, z] of [[0, 1], [1, 0], [2, 3], [3, 2]]) createTie(w, comp, "qf", g[x][0], g[z][1], 1, d.qf);
    comp.stage = "qf";
  } else if (comp.stage === "league" && stageDone(w, comp, "league")) {
    const t = sortTable(comp.table).map((r) => r.club);
    createTie(w, comp, "sf", t[0], t[3], 1, d.sf);
    createTie(w, comp, "sf", t[1], t[2], 1, d.sf);
    comp.stage = "sf";
  } else if (comp.stage === "qf" && tiesDone(comp, "qf")) {
    const s = bySeed(winners(comp, "qf"));
    createTie(w, comp, "sf", s[0], s[3], 1, d.sf);
    createTie(w, comp, "sf", s[1], s[2], 1, d.sf);
    comp.stage = "sf";
  } else if (comp.stage === "sf" && tiesDone(comp, "sf")) {
    const [best, other] = bySeed(winners(comp, "sf"));
    // final em ida e volta: a melhor campanha decide em casa
    createTie(w, comp, "final", other, best, 2, d.final);
    comp.stage = "final";
  } else if (comp.stage === "final" && tiesDone(comp, "final")) {
    const t = ties(comp, "final")[0];
    comp.champion = t.winner;
    comp.runnerUp = t.winner === t.a ? t.b : t.a;
    comp.stage = "done";
    comp.done = true;
    news.push(`🏆 ${name(t.winner!)} é campeão do ${comp.name} ${comp.season}!`);
    awardEstadualPrizes(w, comp, def);
    judgeEstadual(w, comp);
  }
}

function awardEstadualPrizes(w: World, comp: Competition, def: EstadualDef) {
  const P = ESTADUAL_PRIZES;
  for (const id of comp.teams) {
    let v = P.team;
    if (comp.ties.some((t) => t.stage === "qf" && (t.a === id || t.b === id))) v += P.qf;
    if (comp.ties.some((t) => t.stage === "sf" && (t.a === id || t.b === id))) v += P.sf;
    if (comp.champion === id) v += P.champion;
    else if (comp.runnerUp === id) v += P.runnerUp;
    awardPrize(w, id, Math.round((v * def.prize) / 10_000) * 10_000);
  }
}

/** Quantos estaduais o clube venceu (sala de troféus / histórico). */
export function estadualTitles(c: Club): number {
  return c.trophies.filter((t) => isEstadualId(t.comp)).length;
}
