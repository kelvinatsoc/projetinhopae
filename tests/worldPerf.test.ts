import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { createWorld, type Database } from "../src/engine/world";
import { makeWorldFixture } from "./fixtures/worldFixture";

// Escala real: 9 ligas de 20 clubes (~180 clubes estrangeiros) + 48 seleções; um ano inteiro.
describe("mundo: desempenho", () => {
  it("um ano completo com todas as ligas fica dentro do orçamento", () => {
    const t0 = Date.now();
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 2, world: makeWorldFixture({ clubsPerLeague: 20 }) });
    const t1 = Date.now();
    for (let i = 0; i < 900; i++) {
      const r = advance(w);
      if (r.reason === "match" && r.fixture) {
        loadRng(w);
        const res = simulateFixture(w, r.fixture);
        saveRng(w);
        finishUserMatch(w, r.fixture, res);
      } else if (r.reason === "seasonEnd") {
        runEndOfSeason(w);
        break;
      }
    }
    const t2 = Date.now();
    const size = JSON.stringify(w).length;
    console.log(`mundo grande: criação ${t1 - t0}ms, ano ${t2 - t1}ms, save ${(size / 1e6).toFixed(1)} MB, jogos ${w.fixtures.length}`);
    expect(w.season).toBe(2027);
    expect(w.comps.eng1.carry).toBe(true);
    expect(t2 - t1).toBeLessThan(150_000); // folga para CI
  }, 240_000);
});
