import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { clubStrength } from "../src/engine/lineup";
import { MatchSim, simulateFixture } from "../src/engine/match";
import { formOf, NEUTRAL_SIDE, playerMods, sideMult } from "../src/engine/matchmods";
import { getRngState, setRngState } from "../src/engine/rng";
import type { Fixture, Pos, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 42 });
const serieA = (w: World) => Object.values(w.clubs).filter((c) => c.div === "A").map((c) => c.id);
const fx = (home: string, away: string, id: number): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: 20, home, away });

/** Joga todos os confrontos da Série A `reps` vezes, restaurando condição/lesão/moral a cada jogo. */
function league(w: World, reps: number, seed: number, onSim?: (sim: MatchSim) => void) {
  const A = serieA(w);
  const snap = Object.values(w.players).map((p) => [p, p.cond, p.injury, p.morale] as const);
  const outer = getRngState();
  setRngState(seed);
  let n = 0, goals = 0, id = 700000;
  for (let r = 0; r < reps; r++) for (const a of A) for (const b of A) {
    if (a === b) continue;
    const sim = new MatchSim(w, fx(a, b, id++));
    while (!sim.finished) {
      sim.step();
      onSim?.(sim);
    }
    goals += sim.sides[0].goals + sim.sides[1].goals;
    n++;
    for (const [p, c, i, m] of snap) { p.cond = c; p.injury = i; p.morale = m; }
  }
  setRngState(outer);
  return { n, goals: goals / n };
}

describe("efeitos no jogo (matchmods)", () => {
  it("a forma do dia é determinística e não mexe no gerador global", () => {
    const f = fx("flamengo", "palmeiras", 1);
    const p = base.players[base.clubs.flamengo.players[0]];
    setRngState(12345);
    const a = formOf(base, f, p);
    const b = formOf(base, f, p);
    expect(getRngState()).toBe(12345);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0.88);
    expect(a).toBeLessThan(1.14);
    expect(formOf(base, fx("flamengo", "palmeiras", 2), p)).not.toBe(a);
  });

  it("clube da IA e clube do usuário neutro têm multiplicadores exatamente 1", () => {
    const f = fx("flamengo", "palmeiras", 3);
    const club = base.clubs.flamengo;
    const slots: Pos[] = ["GOL", "ZAG", "ZAG", "LD", "LE", "VOL", "MC", "MEI", "PD", "PE", "ATA"];
    // sem jogadas na escalação: tudo neutro
    const sm = sideMult(base, f, club, slots, slots.map(() => null), 0, 0);
    expect(sm).toEqual(NEUTRAL_SIDE);
    const p = base.players[club.players[0]];
    expect(playerMods(base, f, p, true).injDays).toBe(playerMods(base, f, p, false).injDays);
  });

  it("entrosamento 70 e foco neutro: resultado idêntico ao do mesmo jogo como clube da IA", () => {
    const w = structuredClone(base) as World;
    const f = fx("flamengo", "palmeiras", 4);
    const run = (userClubId: string) => {
      w.userClubId = userClubId;
      const snap = Object.values(w.players).map((p) => [p, p.cond, p.injury, p.morale] as const);
      setRngState(777);
      const r = simulateFixture(w, f);
      for (const [p, c, i, m] of snap) { p.cond = c; p.injury = i; p.morale = m; }
      return JSON.stringify(r);
    };
    w.clubs.flamengo.chem = 70;
    expect(run("flamengo")).toBe(run("gremio"));
  });

  it("sem nenhuma jogada preferida, a média de gols muda pouco", () => {
    const stripped = structuredClone(base) as World;
    for (const p of Object.values(stripped.players)) p.traits = [];
    const a = league(base, 4, 99);
    const b = league(stripped, 4, 99);
    console.log(`gols/jogo com jogadas ${a.goals.toFixed(3)}, sem ${b.goals.toFixed(3)} (${a.n} jogos)`);
    expect(Math.abs(a.goals - b.goals)).toBeLessThan(0.12);
  }, 60000);

  it("atacante Matador converte mais chutes que sem a jogada", () => {
    const rate = (mat: boolean) => {
      let shots = 0, goals = 0;
      for (const seed of [42, 7]) {
        const w = seed === 42 ? (structuredClone(base) as World) : createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed });
        for (const p of Object.values(w.players)) {
          if (p.pos !== "ATA") continue;
          const rest = (p.traits ?? []).filter((t) => t !== "MAT" && t !== "CHF");
          p.traits = mat ? ["MAT", ...rest] : rest;
        }
        league(w, 2, seed, (sim) => {
          const s = sim.phase.shot;
          if (!s || s.kind) return;
          if (sim.player(s.shooter).pos !== "ATA") return;
          shots++;
          if (s.result === "goal") goals++;
        });
      }
      return goals / shots;
    };
    const withMat = rate(true), without = rate(false);
    console.log(`gols por chute de ATA: com Matador ${withMat.toFixed(4)}, sem ${without.toFixed(4)}`);
    expect(withMat).toBeGreaterThan(without);
  }, 60000);

  it("trapaça sem lesões: nenhum jogador do usuário se machuca em 50 jogos", () => {
    const w = structuredClone(base) as World;
    w.admin = { on: true, seasons: [], cheats: { noInj: true }, log: [] };
    const A = serieA(w).filter((c) => c !== "flamengo");
    setRngState(31337);
    let userInj = 0, otherInj = 0;
    for (let i = 0; i < 50; i++) {
      const home = i % 2 === 0;
      const opp = A[i % A.length];
      const r = simulateFixture(w, fx(home ? "flamengo" : opp, home ? opp : "flamengo", 800000 + i));
      const us = home ? 0 : 1;
      for (const e of r.events) if (e.type === "injury") { if (e.side === us) userInj++; else otherInj++; }
      for (const p of Object.values(w.players)) { p.cond = 100; p.injury = 0; }
    }
    expect(userInj).toBe(0);
    expect(otherInj).toBeGreaterThan(0);
  });

  it("turbo de 20% do admin: o usuário vence bem mais um jogo parelho", () => {
    const w = structuredClone(base) as World;
    const mine = clubStrength(w, w.clubs.flamengo);
    const opp = serieA(w).filter((c) => c !== "flamengo").sort((a, b) => Math.abs(clubStrength(w, w.clubs[a]) - mine) - Math.abs(clubStrength(w, w.clubs[b]) - mine))[0];
    const wins = (boost: 0 | 0.2) => {
      w.admin = { on: true, seasons: [], cheats: { boost }, log: [] };
      setRngState(4242);
      let v = 0;
      for (let i = 0; i < 200; i++) {
        const home = i % 2 === 0;
        const r = simulateFixture(w, fx(home ? "flamengo" : opp, home ? opp : "flamengo", 810000 + i));
        const us = home ? r.hg : r.ag, them = home ? r.ag : r.hg;
        if (us > them) v++;
        for (const p of Object.values(w.players)) { p.cond = 100; p.injury = 0; }
      }
      return v / 200;
    };
    const a = wins(0), b = wins(0.2);
    console.log(`vitórias do usuário: normal ${(a * 100).toFixed(0)}%, turbo ${(b * 100).toFixed(0)}%`);
    expect(b - a).toBeGreaterThanOrEqual(0.08);
  }, 60000);
});
