// Campeonatos estaduais (jan–mar): formatos simplificados, clubes reais de cada estado (fictícios só
// como último recurso), premiação e cobrança da diretoria.
import { ESTADUAIS, ESTADUAL_BY_ID, ESTADUAL_PRIZES, isEstadualId, type EstadualDef } from "../data/estaduais";
import { estadualDays } from "./calendar";
import { addFixture, createTie, newRow, roundRobin, sortTable } from "./competitions";
import { awardPrize } from "./finance";
import { addNews } from "./news";
import { generatePlayer, wageFor } from "./player";
import { clamp, getRngState, hashString, randInt, setRngState, shuffle } from "./rng";
import { freeShirt } from "./transfers";
import type { Club, Competition, CrestPattern, Pos, TableRow, World } from "./types";
import type { Database, DbClub, DbPlayer } from "./world";

export { ESTADUAIS, isEstadualId };
export const isEstadual = (comp: Competition) => isEstadualId(comp.id);

const strength = (c: Club) => c.level + c.rep / 20;

/** Clube fictício (inventado para completar a chave). Saves antigos não têm a flag: o id "est-xx-n" denuncia. */
export const isFictional = (c: Club) => !!c.fictional || /^est-[a-z]{2}-\d+$/.test(c.id);

/** Clubes reais do estado (os mais fortes primeiro). */
function realClubs(w: World, def: EstadualDef): Club[] {
  return Object.values(w.clubs)
    .filter((c) => c.country === "BRA" && c.region === def.uf && !isFictional(c))
    .sort((a, b) => strength(b) - strength(a) || a.id.localeCompare(b.id));
}

const CRESTS: CrestPattern[] = ["solid", "vstripes", "hoops", "sash", "diagonal", "halves", "band", "star", "circle", "chevron"];
const PALETTE = ["#FFFFFF", "#000000", "#C8102E", "#0033A0", "#007A33", "#FFD100", "#6B2C91", "#F47B20", "#7A1F1F", "#0B6E99"];
const SQUAD: Pos[] = ["GOL", "GOL", "ZAG", "ZAG", "ZAG", "ZAG", "LD", "LD", "LE", "LE", "VOL", "VOL", "MC", "MC", "MEI", "MEI", "PD", "PD", "PE", "PE", "ATA", "ATA", "ATA"];

/** Elenco de 23 jogadores gerados na força do clube. */
function generateSquad(w: World, club: Club, wageMult: number) {
  for (const pos of SQUAD) {
    const p = generatePlayer(w, club, club.level - 2 + randInt(-2, 2), randInt(19, 32), pos);
    p.wage = Math.round(wageFor(p.ovr, club.rep, w.season - p.born) * wageMult);
    p.contractEnd = w.season + randInt(1, 2);
    p.pot = Math.max(p.pot, p.ovr);
    p.shirt = freeShirt(w, club, pos);
  }
}

/**
 * Clube real dos estaduais sem elenco publicado (flag genSquad): nome, escudo, estádio e cores reais,
 * jogadores gerados com semente fixa pelo id do clube (o mesmo elenco em qualquer jogo novo).
 */
export function generateRealSquad(w: World, club: Club) {
  if (club.players.some((id) => w.players[id] && !w.players[id].youth)) return;
  const saved = getRngState();
  setRngState(hashString(`squad:${club.id}`) || 1);
  generateSquad(w, club, 0.7);
  setRngState(saved);
}

function makeMinorClub(w: World, def: EstadualDef, i: number): Club {
  const [name, full, abbr, city] = def.minors[i];
  const h = hashString(`${def.id}:${i}`);
  const c1 = PALETTE[2 + (h % (PALETTE.length - 2))];
  const c2 = h % 3 === 0 ? "#000000" : "#FFFFFF";
  const rep = 10 + (h % 12);
  const level = 50 + (h % 4);
  const club: Club = {
    id: `${def.id.toLowerCase()}-${i + 1}`, name, full, abbr, region: def.uf, city, country: "BRA",
    colors: [c1, c2, c1], crest: CRESTS[h % CRESTS.length],
    stadium: `Estádio Municipal de ${city}`, capacity: 3000 + (h % 10) * 1000,
    rep, level, div: "D", balance: 300_000 + rep * rep * 200,
    players: [], tactic: { formation: "4-4-2", mentality: 0, pressing: 1 },
    youthLevel: 1, youthFac: 1, youthCoach: 1, facilities: 1, ticket: 12,
    history: [], trophies: [], finance: { income: {}, expense: {} },
    jersey: "football", minor: def.uf, fictional: true,
  };
  w.clubs[club.id] = club;
  generateSquad(w, club, 0.6);
  return club;
}

/**
 * Último recurso: clubes fictícios só quando o estado não tem clubes reais suficientes para a chave
 * (com o banco atual isso não acontece em nenhum estadual). Idempotente.
 */
export function ensureMinorClubs(w: World) {
  for (const def of ESTADUAIS) {
    const need = def.size - Math.min(def.size, realClubs(w, def).length);
    for (let i = 0; i < Math.min(need, def.minors.length); i++) {
      if (!w.clubs[`${def.id.toLowerCase()}-${i + 1}`]) makeMinorClub(w, def, i);
    }
  }
}

