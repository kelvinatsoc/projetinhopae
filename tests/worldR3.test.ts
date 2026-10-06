import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { progressCompetitions } from "../src/engine/competitions";
import { createClubWorldCup, cwcDays } from "../src/engine/continental";
import { advance, applyResult, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { createWorld, type Database } from "../src/engine/world";
import { fastFixture } from "../src/engine/worldLeagues";
import type { Fixture, World } from "../src/engine/types";
import { makeWorldFixture } from "./fixtures/worldFixture";

export function playUntil(w: World, stop: (w: World) => boolean, maxSteps = 3000, step = 400) {
  for (let i = 0; i < maxSteps && !stop(w); i++) {
    const r = advance(w, step);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") {
      if (stop(w)) return;
      runEndOfSeason(w);
    }
  }
}

const dup = (fx: Fixture[]) => {
  const seen = new Set<string>(), out: string[] = [];
  for (const f of fx) for (const c of [f.home, f.away]) { const k = `${c}@${f.day}`; if (seen.has(k)) out.push(k); seen.add(k); }
  return out;
};

describe("mundo R3: ACL Elite e Intercontinental", () => {
  const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 21, world: makeWorldFixture() });
  playUntil(w, (x) => x.season === 2027 && x.day >= 352);

  it("a ACL Elite 2026/27 teve zonas Oeste e Leste e um campeão asiático", () => {
    const t = Object.values(w.clubs).flatMap((c) => c.trophies.map((x) => ({ ...x, c }))).filter((x) => x.comp === "acle");
    expect(t.length).toBeGreaterThan(0);
    expect(["ksa1", "jpn1"]).toContain(t[0].c.league);
  });

  it("a Intercontinental 2027 reúne os campeões da Libertadores e da Champions", () => {
    const ic = w.comps.intercontinental;
    expect(ic).toBeTruthy();
    expect(ic.teams).toContain(w.wl!.lastUcl);
    expect(ic.done).toBe(true);
    expect(dup(w.fixtures)).toEqual([]);
  });
});

describe("mundo R3: Mundial de Clubes", () => {
  it("32 clubes, 8 grupos, mata-mata e campeão (2029)", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 5, world: makeWorldFixture() });
    w.season = 2029;
    w.fixtures = [];
    w.comps = {};
    createClubWorldCup(w);
    const cwc = w.comps.cwc;
    expect(cwc.teams).toHaveLength(32);
    expect(cwc.groups).toHaveLength(8);
    const confs = cwc.teams.map((id) => w.clubs[id]);
    expect(confs.filter((c) => c.league && ["eng1", "esp1", "ita1", "ger1", "fra1", "por1", "ned1", "tur1", "sco1"].includes(c.league)).length).toBeGreaterThanOrEqual(12);
    expect(confs.some((c) => c.country === "BRA")).toBe(true);
    const d = cwcDays(2029);
    loadRng(w);
    for (let day = d.md[0]; day <= d.final; day++) {
      for (const f of w.fixtures) if (f.day === day && !f.result) applyResult(w, f, fastFixture(w, f));
      progressCompetitions(w);
    }
    saveRng(w);
    expect(cwc.done).toBe(true);
    expect(cwc.ties.filter((t) => t.stage === "r16")).toHaveLength(8);
    expect(dup(w.fixtures)).toEqual([]);
    expect(w.clubs[cwc.champion!].trophies.some((t) => t.comp === "cwc")).toBe(true);
  });
});
