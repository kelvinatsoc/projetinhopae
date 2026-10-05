// Laço principal: avançar dias, jogar partidas, aplicar resultados.
import { achievementsAfterMatch } from "./achievements";
import { adminCheats } from "./admin";
import { projectTick } from "./board";
import { inWindow, isMonthStart, LEGEND_WAVE_DAY, MID_SEASON_DAY, seasonEndDay, YOUTH_INTAKE_DAY, YOUTH_PREVIEW_DAY } from "./calendar";
import { fixtureById, progressCompetitions, recordResult } from "./competitions";
import { goalBonuses } from "./contracts";
import { afterUserMatch, monthlyMood } from "./dressing";
import { attendanceFor, gateRevenue, monthlyFinances } from "./finance";
import { clubStrength } from "./lineup";
import { aiLoanDay, loanDigest, processLoanReturns } from "./loans";
import { simulateFixture } from "./match";
import { addNews } from "./news";
import { age } from "./player";
import { clamp, getRngState, setRngState } from "./rng";
import { scoutTick } from "./scouting";
import { hasTrait } from "./traits";
import { checkScenario } from "./scenarios";
import { boardAfterMatch, endSeason } from "./season";
import { staffMonthly } from "./staff";
import { midSeasonTick, monthlyTraining, recoveryBonus, trainingDaily } from "./training";
import { aiTransferDay, expireOffers } from "./transfers";
import type { Fixture, MatchResult, World } from "./types";
import { legendWave, peneiraTick, previewIntake, youthIntake } from "./youth";

export type StopReason = "match" | "seasonEnd" | "idle";

export interface AdvanceResult {
  reason: StopReason;
  fixture?: Fixture;
  summary?: string[];
  news: string[];
}

export function loadRng(w: World) {
  setRngState(w.rng);
}

export function saveRng(w: World) {
  w.rng = getRngState();
}

export function userFixtureOn(w: World, day: number): Fixture | undefined {
  return w.fixtures.find((f) => f.day === day && !f.result && (f.home === w.userClubId || f.away === w.userClubId));
}

/** Aplica o resultado de uma partida: tabela, estatísticas, cartões, moral, finanças. */
export function applyResult(w: World, f: Fixture, r: MatchResult) {
  f.result = r;
  r.attendance = attendanceFor(w, f);
  gateRevenue(w, f, r.attendance);
  recordResult(w, f);

  const comp = f.comp;
  const noBans = !!adminCheats(w).noBans; // trapaça do admin: o clube do usuário não leva suspensão
  const sides: [string, string] = [f.home, f.away];
  sides.forEach((clubId, idx) => {
    const club = w.clubs[clubId];
    const scored = idx === 0 ? r.hg : r.ag;
    const conceded = idx === 0 ? r.ag : r.hg;
    const played = new Set(r.lineups[idx]);
    // capitão com a jogada "Líder" segura o grupo nas derrotas (só o clube do usuário)
    let lossDelta = -4;
    if (clubId === w.userClubId && scored < conceded) {
      const capId = club.lineup?.captain != null && played.has(club.lineup.captain)
        ? club.lineup.captain
        : [...played].map((id) => w.players[id]).filter(Boolean).sort((a, b) => b.fame + b.ovr - (a.fame + a.ovr))[0]?.id;
      if (capId != null && w.players[capId] && hasTrait(w.players[capId], "LID")) lossDelta = -2;
    }
    // quem estava suspenso cumpriu a suspensão
    for (const id of club.players) {
      const p = w.players[id];
      if (p && (p.bans[comp] ?? 0) > 0 && !played.has(id)) p.bans[comp]--;
    }
    for (const id of played) {
      const p = w.players[id];
      if (!p) continue;
      const rating = r.ratings[id] ?? 6;
      p.stats.apps++;
      p.ma = (p.ma ?? 0) + 1; // jogos no mês (evolução mensal)
      p.stats.ratingSum += rating;
      p.form.push(rating);
      if (p.form.length > 5) p.form.shift();
      if (p.pos === "GOL" && conceded === 0) p.stats.cs++;
      const delta = scored > conceded ? 4 : scored < conceded ? lossDelta : 0;
      p.morale = clamp(p.morale + delta + (rating >= 7.5 ? 2 : rating < 5.5 ? -2 : 0), p.wantsOut ? 30 : 15, 100);
    }
  });
  for (const e of r.events) {
    if (e.pid == null) continue;
    const p = w.players[e.pid];
    if (!p) continue;
    if (e.type === "goal" || e.type === "pen-goal") {
      p.stats.goals++;
      p.compGoals[comp] = (p.compGoals[comp] ?? 0) + 1;
      if (e.pid2 != null && w.players[e.pid2]) w.players[e.pid2].stats.assists++;
    } else if (e.type === "yellow") {
      p.stats.yel++;
      if (noBans && p.clubId === w.userClubId) continue;
      p.yel[comp] = (p.yel[comp] ?? 0) + 1;
      if (p.yel[comp] >= 3) {
        p.yel[comp] = 0;
        p.bans[comp] = (p.bans[comp] ?? 0) + 1;
      }
    } else if (e.type === "red") {
      p.stats.red++;
      if (noBans && p.clubId === w.userClubId) continue;
      p.bans[comp] = (p.bans[comp] ?? 0) + 1;
    }
  }
  if (r.motm != null && w.players[r.motm]) w.players[r.motm].stats.motm++;
  goalBonuses(w, f, r);

  // diretoria (só para o clube do usuário)
  const userIdx = f.home === w.userClubId ? 0 : f.away === w.userClubId ? 1 : -1;
  if (userIdx >= 0) {
    const us = userIdx === 0 ? r.hg : r.ag;
    const them = userIdx === 0 ? r.ag : r.hg;
    const opp = w.clubs[userIdx === 0 ? f.away : f.home];
    const oppStr = clubStrength(w, opp);
    const oppStronger = oppStr > clubStrength(w, w.clubs[w.userClubId]) + 1;
    achievementsAfterMatch(w, f, r, userIdx as 0 | 1, oppStr);
    boardAfterMatch(w, us > them, us === them, oppStronger);
    afterUserMatch(w, f, r, userIdx as 0 | 1);
  }
}

