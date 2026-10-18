// Painel ao vivo (MatchSim.extra) e instruções rápidas: números plausíveis, coerentes com o motor,
// e nada disso muda o jogo quando não é usado.
import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { cloneForMatch, liveOutlook, matchStakes, momentumShare, setStakes } from "../src/engine/assistant";
import { MatchSim } from "../src/engine/match";
import { getRngState, setRngState } from "../src/engine/rng";
import { SHOUTS } from "../src/engine/shouts";
import type { Fixture } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 11 });
const ids = Object.values(w.clubs).filter((c) => c.div === "A").map((c) => c.id);
const fx = (i: number): Fixture => ({ id: 61000 + i, comp: "serieA", stage: "league", round: 1, day: w.day, home: ids[i % 20], away: ids[(i * 7 + 5) % 20] });

function play(i: number, live = false) {
  const f = fx(i);
  const b = cloneForMatch(w, f);
  b.reset();
  setRngState(500 + i);
  const sim = new MatchSim(b.mini, f, { live, userSide: null });
  sim.runToEnd();
  return sim;
}

describe("painel ao vivo", () => {
  it("números plausíveis e coerentes com o motor", () => {
    const N = 40;
    let passes = 0, ok = 0, off = 0, tk = 0;
    for (let i = 0; i < N; i++) {
      const s = play(i);
      const x = s.extra;
      for (const k of [0, 1] as const) {
        passes += x.passes[k]; ok += x.passesOk[k]; off += x.offsides[k]; tk += x.tackles[k];
        expect(x.passesOk[k]).toBeLessThanOrEqual(x.passes[k]);
        expect(x.saves[k]).toBeLessThanOrEqual(s.stats.onTarget[1 - k]);
        // zonas: um registro por minuto com a bola, igual à posse do motor
        expect(x.zones[k].reduce((a, b) => a + b, 0)).toBe(s.stats.poss[k]);
        expect(x.timeline.filter((t) => t.a === k).length).toBe(s.stats.poss[k]);
        // gols no gráfico = gols no placar
        expect(x.timeline.filter((t) => t.a === k && t.g).length).toBe(s.sides[k].goals);
      }
    }
    const per = (v: number) => v / (2 * N);
    expect(per(passes)).toBeGreaterThan(300);
    expect(per(passes)).toBeLessThan(700);
    expect(ok / passes).toBeGreaterThan(0.7);
    expect(ok / passes).toBeLessThan(0.9);
    expect(per(off)).toBeGreaterThan(0.8);
    expect(per(off)).toBeLessThan(5);
    expect(per(tk)).toBeGreaterThan(11);
    expect(per(tk)).toBeLessThan(24);
  });

  it("desarmes continuam equilibrados mesmo com posse de bola muito desigual (sem 31 x 6)", () => {
    const f: Fixture = { id: 62001, comp: "serieA", stage: "league", round: 1, day: w.day, home: "flamengo", away: "mirassol" };
    let tkDom = 0, tkLow = 0, possDom = 0;
    const M = 25;
    for (let i = 0; i < M; i++) {
      const b = cloneForMatch(w, f);
      b.reset();
      // Força diferença grande no meio para simular ~75% de posse do mandante
      for (const p of Object.values(b.mini.players)) {
        if (p.clubId === "flamengo") p.attrs.pas = Math.min(99, p.attrs.pas + 15);
      }
      setRngState(1200 + i);
      const sim = new MatchSim(b.mini, f, { live: false, userSide: null });
      sim.runToEnd();
      const tot = sim.stats.poss[0] + sim.stats.poss[1] || 1;
      possDom += sim.stats.poss[0] / tot;
      tkDom += sim.extra.tackles[0];
      tkLow += sim.extra.tackles[1];
    }
    expect(possDom / M).toBeGreaterThan(0.6);
    expect(tkDom / M).toBeGreaterThanOrEqual(9);
    expect(tkLow / M).toBeLessThanOrEqual(24);
    expect((tkLow / M) / Math.max(1, tkDom / M)).toBeLessThan(1.9);
  });

  it("o painel não muda o jogo: com ou sem ele, mesmo placar, notas e sorteios", () => {
    for (let i = 0; i < 8; i++) {
      const f = fx(i);
      const out = [true, false].map((panel) => {
        const b = cloneForMatch(w, f);
        b.reset();
        setRngState(900 + i);
        const sim = new MatchSim(b.mini, f, { live: i % 2 === 0, userSide: null });
        if (!panel) (sim as unknown as { track: () => void }).track = () => {};
        sim.runToEnd();
        const r = sim.result();
        return JSON.stringify([r.hg, r.ag, r.stats, r.ratings, sim.events.length, getRngState()]);
      });
      expect(out[0]).toBe(out[1]);
    }
  });

  it("instrução rápida muda a postura só na partida e 'voltar ao plano' desfaz", () => {
    const f = fx(3);
    const b = cloneForMatch({ ...w, userClubId: f.home }, f);
    b.reset();
    setRngState(77);
    const sim = new MatchSim(b.mini, f, { live: true, userSide: 0 });
    for (let k = 0; k < 30; k++) sim.step();
    const S = sim.sides[0];
    const saved = JSON.stringify(S.club.tactic);
    const base = { att: S.att, def: S.def, m: S.mentality, p: S.pressing };
    sim.applyShout(0, "retranca");
    expect(S.shout).toBe("retranca");
    expect(S.mentality).toBe(-2);
    expect(S.def).toBeGreaterThan(base.def);
    expect(S.att).toBeLessThan(base.att);
    expect(JSON.stringify(S.club.tactic)).toBe(saved); // tática salva intocada
    sim.applyShout(0, "pressao");
    expect(S.pressing).toBe(2);
    sim.applyShout(0, null);
    expect(S.shout).toBeNull();
    expect(S.mentality).toBe(base.m);
    expect(S.pressing).toBe(S.club.tactic.pressing);
    expect(Math.abs(S.att - base.att)).toBeLessThan(1e-9);
    // marcação dobrada: só em quem está em campo
    const target = sim.sides[1].onPitch.find((x) => x != null)!;
    sim.setMark(0, target);
    expect(S.mark).toBe(target);
    sim.setMark(0, null);
    expect(S.mark).toBeNull();
    expect(SHOUTS.length).toBeGreaterThanOrEqual(6);
  });

  it("mata-mata: o modelo conta o agregado e o valor do empate", () => {
    const f = fx(4);
    const b = cloneForMatch({ ...w, userClubId: f.home }, f);
    b.reset();
    setRngState(78);
    const sim = new MatchSim(b.mini, f, { live: false, userSide: 0 });
    for (let k = 0; k < 70; k++) sim.step();
    expect(matchStakes(sim, 0).knockout).toBe(false);
    const league = liveOutlook(sim, 0);
    setStakes(sim, 0, { offset: -2, dv: 0.5, knockout: true, final: false, leg: 2 });
    const behind = liveOutlook(sim, 0);
    setStakes(sim, 0, { offset: 2, dv: 0.5, knockout: true, final: false, leg: 2 });
    const ahead = liveOutlook(sim, 0);
    expect(behind.go).toBeLessThan(ahead.go);
    expect(Math.abs(league.pts - (3 * league.win + league.draw))).toBeLessThan(1e-9);
    const mo = momentumShare(sim, 0, 10);
    expect(mo.n).toBe(10);
    expect(mo.us + mo.them).toBeCloseTo(1, 6);
  });
});
