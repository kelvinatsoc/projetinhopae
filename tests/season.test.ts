import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { advance, finishUserMatch, runEndOfSeason } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { loadRng, saveRng } from "../src/engine/game";
import { createWorld, type Database } from "../src/engine/world";
import type { World } from "../src/engine/types";

function playSeason(w: World) {
  let matches = 0;
  for (let i = 0; i < 400; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
      matches++;
    } else if (r.reason === "seasonEnd") break;
  }
  return matches;
}

describe("temporada completa", () => {
  it("simula a temporada com estatísticas realistas e vira o ano", () => {
    const t0 = Date.now();
    const w = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 42 });
    const t1 = Date.now();
    const userMatches = playSeason(w);
    const t2 = Date.now();
    const league = w.fixtures.filter((f) => f.comp === "serieA" && f.result);
    const goals = league.reduce((s, f) => s + f.result!.hg + f.result!.ag, 0) / league.length;
    const home = league.filter((f) => f.result!.hg > f.result!.ag).length / league.length;
    const draw = league.filter((f) => f.result!.hg === f.result!.ag).length / league.length;
    const yel = league.reduce((s, f) => s + f.result!.stats.yellows[0] + f.result!.stats.yellows[1], 0) / league.length;
    const shots = league.reduce((s, f) => s + f.result!.stats.shots[0] + f.result!.stats.shots[1], 0) / league.length;
    console.log(`criação ${t1 - t0}ms, temporada ${t2 - t1}ms, jogos do usuário ${userMatches}`);
    console.log(`Série A: gols/jogo ${goals.toFixed(2)}, mandante ${(home * 100).toFixed(0)}%, empates ${(draw * 100).toFixed(0)}%, amarelos ${yel.toFixed(1)}, chutes ${shots.toFixed(1)}`);
    const tableA = w.comps.serieA.table.map((r, i) => `${i + 1}. ${w.clubs[r.club].name} ${r.pts}`);
    console.log(tableA.join(" | "));
    for (const c of Object.values(w.comps)) console.log(`${c.name}: campeão ${c.champion ? w.clubs[c.champion].name : "-"} (${c.stage})`);
    const legends = Object.entries(w.legends).map(([id, s]) => `${id}@${w.clubs[s.appearances[0].clubId].name}`);
    console.log("lendas:", legends.join(", "));
    const user = w.clubs[w.userClubId];
    console.log("saldo Flamengo", user.balance, "receitas", JSON.stringify(user.finance.income), "despesas", JSON.stringify(user.finance.expense));
    expect(goals).toBeGreaterThan(1.8);
    expect(goals).toBeLessThan(3.2);
    expect(w.seasonEnded).toBe(true);
    const nPlayersBefore = Object.keys(w.players).length;
    const summary = runEndOfSeason(w);
    console.log(summary.join("\n"));
    console.log("jogadores antes/depois", nPlayersBefore, Object.keys(w.players).length, "temporada", w.season);
    expect(w.season).toBe(2027);
    expect(Object.values(w.clubs).filter((c) => c.div === "A").length).toBe(20);
    expect(w.comps.serieA.teams.length).toBe(20);
    const m2 = playSeason(w);
    console.log("2ª temporada: jogos do usuário", m2, "campeão", w.clubs[w.comps.serieA.champion!].name);
    runEndOfSeason(w);
    expect(w.season).toBe(2028);
  }, 120000);
});