function simulateDay(w: World, day: number) {
  for (const f of w.fixtures) {
    if (f.day !== day || f.result) continue;
    if (f.home === w.userClubId || f.away === w.userClubId) continue;
    applyResult(w, f, simulateFixture(w, f));
  }
}

/** Processamento diário: recuperação, lesões, finanças, base, mercado. */
function dailyTick(w: World) {
  const d = w.day;
  for (const p of Object.values(w.players)) {
    if (p.injury > 0) {
      p.injury--;
      if (p.injury === 0) p.injuryName = undefined;
    }
    if (p.cond < 100) {
      const club = p.clubId ? w.clubs[p.clubId] : null;
      const a = age(p, w.season);
      let rec = 6 + (club?.facilities ?? 2) * 0.6 + (a < 24 ? 1 : a > 31 ? -1 : 0);
      rec += recoveryBonus(w, p, club);
      p.cond = Math.min(100, p.cond + rec);
    }
  }
  if (isMonthStart(w.season, d)) {
    monthlyFinances(w);
    monthlyTraining(w);
    monthlyMood(w);
    staffMonthly(w);
    loanDigest(w);
  }
  if (d === YOUTH_INTAKE_DAY) {
    youthIntake(w);
    legendWave(w);
  }
  if (d === LEGEND_WAVE_DAY) legendWave(w);
  if (d === MID_SEASON_DAY) {
    midSeasonTick(w);
    processLoanReturns(w, "half");
  }
  if (d === YOUTH_PREVIEW_DAY) previewIntake(w);
  trainingDaily(w);
  peneiraTick(w);
  scoutTick(w);
  projectTick(w);
  if (d === 90 || d === 243) addNews(w, "transfer", "Janela de transferências fechada", "Agora só é possível contratar jogadores livres.");
  if (d === 181) addNews(w, "transfer", "Janela de transferências aberta", "A janela do meio do ano vai até 31 de agosto.");
  if (d === 300) {
    const user = w.clubs[w.userClubId];
    const exp = user.players.map((id) => w.players[id]).filter((p) => p && !p.youth && p.contractEnd <= w.season);
    if (exp.length) addNews(w, "contract", "Contratos terminando", `Estes contratos acabam no fim da temporada: ${exp.map((p) => p.name).join(", ")}. Renove no perfil do jogador se quiser mantê-los.`);
    const opts = user.players.map((id) => w.players[id]).filter((p) => p?.loan?.opt);
    if (opts.length) addNews(w, "transfer", "Opções de compra", `Estes emprestados voltam no fim da temporada, a menos que você exerça a opção de compra no perfil: ${opts.map((p) => p.name).join(", ")}.`);
  }
  if (inWindow(d)) {
    aiTransferDay(w);
    aiLoanDay(w);
  }
  expireOffers(w);
}

/**
 * Avança o jogo até a próxima partida do usuário (ou até o fim da temporada).
 * Partidas de outros clubes são simuladas no caminho.
 */
export function advance(w: World, maxDays = 400): AdvanceResult {
  loadRng(w);
  const news: string[] = [];
  try {
    for (let guard = 0; guard < maxDays; guard++) {
      if (w.pendingMatch != null) {
        const f = fixtureById(w, w.pendingMatch);
        if (f && !f.result) return { reason: "match", fixture: f, news };
        w.pendingMatch = undefined;
      }
      const uf = userFixtureOn(w, w.day);
      if (uf) {
        w.pendingMatch = uf.id;
        return { reason: "match", fixture: uf, news };
      }
      simulateDay(w, w.day);
      news.push(...progressCompetitions(w));
      for (const n of news.splice(0)) addNews(w, "season", n, "");
      const allDone = w.fixtures.every((f) => !!f.result);
      if (allDone && w.day >= seasonEndDay(w.season) - 1) {
        w.seasonEnded = true;
        return { reason: "seasonEnd", news };
      }
      w.day++;
      dailyTick(w);
    }
    return { reason: "idle", news };
  } finally {
    saveRng(w);
  }
}

/** Depois que o usuário joga sua partida: aplica o resultado e simula o resto do dia. */
export function finishUserMatch(w: World, f: Fixture, r: MatchResult) {
  loadRng(w);
  applyResult(w, f, r);
  w.pendingMatch = undefined;
  simulateDay(w, f.day);
  for (const n of progressCompetitions(w)) addNews(w, "season", n, "");
  checkScenario(w);
  saveRng(w);
}

export function runEndOfSeason(w: World): string[] {
  loadRng(w);
  const s = endSeason(w);
  saveRng(w);
  return s;
}
