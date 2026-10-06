// Início e fim de temporada: acessos, rebaixamentos, vagas continentais, evolução,
// aposentadorias, contratos, premiações e diretoria.
import { adminCheats } from "./admin";
import { achievementsSeasonEnd } from "./achievements";
import { aiInfrastructure, checkSacking } from "./board";
import { careerNewSeason, careerSeasonEnd } from "./career";
import { scenarioSeasonEnd } from "./scenarios";
import { COMP_META, createSeasonCompetitions, sortTable, tablePosition, type SeasonEntrants } from "./competitions";
import { managerChanged, seasonReset } from "./dressing";
import { awardPrize, CUP_PRIZES, leaguePrize } from "./finance";
import { bestFormationFor, squadOf } from "./lineup";
import { clearLoanedOut, processLoanReturns } from "./loans";
import { addNews } from "./news";
import { age, emptyStats, generatePlayer, retireChance, wageFor } from "./player";
import { chance, rand, randInt } from "./rng";
import { pruneScouting } from "./scouting";
import { staffOnClubChange } from "./staff";
import { seasonEndDevelop } from "./training";
import { aiSignFree, releasePlayer } from "./transfers";
import { resolvePeneiraAuto } from "./youth";
import type { Club, Competition, Div, World } from "./types";

const FOREIGN_QUOTA: Record<string, number> = { ARG: 6, URU: 3, PAR: 3, CHI: 3, COL: 3, ECU: 3, PER: 2, BOL: 1, VEN: 1 };

/** Escolhe os estrangeiros da Libertadores (os mais fortes) e da Sul-Americana. */
function foreignEntrants(w: World): { lib: string[]; sula: string[] } {
  const lib: string[] = [];
  const sula: string[] = [];
  for (const [country, q] of Object.entries(FOREIGN_QUOTA)) {
    const pool = Object.values(w.clubs).filter((c) => c.country === country && c.div === "F");
    const scored = pool.map((c) => ({ c, s: c.level + c.rep / 8 + rand() * 9 })).sort((a, b) => b.s - a.s);
    scored.slice(0, q).forEach((x) => lib.push(x.c.id));
    scored.slice(q, q * 2).forEach((x) => sula.push(x.c.id));
  }
  return { lib, sula };
}

export function initialEntrants(w: World): SeasonEntrants {
  const byDiv = (d: Div) => Object.values(w.clubs).filter((c) => c.div === d).map((c) => c.id);
  const d = Object.values(w.clubs).filter((c) => c.div === "D" && !c.minor).sort((a, b) => b.rep - a.rep).slice(0, 4).map((c) => c.id);
  const f = foreignEntrants(w);
  // vagas reais de 2026
  const libBR = ["flamengo", "palmeiras", "cruzeiro", "mirassol", "fluminense", "corinthians", "botafogo"].filter((id) => w.clubs[id]);
  const sulaBR = ["sao-paulo", "gremio", "bragantino", "atletico-mg", "santos", "vasco", "bahia"].filter((id) => w.clubs[id]);
  return {
    serieA: byDiv("A"), serieB: byDiv("B"), serieC: byDiv("C"),
    copa: [...byDiv("A"), ...byDiv("B"), ...byDiv("C"), ...d],
    liberta: [...libBR, ...f.lib.slice(0, 32 - libBR.length)],
    sula: [...sulaBR, ...f.sula.slice(0, 32 - sulaBR.length)],
  };
}

export function startSeason(w: World, e: SeasonEntrants) {
  w.fixtures = [];
  createSeasonCompetitions(w, e);
  for (const c of Object.values(w.clubs)) {
    if (c.id !== w.userClubId) c.tactic.formation = bestFormationFor(w, c);
  }
  setBoardObjective(w);
  const user = w.clubs[w.userClubId];
  addNews(w, "season", `Começa a temporada ${w.season}!`,
    `Objetivo da diretoria do ${user.name}: ${w.board.objective}. Boa sorte, ${w.managerName}!`);
}

