import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { LEGEND_BY_ID } from "../src/data/legends";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { squadOf } from "../src/engine/lineup";
import { completeTransfer } from "../src/engine/transfers";
import type { World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";
import { spawnLegend } from "../src/engine/youth";

function playSeason(w: World) {
  for (let i = 0; i < 400; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") return;
  }
  throw new Error("temporada não terminou");
}

describe("várias temporadas", () => {
  it("mantém o mundo estável por 5 temporadas", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "remo", seed: 99 });
    const counts: number[] = [];
    for (let s = 0; s < 5; s++) {
      playSeason(w);
      runEndOfSeason(w);
      counts.push(Object.keys(w.players).length);
      for (const c of Object.values(w.clubs)) {
        if (c.div !== "D") expect(squadOf(w, c).length).toBeGreaterThanOrEqual(18);
      }
      for (const d of ["A", "B", "C"] as const) expect(Object.values(w.clubs).filter((c) => c.div === d).length).toBe(20);
    }
    console.log("jogadores por temporada", counts.join(", "), "lendas", Object.keys(w.legends).length, "temporada", w.season);
    expect(Math.max(...counts)).toBeLessThan(9000);
    expect(Math.min(...counts)).toBeGreaterThan(4000);
  }, 300000);

  it("lenda renasce com potencial de lenda e pode ser contratada", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "santos", seed: 5 });
    const p = spawnLegend(w, LEGEND_BY_ID.pele, w.clubs.santos);
    expect(p.pot).toBe(97);
    expect(w.season - p.born).toBeLessThanOrEqual(16);
    expect(p.youth).toBe(true);
    expect(w.legends.pele.active).toBe(p.id);
    const buyer = w.clubs.flamengo;
    completeTransfer(w, p, buyer, 10_000_000, 50_000, 3);
    expect(p.clubId).toBe("flamengo");
    expect(w.clubs.santos.players.includes(p.id)).toBe(false);
  });
});
