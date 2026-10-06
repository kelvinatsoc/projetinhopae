import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { intlWindows, leagueDays, seasonEndDay, yearLen } from "../src/engine/calendar";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";
import { leaguePhaseDraw } from "../src/engine/uefa";
import { pickSquad, worldCupDays } from "../src/engine/international";
import { isAvailable } from "../src/engine/lineup";
import type { Fixture, World } from "../src/engine/types";
import { makeWorldFixture } from "./fixtures/worldFixture";

function playUntil(w: World, stop: (w: World) => boolean, maxSteps = 900) {
  for (let i = 0; i < maxSteps && !stop(w); i++) {
    const r = advance(w);
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

const newWorld = (seed = 7) =>
  createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed, world: makeWorldFixture() });

function noDoubleBookings(fixtures: Fixture[]) {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const f of fixtures) for (const c of [f.home, f.away]) {
    const k = `${c}@${f.day}`;
    if (seen.has(k)) dup.push(k);
    seen.add(k);
  }
  return dup;
}

describe("mundo: calendário", () => {
  it("em ano de Copa o Brasileirão pula as semanas da Copa e termina no mesmo dia", () => {
    const normal = leagueDays(2026), wc = leagueDays(2026, true);
    expect(wc).toHaveLength(38);
    expect(new Set(wc).size).toBe(38);
    const d = worldCupDays(2026);
    expect(wc.filter((x) => x >= d.md[0] && x <= d.final)).toHaveLength(0);
    expect(Math.max(...wc)).toBeLessThanOrEqual(Math.max(...normal));
    expect(Math.max(...wc)).toBeLessThan(seasonEndDay(2026));
  });

  it("sem dados do mundo, o jogo fica idêntico (mesmo seed, mesma tabela)", () => {
    const a = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 3 });
    const b = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 3 });
    expect(a.wl).toBeUndefined();
    expect(a.fixtures.map((f) => f.day)).toEqual(b.fixtures.map((f) => f.day));
  });
});

describe("mundo: um ano inteiro com Europa e seleções", () => {
  const w = newWorld();
  const t0 = Date.now();
  playUntil(w, (x) => x.season === 2026 && x.day >= 240);
  const midMs = Date.now() - t0;

  it("cria as ligas ago–mai, a Champions e a Europa League no dia 181", () => {
    expect(w.comps.eng1?.carry).toBe(true);
    expect(w.comps.eng1.label).toBe("2026/27");
    expect(w.comps.ucl.teams).toHaveLength(36);
    expect(w.comps.uel.teams.length).toBeGreaterThanOrEqual(30);
    const eng = w.fixtures.filter((f) => f.comp === "eng1");
    expect(Math.max(...eng.map((f) => f.day))).toBeGreaterThan(yearLen(2026)); // termina em 2027
  });

  it("a Copa do Mundo 2026 teve 48 seleções, 32 no mata-mata e um campeão", () => {
    const h = w.intl!.honors.find((x) => x.comp === "wc" && x.season === 2026);
    expect(h).toBeTruthy();
    expect(w.intl!.nts[h!.winner].trophies.length).toBe(1);
    const caps = Object.values(w.players).filter((p) => (p.caps ?? 0) > 0);
    expect(caps.length).toBeGreaterThan(200);
  });

  it("nenhum clube joga duas vezes no mesmo dia", () => {
    expect(noDoubleBookings(w.fixtures)).toEqual([]);
    expect(noDoubleBookings(w.intl!.fixtures)).toEqual([]);
  });

  it("vira o ano preservando a temporada europeia e termina a Champions em maio", () => {
    const t1 = Date.now();
    playUntil(w, (x) => x.season === 2027 && x.day >= 200);
    const ms = Date.now() - t1;
    console.log(`mundo: jan–ago/2026 ${midMs}ms, ago/2026–jul/2027 ${ms}ms`);
    expect(w.season).toBe(2027);
    // a temporada 2027/28 já foi criada no dia 181; a 2026/27 terminou com campeão (troféu entregue)
    const champs = Object.values(w.clubs).flatMap((c) => c.trophies).filter((t) => t.name.includes("2026/27"));
    expect(champs.some((t) => t.comp === "ucl")).toBe(true);
    expect(champs.some((t) => t.comp === "eng1")).toBe(true);
    expect(w.comps.eng1.label).toBe("2027/28");
    expect(noDoubleBookings(w.fixtures)).toEqual([]);
    expect(ms).toBeLessThan(120_000);
  }, 180_000);
});

describe("mundo: Champions (fase de liga)", () => {
  it("36 clubes, 8 jogos cada, 4 em casa e 4 fora, sem repetir adversário", () => {
    const w = newWorld(11);
    const teams = Object.values(w.clubs).filter((c) => c.league).slice(0, 36).map((c) => c.id);
    const rounds = leaguePhaseDraw(w, teams);
    expect(rounds).toHaveLength(8);
    const home: Record<string, number> = {}, opp: Record<string, Set<string>> = {};
    for (const r of rounds) {
      const inRound = new Set<string>();
      for (const [h, a] of r) {
        expect(inRound.has(h) || inRound.has(a)).toBe(false);
        inRound.add(h); inRound.add(a);
        home[h] = (home[h] ?? 0) + 1;
        (opp[h] ??= new Set()).add(a);
        (opp[a] ??= new Set()).add(h);
      }
    }
    for (const t of teams) {
      expect(home[t]).toBe(4);
      expect(opp[t].size).toBe(8);
    }
  });
});

describe("mundo: convocações", () => {
  it("convoca os melhores da nacionalidade, que ficam fora do clube durante a data FIFA", () => {
    const w = newWorld(5);
    const nt = w.intl!.nts["nt-BRA"];
    const squad = pickSquad(w, nt, 23);
    expect(squad).toHaveLength(23);
    expect(squad.every((p) => p.nat === "BRA")).toBe(true);
    expect(squad.filter((p) => p.pos === "GOL")).toHaveLength(3);
    const best = Object.values(w.players).filter((p) => p.nat === "BRA" && p.clubId && !p.youth).sort((a, b) => b.ovr - a.ovr)[0];
    expect(squad.map((p) => p.id)).toContain(best.id);
    // primeira data FIFA (março)
    const win = intlWindows(2026)[0];
    playUntil(w, (x) => x.day >= win.start + 1);
    const called = w.intl!.callups["nt-BRA"].map((id) => w.players[id]);
    expect(called.length).toBeGreaterThan(15);
    expect(called.every((p) => p.away === "nt-BRA" && !isAvailable(p))).toBe(true);
    playUntil(w, (x) => x.day >= win.end + 2);
    expect(called.every((p) => !p.away)).toBe(true);
    expect(called.some((p) => (p.caps ?? 0) > 0)).toBe(true);
  }, 60_000);
});

describe("mundo: migração de save antigo", () => {
  it("save sem mundo ganha os dados; ligas só a partir do próximo dia 181 que não passou", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 9 });
    playUntil(w, (x) => x.day >= 200);
    const nFix = w.fixtures.length;
    migrateWorld(w, db as Database, makeWorldFixture());
    expect(w.wl?.startYear).toBe(2027);
    expect(w.version).toBe(4);
    expect(w.fixtures.length).toBe(nFix);
    expect(Object.values(w.clubs).filter((c) => c.league).length).toBe(72);
    playUntil(w, (x) => x.day >= 260);
    expect(w.comps.eng1).toBeUndefined();
  }, 60_000);
});