// ---------------------------------------------------------------- diretoria
export function setBoardObjective(w: World) {
  const user = w.clubs[w.userClubId];
  const peers = Object.values(w.clubs).filter((c) => c.div === user.div).sort((a, b) => b.level + b.rep / 20 - (a.level + a.rep / 20));
  const rank = peers.findIndex((c) => c.id === user.id) + 1;
  let code = "mid", text = "Fazer uma campanha segura";
  if (user.div === "A") {
    if (rank <= 3) { code = "A-title"; text = "Brigar pelo título (terminar entre os 3)"; }
    else if (rank <= 8) { code = "A-lib"; text = "Vaga na Libertadores (terminar entre os 6)"; }
    else if (rank <= 13) { code = "A-sula"; text = "Vaga na Sul-Americana (terminar entre os 12)"; }
    else { code = "A-stay"; text = "Evitar o rebaixamento (terminar até 16º)"; }
  } else if (user.div === "B") {
    if (rank <= 5) { code = "B-up"; text = "Subir para a Série A"; }
    else if (rank <= 12) { code = "B-mid"; text = "Brigar pelo acesso (terminar entre os 8)"; }
    else { code = "B-stay"; text = "Evitar o rebaixamento (terminar até 16º)"; }
  } else {
    if (rank <= 6) { code = "C-up"; text = "Conquistar o acesso à Série B"; }
    else { code = "C-stay"; text = "Evitar o rebaixamento (terminar até 18º)"; }
  }
  w.board.objective = text;
  w.board.objectiveCode = code;
}

function objectiveMet(w: World, pos: number | null, promoted: boolean): boolean {
  if (pos == null) return true;
  switch (w.board.objectiveCode) {
    case "A-title": return pos <= 3;
    case "A-lib": return pos <= 6;
    case "A-sula": return pos <= 12;
    case "A-stay": return pos <= 16;
    case "B-up": case "C-up": return promoted;
    case "B-mid": return pos <= 8;
    case "B-stay": return pos <= 16;
    case "C-stay": return pos <= 18;
    default: return true;
  }
}

// ---------------------------------------------------------------- fim de temporada
function furthestStage(comp: Competition, clubId: string): string | null {
  const order = ["group", "r64", "r32", "r16", "qf", "sf", "final"];
  let best: string | null = comp.format === "groups" && comp.teams.includes(clubId) ? "group" : null;
  for (const t of comp.ties) {
    if (t.a === clubId || t.b === clubId) {
      if (!best || order.indexOf(t.stage) > order.indexOf(best)) best = t.stage;
    }
  }
  return best;
}

function awardCupPrizes(w: World) {
  for (const id of ["copaBR", "liberta", "sula"]) {
    const comp = w.comps[id];
    if (!comp) continue;
    const table = CUP_PRIZES[id];
    for (const clubId of comp.teams) {
      let v = 0;
      const st = furthestStage(comp, clubId);
      if (st && table[st]) v += table[st];
      if (comp.champion === clubId) v += table.champion;
      else if (comp.runnerUp === clubId) v += table.runnerUp;
      if (comp.format === "groups") {
        const g = comp.groups.find((gr) => gr.teams.includes(clubId));
        const row = g?.table.find((r) => r.club === clubId);
        if (row) v += row.w * table.groupWin;
      }
      awardPrize(w, clubId, v);
    }
  }
}

