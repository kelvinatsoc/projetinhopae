import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { expectedGoals, sideState } from "../src/engine/assistant";
import { autoLineup, clubStrength } from "../src/engine/lineup";
import { MatchSim } from "../src/engine/match";
import { FORMATIONS } from "../src/engine/positions";
import { getRngState, setRngState } from "../src/engine/rng";
import { aiTalk, halfTones, reactions, suggest, talkEffect, type TalkCtx, type Tone } from "../src/engine/teamtalk";
import type { Fixture, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 42 });
const fx = (home: string, away: string, id = 5000): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: 20, home, away });
const pre = (diff: number, morale = 70): TalkCtx => ({ diff, phase: "pre", score: 0, morale });
const half = (score: number, diff = 0): TalkCtx => ({ diff, phase: "half", score });

describe("preleção", () => {
  it("tabela de efeitos", () => {
    expect(talkEffect(pre(0), "motivar")).toBeCloseTo(0.02);
    expect(talkEffect(pre(0, 90), "motivar")).toBeCloseTo(0.025);
    expect(talkEffect(pre(-5), "calma")).toBeCloseTo(0.03);
    expect(talkEffect(pre(5), "calma")).toBeCloseTo(-0.01);
    expect(talkEffect(pre(0), "calma")).toBeCloseTo(0.01);
    expect(talkEffect(pre(5), "exigir")).toBeCloseTo(0.03);
    expect(talkEffect(pre(-5), "exigir")).toBeCloseTo(-0.02);
    expect(talkEffect(pre(1), "exigir")).toBeCloseTo(0.01);
    expect(talkEffect(pre(2), "confiar")).toBeCloseTo(0.025);
    expect(talkEffect(pre(4), "confiar")).toBeCloseTo(0.01);
    expect(talkEffect(half(-1), "exigir")).toBeCloseTo(0.04);
    expect(talkEffect(half(-1), "motivar")).toBeCloseTo(0.025);
    expect(talkEffect(half(-1), "calma")).toBeCloseTo(0.01);
    expect(talkEffect(half(-1), "elogiar")).toBeCloseTo(-0.02);
    expect(talkEffect(half(0), "motivar")).toBeCloseTo(0.03);
    expect(talkEffect(half(0), "confiar")).toBeCloseTo(0.015);
    expect(talkEffect(half(0), "elogiar")).toBeCloseTo(0.015);
    expect(talkEffect(half(0), "exigir")).toBeCloseTo(0.01);
    expect(talkEffect(half(1), "elogiar")).toBeCloseTo(0.025);
    expect(talkEffect(half(1), "calma")).toBeCloseTo(0.01);
    expect(talkEffect(half(1, -2), "exigir")).toBeCloseTo(0.02);
    expect(talkEffect(half(1, 4), "exigir")).toBeCloseTo(-0.01);
    expect(talkEffect(half(1), "motivar")).toBeCloseTo(0.01);
    // capitão Líder: ×1,25
    expect(talkEffect({ ...half(-1), lid: true }, "exigir")).toBeCloseTo(0.05);
    expect(halfTones(-2)[0]).toBe("exigir");
    expect(halfTones(0)[0]).toBe("motivar");
    expect(halfTones(3)[0]).toBe("elogiar");
  });

  it("o efeito fica sempre entre −3% e +5%", () => {
    const tones: Tone[] = ["motivar", "calma", "exigir", "confiar", "elogiar"];
    for (const phase of ["pre", "half"] as const) for (let diff = -12; diff <= 12; diff++) for (let score = -3; score <= 3; score++)
      for (const lid of [false, true]) for (const t of tones) {
        const e = talkEffect({ diff, phase, score, morale: 90, lid }, t);
        expect(e).toBeGreaterThanOrEqual(-0.03);
        expect(e).toBeLessThanOrEqual(0.05);
      }
  });

  it("reações e conversa da IA são determinísticas e não mexem no gerador global", () => {
    const f = fx("flamengo", "palmeiras");
    const ids = base.clubs.flamengo.players.slice(0, 11);
    setRngState(9999);
    const a = reactions(base, f, ids, "motivar", pre(0));
    const b = reactions(base, f, ids, "motivar", pre(0));
    expect(a).toEqual(b);
    expect(a.every((r) => ["🔥", "🙂", "😐", "😟"].includes(r.emoji))).toBe(true);
    expect(aiTalk(base, f, pre(-4), 1)).toBe(aiTalk(base, f, pre(-4), 1));
    expect(suggest(base, f, pre(-4), 0)).toBe(suggest(base, f, pre(-4), 0));
    expect(getRngState()).toBe(9999);
  });

  it("applyTalk aplica moral só no time do usuário e muda a força", () => {
    const w = structuredClone(base) as World;
    const f = fx("flamengo", "palmeiras", 5001);
    const sim = new MatchSim(w, f, { userSide: 0 });
    expect(sim.talk[0]).toBe(0);
    expect(sim.talk[1]).not.toBe(0); // a IA já fez a preleção dela
    const before = sim.sides[0].att;
    const rs = sim.applyTalk(0, "motivar", "pre");
    expect(rs.length).toBe(11);
    expect(sim.talk[0]).toBeCloseTo(talkEffect(sim.talkCtx(0, "pre"), "motivar"));
    expect(sim.sides[0].att).not.toBe(before);
  });

  it("azarão que pede calma aumenta os gols esperados no modelo do auxiliar", () => {
    const clubs = Object.values(base.clubs).filter((c) => c.div === "A").sort((a, b) => clubStrength(base, b) - clubStrength(base, a));
    const strong = clubs[0], weak = clubs[clubs.length - 1];
    const w = { ...base, userClubId: weak.id } as World;
    const f = fx(strong.id, weak.id, 5002);
    const slots = (c: typeof weak) => (FORMATIONS[c.tactic.formation] ?? FORMATIONS["4-3-3"]).map((s) => s.pos);
    const lw = autoLineup(w, weak, "serieA"), ls = autoLineup(w, strong, "serieA");
    const ctx: TalkCtx = { diff: -8, phase: "pre", score: 0 };
    const calm = talkEffect(ctx, "calma");
    expect(calm).toBeGreaterThan(0);
    const us = (talk: number) => sideState(w, slots(weak), lw.starters, 0, 1, false, 96, { f, club: weak, oppM: 0, captain: lw.captain, talk });
    const them = sideState(w, slots(strong), ls.starters, 0, 1, true, 96, { f, club: strong, oppM: 0, captain: ls.captain });
    const [g0] = expectedGoals(us(0), them, 96);
    const [g1] = expectedGoals(us(calm), them, 96);
    expect(g1).toBeGreaterThan(g0);
  });
});
