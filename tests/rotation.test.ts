import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { rotationTip } from "../src/engine/assistant";
import { advance, finishUserMatch, loadRng, saveRng } from "../src/engine/game";
import { autoLineup } from "../src/engine/lineup";
import { simulateFixture } from "../src/engine/match";
import { aiMatchLineup, rotationIntensity } from "../src/engine/rotation";
import type { Fixture, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "palmeiras") => createWorld(db as Database, { managerName: "T", clubId, seed });

function playEstaduais(w: World) {
  for (let i = 0; i < 400 && w.day < 95; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    }
  }
}

describe("estaduais: rodízio dos grandes", () => {
  it("clubes da Série A (IA) poupam titulares no começo e jogam com força máxima na final", () => {
    const w = make(31);
    const big = w.clubs["flamengo"];
    const small = Object.values(w.clubs).find((c) => c.minor && c.region === big.region)!;
    const f1 = { id: -1, comp: "est-RJ", stage: "league", round: 1, day: w.day + 1, home: big.id, away: small.id } as Fixture;
    const best = new Set(autoLineup(w, big, f1.comp, big.tactic.formation, false).starters);
    const early = aiMatchLineup(w, big, f1);
    expect(rotationIntensity(w, big, f1)).toBeGreaterThan(0.7);
    expect(early.starters.filter((id) => best.has(id)).length).toBeLessThanOrEqual(4);
    // o pequeno não poupa ninguém
    expect(rotationIntensity(w, small, f1)).toBe(0);
    // final: melhor time
    const fin = { ...f1, stage: "final" } as Fixture;
    expect(rotationIntensity(w, big, fin)).toBe(0);
    expect(aiMatchLineup(w, big, fin)).toEqual(autoLineup(w, big, fin.comp));
    // clássico: força máxima
    const derby = { ...f1, away: "fluminense" } as Fixture;
    expect(rotationIntensity(w, big, derby)).toBe(0);
    // fora do estadual: nada muda
    expect(rotationIntensity(w, big, { ...f1, comp: "serieA" } as Fixture)).toBe(0);
  });

  it("garotos da base ganham minutos no time alternativo", () => {
    const w = make(32);
    const big = w.clubs["flamengo"];
    const f1 = { id: -1, comp: "est-RJ", stage: "league", round: 1, day: w.day + 1, home: big.id, away: "fluminense" } as Fixture;
    const alt = aiMatchLineup(w, big, { ...f1, away: Object.values(w.clubs).find((c) => c.minor && c.region === "RJ")!.id });
    const ids = [...alt.starters, ...alt.bench].filter((x): x is number => x != null);
    expect(ids.some((id) => w.players[id].youth)).toBe(true);
    expect(ids.every((id) => w.players[id].clubId === big.id)).toBe(true);
  });

  it("o auxiliar sugere (sem aplicar) o time alternativo ao usuário", () => {
    const w = make(33);
    const user = w.clubs[w.userClubId];
    const before = JSON.stringify(user.lineup ?? null);
    const opp = w.clubs[w.comps["est-SP"].teams.find((id) => w.clubs[id].div !== "A")!];
    const f = { id: -1, comp: "est-SP", stage: "group", round: 1, day: w.day + 1, home: user.id, away: opp.id } as Fixture;
    const tip = rotationTip(w, f)!;
    expect(tip.text).toContain("Clubes grandes costumam poupar titulares nesta fase do estadual");
    expect(tip.lineup.starters.filter((x) => x != null).length).toBe(11);
    expect(JSON.stringify(user.lineup ?? null)).toBe(before);
    expect(rotationTip(w, { ...f, stage: "final" } as Fixture)).toBeUndefined();
  });

  it("média de gols e goleadas dos estaduais numa temporada com semente", () => {
    const w = make(5);
    playEstaduais(w);
    const est = w.fixtures.filter((f) => f.comp.startsWith("est-") && f.result);
    expect(est.length).toBeGreaterThan(300);
    const goals = est.reduce((s, f) => s + f.result!.hg + f.result!.ag, 0) / est.length;
    const margins = est.map((f) => Math.abs(f.result!.hg - f.result!.ag));
    const big = margins.filter((m) => m >= 5).length / margins.length;
    console.log(`Estaduais: gols/jogo ${goals.toFixed(2)}, maior margem ${Math.max(...margins)}, margem ≥5 ${(big * 100).toFixed(1)}%`);
    expect(goals).toBeGreaterThanOrEqual(2.4);
    expect(goals).toBeLessThanOrEqual(2.9);
    expect(Math.max(...margins)).toBeLessThanOrEqual(7);
    expect(big).toBeLessThan(0.03);
  }, 120_000);
});
