import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { ACHIEVEMENTS, achievementsAfterMatch, achievementsSeasonEnd, ensureAch, isClassico, popToast } from "../src/engine/achievements";
import { checkSacking } from "../src/engine/board";
import { acceptOffer, activeOffers, declineOffer, ensureCareer, generateOffers, seasonRepDelta } from "../src/engine/career";
import { tablePosition } from "../src/engine/competitions";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { aliveIn, checkScenario, createScenarioWorld, SCENARIO_BY_ID, SCENARIOS } from "../src/engine/scenarios";
import type { Fixture, MatchResult, World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

const DB = db as Database;
const newWorld = (clubId = "flamengo", seed = 7) => createWorld(DB, { managerName: "Teste", clubId, seed });

function fakeResult(w: World, f: Fixture, hg: number, ag: number, scorer?: number): MatchResult {
  const events: MatchResult["events"] = [];
  for (let i = 0; i < hg; i++) events.push({ min: 10 + i, type: "goal", side: 0, pid: scorer, text: "" });
  for (let i = 0; i < ag; i++) events.push({ min: 50 + i, type: "goal", side: 1, text: "" });
  const lu = (id: string) => w.clubs[id].players.filter((p) => !w.players[p].youth).slice(0, 11);
  return {
    hg, ag, events, ratings: {}, lineups: [lu(f.home), lu(f.away)],
    stats: { poss: [50, 50], shots: [0, 0], onTarget: [0, 0], corners: [0, 0], fouls: [0, 0], yellows: [0, 0], reds: [0, 0], xg: [0, 0] },
  };
}

function playSeason(w: World) {
  for (let i = 0; i < 500; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") break;
  }
}

describe("conquistas", () => {
  it("tem ~30 conquistas com ids únicos", () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it("desbloqueia vitória, goleada, hat-trick, sequências e clássico", () => {
    const w = newWorld();
    const f: Fixture = { id: 1, comp: "serieA", stage: "league", round: 1, day: 0, home: "flamengo", away: "fluminense" };
    const striker = w.clubs.flamengo.players.find((id) => !w.players[id].youth)!;
    achievementsAfterMatch(w, f, fakeResult(w, f, 6, 0, striker), 0);
    const got = ensureAch(w).got;
    for (const id of ["first_win", "goleada", "hattrick", "clean_sheet", "classico"]) expect(got[id], id).toBeTruthy();
    expect(isClassico(w, "fluminense", "flamengo")).toBe(true);
    expect(popToast(w)).toMatch(/Conquista/);
    for (let i = 0; i < 4; i++) achievementsAfterMatch(w, f, fakeResult(w, f, 1, 0), 0);
    expect(got.win_streak_5).toBeTruthy();
    expect(got.wall_5).toBeTruthy();
    expect(got.classico_5).toBeTruthy();
    const before = Object.keys(got).length;
    achievementsAfterMatch(w, f, fakeResult(w, f, 0, 1), 0);
    expect(w.ach!.c.ws).toBe(0);
    expect(w.ach!.c.unb).toBe(0);
    expect(Object.keys(got).length).toBe(before);
  });

  it("virada histórica e conquistas de temporada", () => {
    const w = newWorld();
    const f: Fixture = { id: 1, comp: "copaBR", stage: "r64", round: 1, day: 0, home: "flamengo", away: "remo" };
    const r = fakeResult(w, f, 0, 0);
    r.hg = 3; r.ag = 2;
    r.events = [
      { min: 5, type: "goal", side: 1, text: "" }, { min: 20, type: "goal", side: 1, text: "" },
      { min: 60, type: "goal", side: 0, text: "" }, { min: 70, type: "goal", side: 0, text: "" }, { min: 88, type: "pen-goal", side: 0, text: "" },
    ];
    achievementsAfterMatch(w, f, r, 0);
    expect(w.ach!.got.comeback).toBeTruthy();
    achievementsSeasonEnd(w, { titles: ["serieA", "copaBR", "liberta"], promoted: false, div: "A", pos: 1, leagueLosses: 0, topScorerOurs: true });
    for (const id of ["title_any", "title_serieA", "title_copaBR", "title_liberta", "double", "treble", "invincible", "top_scorer"]) expect(w.ach!.got[id], id).toBeTruthy();
  });
});

describe("temporada: sala de troféus, carreira e conquistas", () => {
  it("registra o resumo do clube e atualiza a reputação", () => {
    const w = newWorld("flamengo", 11);
    playSeason(w);
    const repBefore = ensureCareer(w).rep;
    runEndOfSeason(w);
    expect(w.clubLog).toHaveLength(1);
    const log = w.clubLog![0];
    expect(log.clubId).toBe("flamengo");
    expect(log.topScorer?.goals ?? 0).toBeGreaterThan(0);
    expect(log.mvp).toBeTruthy();
    expect(w.career!.rep).not.toBe(Number.NaN);
    expect(typeof repBefore).toBe("number");
    expect(w.ach!.c.games).toBeGreaterThan(30);
    expect(w.ach!.got.first_win).toBeTruthy();
    expect(w.season).toBe(DB.season + 1);
  }, 60_000);
});

describe("carreira", () => {
  it("reputação sobe com títulos e cai com rebaixamento", () => {
    const w = newWorld();
    const c = w.clubs.flamengo;
    expect(seasonRepDelta(c, { titles: ["serieA"], met: true, promoted: false, relegated: false, pos: 1 })).toBeGreaterThan(10);
    expect(seasonRepDelta(c, { titles: [], met: false, promoted: false, relegated: true, pos: 18 })).toBeLessThan(-10);
  });

  it("demitido recebe propostas, recusa e aceita trocando de clube", () => {
    const w = newWorld("flamengo", 3);
    w.fired = true;
    loadRng(w);
    const offers = generateOffers(w, "fired");
    saveRng(w);
    expect(offers.length).toBeGreaterThan(0);
    expect(activeOffers(w).length).toBe(offers.length);
    declineOffer(w, offers[0].id);
    const left = activeOffers(w);
    expect(left.length).toBeGreaterThan(0);
    const target = left[0].clubId;
    expect(acceptOffer(w, left[0].id)).toBe(true);
    expect(w.userClubId).toBe(target);
    expect(w.fired).toBe(false);
    expect(w.career!.moves).toHaveLength(1);
    expect(w.ach!.got.job_change).toBeTruthy();
    expect(activeOffers(w)).toHaveLength(0);
  });

  it("propostas são determinísticas com a mesma semente", () => {
    const ids = [1, 2].map(() => {
      const w = newWorld("bahia", 99);
      w.career = { rep: 70, offers: [], moves: [], sackings: 0 };
      loadRng(w);
      const o = generateOffers(w, "season");
      saveRng(w);
      return o.map((x) => x.clubId).join(",");
    });
    expect(ids[0]).toBe(ids[1]);
  });

  it("demissão no meio da temporada (fora do modo casual)", () => {
    const w = newWorld("flamengo", 5);
    w.settings.casual = false;
    w.day = 120;
    w.board.confidence = 0;
    loadRng(w);
    expect(checkSacking(w)).toBe(true);
    saveRng(w);
    expect(w.fired).toBe(true);
    expect(activeOffers(w).length).toBeGreaterThan(0);
    const casual = newWorld("flamengo", 5);
    casual.day = 120;
    casual.board.confidence = 0;
    expect(checkSacking(casual)).toBe(false);
  });
});

describe("migração", () => {
  it("save antigo sem campos de progressão carrega", () => {
    const w = newWorld();
    w.managerHistory.push({ season: 2025, clubId: "flamengo", pos: 2, div: "A", titles: ["copaBR"] });
    delete w.clubLog; delete w.ach; delete w.career; delete w.scenario;
    migrateWorld(w, DB);
    expect(w.clubLog).toEqual([{ season: 2025, clubId: "flamengo", div: "A", pos: 2, titles: ["copaBR"] }]);
    w.scenario = { id: "inexistente", clubId: "flamengo", season: 2026, status: "active" };
    migrateWorld(w, DB);
    expect(w.scenario).toBeUndefined();
  });
});

describe("cenários", () => {
  it("tem de 6 a 8 cenários", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(6);
    expect(SCENARIOS.length).toBeLessThanOrEqual(8);
  });

  it("gigante caído começa na Série B e é determinístico", () => {
    const a = createScenarioWorld(DB, "gigante", { managerName: "T", seed: 21 });
    const b = createScenarioWorld(DB, "gigante", { managerName: "T", seed: 21 });
    expect(a.userClubId).toBe(b.userClubId);
    expect(a.rng).toBe(b.rng);
    expect(a.clubs[a.userClubId].div).toBe("B");
    expect(a.comps.serieB.teams).toContain(a.userClubId);
    expect(a.comps.serieA.teams.length).toBe(b.comps.serieA.teams.length);
    expect(a.scenario?.status).toBe("active");
    a.comps.serieB.promoted = [a.userClubId];
    expect(checkScenario(a)).toMatch(/vencido/);
    expect(a.ach!.got.scenario_win).toBeTruthy();
  });

  it("Libertadores com orçamento zero: saldo zerado e derrota na eliminação", () => {
    const w = createScenarioWorld(DB, "liberta-zero", { managerName: "T", seed: 4 });
    expect(w.clubs[w.userClubId].balance).toBe(0);
    expect(w.comps.liberta.teams).toContain(w.userClubId);
    expect(aliveIn(w.comps.liberta, w.userClubId)).toBe(true);
    w.comps.liberta.ties.push({ id: 1, comp: "liberta", stage: "r16", a: w.userClubId, b: "x", legs: 2, fixtures: [], winner: "x" });
    expect(checkScenario(w)).toMatch(/perdido/);
    expect(w.scenario!.status).toBe("lost");
  });

  it("salvar do rebaixamento: 10 jogos e zona de rebaixamento", () => {
    const w = createScenarioWorld(DB, "salvar", { managerName: "T", seed: 8 });
    const left = w.fixtures.filter((f) => f.comp === "serieA" && !f.result && (f.home === w.userClubId || f.away === w.userClubId)).length;
    expect(left).toBeLessThanOrEqual(10);
    expect(left).toBeGreaterThanOrEqual(9);
    expect(tablePosition(w.comps.serieA, w.userClubId)).toBeGreaterThan(16);
    expect(w.ach).toBeUndefined();
    expect(SCENARIO_BY_ID.salvar.check!(w, w.userClubId)).toBeNull();
  }, 60_000);
});