export function endSeason(w: World): string[] {
  // peneira pendente é resolvida antes de fechar a temporada
  resolvePeneiraAuto(w);
  const y = w.season;
  const summary: string[] = [];
  const user = w.clubs[w.userClubId];
  const A = w.comps.serieA, B = w.comps.serieB, C = w.comps.serieC;
  for (const comp of [A, B, C]) sortTable(comp.table);

  // premiações das ligas
  for (const comp of [A, B, C]) comp.table.forEach((r, i) => awardPrize(w, r.club, leaguePrize(comp.id, i + 1)));
  awardCupPrizes(w);

  // títulos e histórico dos clubes
  const champions: Record<string, string> = {};
  for (const comp of Object.values(w.comps)) {
    if (!comp.champion) continue;
    champions[comp.id] = comp.champion;
    const club = w.clubs[comp.champion];
    club.trophies.push({ comp: comp.id, name: COMP_META[comp.id].name, season: y });
  }
  for (const club of Object.values(w.clubs)) {
    const league = club.div === "A" ? A : club.div === "B" ? B : club.div === "C" ? C : undefined;
    const pos = league ? tablePosition(league, club.id) : null;
    club.history.push({ season: y, div: club.div, pos, titles: Object.entries(champions).filter(([, c]) => c === club.id).map(([k]) => k) });
    if (club.history.length > 40) club.history.shift();
  }

  // destaques
  let top: { pid: number; goals: number } | null = null;
  let bestP: { pid: number; r: number } | null = null;
  let rev: { pid: number; r: number } | null = null; // revelação: até 21 anos
  for (const p of Object.values(w.players)) {
    if (!p.clubId || w.clubs[p.clubId].div !== "A") continue;
    const g = p.compGoals.serieA ?? 0;
    if (!top || g > top.goals) top = { pid: p.id, goals: g };
    if (p.stats.apps >= 15) {
      const r = p.stats.ratingSum / p.stats.apps;
      if (!bestP || r > bestP.r) bestP = { pid: p.id, r };
    }
    if (p.stats.apps >= 12 && y - p.born <= 21) {
      const r = p.stats.ratingSum / p.stats.apps;
      if (!rev || r > rev.r) rev = { pid: p.id, r };
    }
  }
  const userLeague = user.div === "A" ? A : user.div === "B" ? B : C;
  const userPos = tablePosition(userLeague, user.id);
  w.history.push({
    season: y, champions, userPos: userPos ?? undefined, userDiv: user.div,
    topScorer: top ? { pid: top.pid, name: w.players[top.pid].name, goals: top.goals, clubId: w.players[top.pid].clubId! } : undefined,
    bestPlayer: bestP ? { pid: bestP.pid, name: w.players[bestP.pid].name, clubId: w.players[bestP.pid].clubId!, rating: Math.round(bestP.r * 100) / 100 } : undefined,
    revelation: rev ? { pid: rev.pid, name: w.players[rev.pid].name, clubId: w.players[rev.pid].clubId!, rating: Math.round(rev.r * 100) / 100, age: y - w.players[rev.pid].born } : undefined,
  });
  seasonAwards(w, bestP?.pid, rev?.pid);

  // diretoria
  const promotedUser = (B.promoted ?? []).includes(user.id) || (C.promoted ?? []).includes(user.id);
  const userTitles = Object.entries(champions).filter(([, c]) => c === user.id).map(([k]) => k);
  w.managerHistory.push({ season: y, clubId: user.id, pos: userPos, div: user.div, titles: userTitles, admin: w.admin?.seasons.includes(y) || undefined });
  const met = objectiveMet(w, userPos, promotedUser);
  w.board.confidence = Math.max(0, Math.min(100, w.board.confidence + (met ? 20 : -25) + userTitles.length * 15));
  recordClubSeason(w, y, userPos, userTitles, promotedUser);
  const relegatedUser = (A.relegated ?? A.table.slice(-4).map((r) => r.club)).includes(user.id) || (B.relegated ?? B.table.slice(-4).map((r) => r.club)).includes(user.id) || (C.relegated ?? C.table.slice(-2).map((r) => r.club)).includes(user.id);
  if (relegatedUser && w.clubLog?.length) w.clubLog[w.clubLog.length - 1].relegated = true;
  const userRow = userLeague.table.find((r) => r.club === user.id);
  const leagueTop = top && w.players[top.pid]?.clubId === user.id && user.div === "A";
  const ownTop = user.div !== "A" ? topScorerOf(w, userLeague.id) === user.id : !!leagueTop;
  achievementsSeasonEnd(w, { titles: userTitles, promoted: promotedUser, div: user.div, pos: userPos, leagueLosses: userRow && userRow.p > 0 ? userRow.l : null, topScorerOurs: ownTop });
  careerSeasonEnd(w, { titles: userTitles, met, promoted: promotedUser, relegated: relegatedUser, pos: userPos });
  summary.push(...scenarioSeasonEnd(w));
  summary.push(met ? `A diretoria ficou satisfeita: objetivo cumprido (${w.board.objective}).` : `A diretoria está decepcionada: o objetivo era "${w.board.objective}".`);
  if (!w.settings.casual && w.board.confidence <= 10 && !adminCheats(w).noFire) {
    w.fired = true;
    summary.push(`Você foi demitido do ${user.name}.`);
  }

  // acessos e rebaixamentos
  const relA = A.relegated ?? A.table.slice(-4).map((r) => r.club);
  const proB = B.promoted ?? B.table.slice(0, 4).map((r) => r.club);
  const relB = B.relegated ?? B.table.slice(-4).map((r) => r.club);
  const proC = C.promoted ?? C.table.slice(0, 4).map((r) => r.club);
  const relC = C.relegated ?? C.table.slice(-2).map((r) => r.club);
  const dPool = Object.values(w.clubs).filter((c) => c.div === "D" && !c.minor);
  const proD = dPool.map((c) => ({ c, s: c.level + c.rep / 10 + rand() * 8 })).sort((a, b) => b.s - a.s).slice(0, relC.length).map((x) => x.c.id);
  for (const id of relA) w.clubs[id].div = "B";
  for (const id of proB) w.clubs[id].div = "A";
  for (const id of relB) w.clubs[id].div = "C";
  for (const id of proC) w.clubs[id].div = "B";
  for (const id of relC) w.clubs[id].div = "D";
  for (const id of proD) w.clubs[id].div = "C";
  const names = (ids: string[]) => ids.map((id) => w.clubs[id].name).join(", ");
  summary.push(`Rebaixados da Série A: ${names(relA)}.`, `Promovidos à Série A: ${names(proB)}.`);
  if (relA.includes(user.id)) summary.push(`😢 O ${user.name} foi rebaixado para a Série B.`);
  if (proB.includes(user.id)) summary.push(`🎉 O ${user.name} subiu para a Série A!`);
  if (proC.includes(user.id)) summary.push(`🎉 O ${user.name} subiu para a Série B!`);

  // vagas continentais para a próxima temporada
  const tableA = A.table.map((r) => r.club).filter((id) => w.clubs[id].div === "A" || !relA.includes(id));
  const lib = new Set<string>(A.table.slice(0, 6).map((r) => r.club));
  const extra = [w.comps.copaBR?.champion, w.comps.liberta?.champion, w.comps.sula?.champion].filter(
    (id): id is string => !!id && w.clubs[id]?.country === "BRA",
  );
  for (const id of extra) lib.add(id);
  for (const r of A.table) { if (lib.size >= 7) break; lib.add(r.club); }
  const sula: string[] = [];
  for (const id of tableA) { if (sula.length >= 6) break; if (!lib.has(id)) sula.push(id); }
  const f = foreignEntrants(w);
  const libList = [...lib].slice(0, 9);
  const sulaList = sula;

  // ------------- jogadores: histórico, evolução, aposentadoria, contratos
  const retired: string[] = [];
  for (const p of Object.values(w.players)) {
    if (p.stats.apps > 0 && p.clubId) {
      p.history.push({ season: y, clubId: p.clubId, apps: p.stats.apps, goals: p.stats.goals, assists: p.stats.assists, rating: Math.round((p.stats.ratingSum / p.stats.apps) * 100) / 100, ovr: p.ovr });
      if (p.history.length > 25) p.history.shift();
    }
    const club = p.clubId ? w.clubs[p.clubId] : null;
    seasonEndDevelop(w, p, y);
    // fama cresce com boas temporadas
    if (p.stats.apps >= 10) p.fame = Math.min(100, p.fame + Math.round((p.stats.ratingSum / p.stats.apps - 6.5) * 4 + p.stats.goals * 0.3));
    if (chance(retireChance(p, y + 1))) {
      if (p.clubId === w.userClubId || (p.legend && p.ovr >= 75) || p.ovr >= 82) retired.push(`${p.name} (${age(p, y)} anos)`);
      if (p.legend && w.legends[p.legend]) w.legends[p.legend].active = undefined;
      if (club) club.players = club.players.filter((id) => id !== p.id);
      if (p.loan) clearLoanedOut(w, p);
      delete w.players[p.id];
      continue;
    }
    p.stats = emptyStats();
    p.compGoals = {};
    p.yel = {};
    p.bans = {};
    p.cond = 100;
    p.injury = Math.max(0, p.injury - 30);
    p.morale = Math.round(p.morale * 0.6 + 70 * 0.4);
  }
  if (retired.length) summary.push(`Aposentadorias: ${retired.slice(0, 8).join(", ")}${retired.length > 8 ? "…" : ""}.`);
  // emprestados voltam antes de olhar os contratos
  processLoanReturns(w, "season");

  w.season = y + 1;
  const ny = w.season;

  // contratos que terminaram
  const userLeft: string[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.clubId || p.contractEnd >= ny) continue;
    const club = w.clubs[p.clubId];
    if (club.id === w.userClubId) {
      userLeft.push(p.name);
      releasePlayer(w, p, false);
      continue;
    }
    const useful = p.ovr >= club.level - 6 && age(p, ny) <= 33;
    if (p.youth || (useful && chance(0.8))) {
      p.contractEnd = ny + randInt(1, 3);
      p.wage = wageFor(p.ovr, club.rep, age(p, ny));
    } else {
      releasePlayer(w, p, false);
    }
  }
  if (userLeft.length) summary.push(`Contratos encerrados no seu clube: ${userLeft.join(", ")}.`);

  // base: quem completou 19 anos sobe ou é dispensado
  for (const club of Object.values(w.clubs)) {
    for (const id of club.players.slice()) {
      const p = w.players[id];
      if (!p?.youth || age(p, ny) < 19) continue;
      if (club.id === w.userClubId || p.legend || p.pot >= club.level - 4 || p.ovr >= club.level - 10) p.youth = false;
      else {
        club.players = club.players.filter((x) => x !== id);
        delete w.players[id];
      }
    }
  }

  // jogadores livres: aposentam ou somem; novos livres aparecem
  let free = 0;
  for (const p of Object.values(w.players)) {
    if (p.clubId) continue;
    if (p.legend) { free++; continue; }
    if (age(p, ny) >= 33 || (p.freeSince !== undefined && ny - p.freeSince >= 2) || p.ovr < 48) {
      delete w.players[p.id];
      continue;
    }
    free++;
  }
  for (let i = free; i < 160; i++) generatePlayer(w, null, randInt(50, 68), randInt(22, 32));

  pruneScouting(w);
  aiInfrastructure(w);
  seasonReset(w);

  // finanças: fecha o ano
  for (const club of Object.values(w.clubs)) {
    club.finance.lastIncome = club.finance.income;
    club.finance.lastExpense = club.finance.expense;
    club.finance.income = {};
    club.finance.expense = {};
    if (club.div === "F") club.balance = Math.round(5_000_000 + club.rep * club.rep * 5_000);
    // nível de referência acompanha a divisão
    club.level = Math.round(club.level * 0.7 + squadLevel(w, club) * 0.3);
  }

  // elencos da IA
  for (const club of Object.values(w.clubs)) {
    if (club.id === w.userClubId) continue;
    let sq = squadOf(w, club);
    let guard = 0;
    while (sq.length < 24 && guard++ < 12) { aiSignFree(w, club); sq = squadOf(w, club); }
    if (sq.length > 32) {
      // emprestados não são dispensados
      const cands = sq.filter((p) => !p.loan).sort((a, b) => a.ovr - b.ovr);
      for (const p of cands.slice(0, sq.length - 32)) releasePlayer(w, p, false);
    }
  }
  // rede de segurança: a diretoria completa o elenco do usuário com jogadores livres
  const userClub = w.clubs[w.userClubId];
  const signed: string[] = [];
  let guardU = 0;
  while (squadOf(w, userClub).length < 20 && guardU++ < 20) {
    const before = new Set(userClub.players);
    aiSignFree(w, userClub);
    const added = userClub.players.find((id) => !before.has(id));
    if (added) signed.push(w.players[added].name);
  }
  if (signed.length) summary.push(`A diretoria contratou ${signed.length} jogadores para completar o elenco: ${signed.join(", ")}.`);
  if (userClub.lineup) userClub.lineup = undefined;

  // nova temporada
  const byDiv = (d: Div) => Object.values(w.clubs).filter((c) => c.div === d).map((c) => c.id);
  const d4 = Object.values(w.clubs).filter((c) => c.div === "D" && !c.minor).sort((a, b) => b.rep - a.rep).slice(0, 4).map((c) => c.id);
  const entrants: SeasonEntrants = {
    serieA: byDiv("A"), serieB: byDiv("B"), serieC: byDiv("C"),
    copa: [...byDiv("A"), ...byDiv("B"), ...byDiv("C"), ...d4],
    liberta: [...libList, ...f.lib].slice(0, 32),
    sula: [...sulaList, ...f.sula].slice(0, 32),
  };
  w.day = 0;
  w.seasonEnded = false;
  startSeason(w, entrants);
  careerNewSeason(w);
  addNews(w, "season", `Resumo da temporada ${y}`, summary.join("\n"));
  return summary;
}