/** Participantes: os reais da edição 2026 (por força) → outros reais do estado → fictícios só se faltar gente. */
export function estadualEntrants(w: World, def: EstadualDef): string[] {
  const real = realClubs(w, def);
  const listed = new Set(def.real2026);
  const ordered = [...real.filter((c) => listed.has(c.id)), ...real.filter((c) => !listed.has(c.id))].map((c) => c.id);
  const fict = Object.values(w.clubs).filter((c) => c.region === def.uf && isFictional(c)).map((c) => c.id).sort();
  return [...ordered, ...fict].slice(0, def.size);
}

// ---------------------------------------------------------------- saves antigos
type MigrateHelpers = {
  makeClub: (c: DbClub) => Club;
  addDbPlayer: (w: World, dp: DbPlayer) => void;
  fillSquad: (w: World, club: Club) => void;
};

/**
 * Saves antigos (idempotente, sem mudar SAVE_VERSION): os clubes reais dos estaduais que faltam entram
 * já (fora de qualquer competição, então não mexem nos jogos da temporada em andamento) e os fictícios
 * ficam marcados para sair na virada da temporada (w.pendingEstadualSwap).
 */
export function migrateRealEstaduais(w: World, db: Database, h: MigrateHelpers) {
  const missing = db.clubs.filter((c) => c.minor && !w.clubs[c.id]);
  if (missing.length) {
    const saved = getRngState();
    for (const dc of missing) {
      setRngState(hashString(`club:${dc.id}`) || 1);
      const club = h.makeClub(dc);
      w.clubs[club.id] = club;
      for (const dp of db.players) if (dp.c === club.id) h.addDbPlayer(w, dp);
      if (club.genSquad) generateRealSquad(w, club);
      h.fillSquad(w, club);
    }
    setRngState(saved);
  }
  for (const c of Object.values(w.clubs)) if (isFictional(c) && !c.fictional) c.fictional = true;
  const anyFictional = Object.values(w.clubs).some((c) => c.fictional);
  if (anyFictional) w.pendingEstadualSwap = true;
  else delete w.pendingEstadualSwap;
}

/**
 * Virada da temporada (chamado por createEstaduais, com os jogos da temporada anterior já encerrados):
 * tira os fictícios que os clubes reais tornaram desnecessários e limpa as referências a eles
 * (empréstimos, cláusulas de revenda, propostas, notícias, convites). O nome fica em w.formerClubs
 * para o histórico de campeões.
 */
export function applyEstadualSwap(w: World) {
  if (!w.pendingEstadualSwap) return;
  const needed = new Set(ESTADUAIS.flatMap((def) => estadualEntrants(w, def).filter((id) => {
    // só continua o fictício que ainda é indispensável (o estado não tem reais suficientes)
    return isFictional(w.clubs[id]) && realClubs(w, def).length < def.size;
  })));
  const gone = new Set<string>();
  for (const c of Object.values(w.clubs)) {
    if (!c.fictional || needed.has(c.id) || c.id === w.userClubId) continue;
    for (const id of c.players) {
      const p = w.players[id];
      if (!p || p.clubId !== c.id) continue;
      const lender = p.loan && w.clubs[p.loan.from];
      if (lender && !lender.fictional) {
        // emprestado ao fictício: volta para o dono
        p.clubId = lender.id;
        lender.players.push(p.id);
        lender.loanedOut = lender.loanedOut?.filter((x) => x !== p.id);
        delete p.loan;
      } else delete w.players[id];
    }
    (w.formerClubs ??= {})[c.id] = c.name;
    delete w.clubs[c.id];
    gone.add(c.id);
  }
  if (gone.size) {
    for (const p of Object.values(w.players)) {
      if (p.clubId && gone.has(p.clubId)) p.clubId = null;
      if (p.loan && gone.has(p.loan.from)) delete p.loan;
      if (p.sellOn && gone.has(p.sellOn.club)) delete p.sellOn;
    }
    w.offers = w.offers.filter((o) => w.players[o.pid] && !gone.has(o.from) && !gone.has(o.to));
    w.shortlist = w.shortlist.filter((id) => !!w.players[id]);
    if (w.scout) {
      for (const id of Object.keys(w.scout.k)) if (!w.players[Number(id)]) delete w.scout.k[Number(id)];
      w.scout.queue = w.scout.queue.filter((id) => !!w.players[id]);
      w.scout.recs = w.scout.recs.filter((id) => !!w.players[id]);
    }
    for (const n of w.news) if (n.clubId && gone.has(n.clubId)) delete n.clubId;
    for (const m of w.inbox?.msgs ?? []) if (m.clubId && gone.has(m.clubId)) delete m.clubId;
    if (w.career) w.career.offers = w.career.offers.filter((o) => !gone.has(o.clubId));
  }
  if (!Object.values(w.clubs).some((c) => c.fictional && !needed.has(c.id))) delete w.pendingEstadualSwap;
}

/** Cria os estaduais da temporada (chamado por createSeasonCompetitions). */
export function createEstaduais(w: World) {
  applyEstadualSwap(w);
  ensureMinorClubs(w);
  const d = estadualDays(w.season);
  ESTADUAIS.forEach((def, i) => {
    const teams = estadualEntrants(w, def);
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
