import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { withWorldRng } from "../src/engine/common";
import { afterUserMatch, chemOf, monthlyMood, talkTo } from "../src/engine/dressing";
import { squadOf } from "../src/engine/lineup";
import { completeTransfer } from "../src/engine/transfers";
import type { Fixture, MatchResult, Player, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed = 42, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const NEUTRAL: [number, number, number, number, number, number, number] = [10, 10, 10, 10, 10, 10, 8];

/** Elenco neutro: moral 60 (sem bônus de líderes) e ninguém com minutos registrados. */
function setup(w: World): Player[] {
  const sq = squadOf(w, w.clubs[w.userClubId]);
  for (const p of sq) { p.morale = 60; p.pt = undefined; }
  return sq;
}

describe("vestiário", () => {
  it("craque no banco reclama, pede conversa no 2º mês e pede para sair no 4º", () => {
    const w = make();
    const sq = setup(w);
    const p = sq[sq.length - 1];
    p.role = "C";
    p.hid = NEUTRAL;
    p.morale = 90;
    for (let m = 1; m <= 4; m++) {
      const before = p.morale;
      p.pt = [0, 8 * m];
      monthlyMood(w);
      expect(before - p.morale).toBeGreaterThanOrEqual(6);
      if (m === 2) expect(w.news.some((n) => n.title.includes(`${p.name} quer conversar`))).toBe(true);
    }
    expect(p.wantsOut).toBe(true);
  });

  it("promessa cumprida: +6 e nada de pedido de saída", () => {
    const w = make();
    const [p] = setup(w);
    p.role = "T";
    p.hid = NEUTRAL;
    p.pt = [2, 6];
    const r = withWorldRng(w, () => talkTo(w, p, "promise"));
    expect(r.ok).toBe(true);
    w.day += 61;
    p.pt = [2 + 5, 6 + 6];
    const before = p.morale;
    monthlyMood(w);
    expect(p.morale - before).toBeGreaterThanOrEqual(6);
    expect(p.wantsOut).toBeFalsy();
    expect(p.promise).toBeUndefined();
  });

  it("promessa quebrada: −20 e pede para sair", () => {
    const w = make();
    const [p] = setup(w);
    p.role = "T";
    p.hid = NEUTRAL;
    p.morale = 80;
    p.pt = [2, 6];
    withWorldRng(w, () => talkTo(w, p, "promise"));
    w.day += 61;
    p.pt = [2, 12];
    const before = p.morale;
    monthlyMood(w);
    expect(before - p.morale).toBeGreaterThanOrEqual(20);
    expect(p.wantsOut).toBe(true);
  });

  it("entrosamento: IA sempre 70; cada reforço derruba 4", () => {
    const w = make();
    expect(chemOf(w, w.clubs.palmeiras)).toBe(70);
    const user = w.clubs[w.userClubId];
    user.chem = 70;
    const frees = Object.values(w.players).filter((p) => !p.clubId).slice(0, 6);
    for (const p of frees) completeTransfer(w, p, user, 0, p.wage || 10_000, 2);
    expect(chemOf(w, user)).toBe(46);
  });

  it("respeita o intervalo entre conversas", () => {
    const w = make();
    const [p] = setup(w);
    const a = withWorldRng(w, () => talkTo(w, p, "praise"));
    expect(a.ok).toBe(true);
    const b = withWorldRng(w, () => talkTo(w, p, "praise"));
    expect(b.ok).toBe(false);
    w.day += 21;
    expect(withWorldRng(w, () => talkTo(w, p, "praise")).ok).toBe(true);
  });

  it("não mexe na moral dos clubes da IA", () => {
    const w = make();
    const ai = Object.values(w.players).filter((p) => p.clubId && p.clubId !== w.userClubId);
    const snap = ai.map((p) => p.morale);
    const user = w.clubs[w.userClubId];
    const ids = squadOf(w, user).map((p) => p.id);
    const f = { id: 1, comp: "serieA", stage: "league", round: 1, day: 10, home: user.id, away: "palmeiras" } as Fixture;
    const r = { hg: 1, ag: 0, events: [], ratings: {}, lineups: [ids.slice(0, 11), squadOf(w, w.clubs.palmeiras).slice(0, 11).map((p) => p.id)] } as unknown as MatchResult;
    for (let i = 0; i < 5; i++) afterUserMatch(w, f, r, 0);
    monthlyMood(w);
    expect(ai.map((p) => p.morale)).toEqual(snap);
    expect(squadOf(w, user)[0].pt?.[1]).toBe(5);
    expect(user.chem).toBeGreaterThan(70);
  });
});