/** Clube do artilheiro de uma liga (gols na competição). */
function topScorerOf(w: World, compId: string): string | null {
  let best: { club: string; g: number } | null = null;
  for (const p of Object.values(w.players)) {
    const g = p.compGoals[compId] ?? 0;
    if (p.clubId && g > 0 && (!best || g > best.g)) best = { club: p.clubId, g };
  }
  return best?.club ?? null;
}

/** Sala de troféus: resumo da temporada do clube do usuário (artilheiro, melhor jogador, melhor contratação). */
export function recordClubSeason(w: World, y: number, pos: number | null, titles: string[], promoted: boolean) {
  const club = w.clubs[w.userClubId];
  const squad = club.players.map((id) => w.players[id]).filter((p) => p && p.stats.apps > 0);
  const avg = (p: (typeof squad)[number]) => p.stats.ratingSum / p.stats.apps;
  const scorer = squad.slice().sort((a, b) => b.stats.goals - a.stats.goals)[0];
  const mvp = squad.filter((p) => p.stats.apps >= 8).sort((a, b) => avg(b) - avg(a))[0];
  const signing = squad.filter((p) => p.joined === y && !p.youth && p.stats.apps >= 5).sort((a, b) => avg(b) - avg(a))[0];
  const fee = signing ? w.offers.filter((o) => o.pid === signing.id && o.byUser && o.status === "done").map((o) => o.fee).pop() : undefined;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  w.clubLog ??= [];
  w.clubLog.push({
    season: y, clubId: club.id, div: club.div, pos, titles, promoted: promoted || undefined,
    topScorer: scorer && scorer.stats.goals > 0 ? { pid: scorer.id, name: scorer.name, goals: scorer.stats.goals } : undefined,
    mvp: mvp ? { pid: mvp.id, name: mvp.name, rating: r2(avg(mvp)) } : undefined,
    bestSigning: signing ? { pid: signing.id, name: signing.name, rating: r2(avg(signing)), fee } : undefined,
  });
  if (w.clubLog.length > 60) w.clubLog.shift();
}

