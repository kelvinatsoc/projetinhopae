import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { fatigueRotationTip } from "../src/engine/assistant";
import { MatchSim } from "../src/engine/match";
import type { Fixture } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const w = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 77 });
const fx = (id: number, day: number): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day, home: "flamengo", away: "palmeiras" });

/** Partida no 2º tempo com o auxiliar ligado (sem rodar minutos: o plano é puro). */
function simAt(min: number, goals: [number, number]) {
  const sim = new MatchSim(w, fx(880001, w.day), { live: true, userSide: 0 });
  sim.setAssistant(0, true);
  sim.half = 2;
  sim.minute = min;
  sim.sides[0].goals = goals[0];
  sim.sides[1].goals = goals[1];
  return sim;
}

describe("auxiliar técnico nas substituições", () => {
  it("troca o cansado", () => {
    const sim = simAt(62, [0, 0]);
    const id = sim.sides[0].onPitch.find((x, k) => x != null && sim.sides[0].slots[k] !== "GOL")!;
    const p = w.players[id];
    const cond = p.cond;
    p.cond = 40;
    try {
      const plan = sim.assistantPlan(0);
      expect(plan.some((s) => s.out === id && /cansado/.test(s.why))).toBe(true);
      expect(plan.every((s) => sim.sides[0].bench.includes(s.in))).toBe(true);
    } finally {
      p.cond = cond;
    }
  });

  it("perdendo, coloca um atacante", () => {
    const sim = simAt(70, [0, 1]);
    const plan = sim.assistantPlan(0);
    expect(plan.some((s) => /ofensividade/.test(s.why))).toBe(true);
  });

  it("jogo decidido: dá rodagem ao banco", () => {
    const sim = simAt(70, [4, 0]);
    const plan = sim.assistantPlan(0);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((s) => /decidido/.test(s.why))).toBe(true);
  });

  it("no primeiro tempo e com o jogo normal, não mexe", () => {
    const sim = simAt(30, [0, 0]);
    sim.half = 1;
    expect(sim.assistantPlan(0)).toEqual([]);
  });

  it("partida inteira com o auxiliar: no máximo 5 trocas e eventos explicados", () => {
    const sim = new MatchSim(w, fx(880002, w.day), { live: true, userSide: 0 });
    sim.setAssistant(0, true);
    sim.runToEnd();
    const subs = sim.events.filter((e) => e.side === 0 && /Auxiliar: sai/.test(e.text));
    expect(subs.length).toBeLessThanOrEqual(5);
  });

  it("sugere rodízio com jogos em sequência e titulares cansados", () => {
    const f = fx(880003, w.day + 30);
    const next = fx(880004, w.day + 32);
    const ww = { ...w, fixtures: [...w.fixtures, f, next] };
    const club = ww.clubs.flamengo;
    const tired = club.players.map((id) => ww.players[id]).filter((p) => p && p.pos !== "GOL");
    const old = tired.map((p) => p.cond);
    tired.forEach((p) => (p.cond = 60));
    try {
      const tip = fatigueRotationTip(ww, f);
      expect(tip?.title).toBe("Rodízio");
      expect(tip!.lineup.starters.filter((x) => x != null).length).toBe(11);
    } finally {
      tired.forEach((p, i) => (p.cond = old[i]));
    }
  });
});