function squadLevel(w: World, club: Club): number {
  const sq = squadOf(w, club).sort((a, b) => b.ovr - a.ovr).slice(0, 16);
  if (!sq.length) return club.level;
  return sq.reduce((s, p) => s + p.ovr, 0) / sq.length - 1;
}

export function fireAndRehire(w: World, newClubId: string) {
  w.userClubId = newClubId;
  w.fired = false;
  w.board.confidence = 50;
  setBoardObjective(w);
  staffOnClubChange(w);
  managerChanged(w);
  addNews(w, "board", `Novo desafio: ${w.clubs[newClubId].name}`, `Você assumiu o comando do ${w.clubs[newClubId].name}. Objetivo: ${w.board.objective}.`);
}

export function boardAfterMatch(w: World, won: boolean, draw: boolean, oppStronger: boolean) {
  let d = won ? 1.5 : draw ? (oppStronger ? 0.5 : -0.3) : oppStronger ? -1 : -2.2;
  if (w.board.confidence > 85 && d > 0) d *= 0.5;
  w.board.confidence = Math.max(w.settings.casual ? 5 : 0, Math.min(100, w.board.confidence + d));
  if (w.board.confidence < 25 && !w.board.warned) {
    w.board.warned = true;
    addNews(w, "board", "A diretoria está preocupada", w.settings.casual
      ? "Os resultados não estão bons, mas no modo casual você não será demitido. Que tal mexer no time?"
      : "Se os resultados não melhorarem, você pode ser demitido no fim da temporada.");
  }
  if (w.board.confidence > 40) w.board.warned = false;
  checkSacking(w);
}


/** Prêmios da temporada (Série A): craque e revelação viram notícia; ídolo e moral para os do usuário. */
function seasonAwards(w: World, best?: number, rev?: number) {
  const give = (pid: number | undefined, title: string, emoji: string) => {
    const p = pid != null ? w.players[pid] : undefined;
    if (!p) return;
    const club = p.clubId ? w.clubs[p.clubId] : undefined;
    const avg = p.stats.apps ? (p.stats.ratingSum / p.stats.apps).toFixed(2) : "-";
    const mine = p.clubId === w.userClubId;
    p.fame = Math.min(100, p.fame + 5);
    if (mine) { p.morale = Math.min(100, p.morale + 10); p.fav = true; }
    addNews(w, "season", `${emoji} ${title}: ${p.name}${club ? ` (${club.name})` : ""}`, `Média ${avg} em ${p.stats.apps} jogos na Série A.${mine ? " Orgulho do seu elenco!" : ""}`, { pid: p.id, clubId: club?.id });
  };
  give(best, "Craque da temporada", "🏅");
  if (rev !== best) give(rev, "Revelação da temporada", "🌟");
}
