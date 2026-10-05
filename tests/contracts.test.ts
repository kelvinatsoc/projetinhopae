import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { withWorldRng } from "../src/engine/common";
import { agentScore, AGENT_OK, clauseDay, defaultRole, defaultTerms, ensureClause, goalBonuses } from "../src/engine/contracts";
import { validateWorld } from "../src/engine/integrity";
import { squadOf } from "../src/engine/lineup";
import { getRngState } from "../src/engine/rng";
import { acceptOffer, completeTransfer, evaluateUserBid, releasePlayer } from "../src/engine/transfers";
import type { Fixture, MatchResult, SquadRole, TransferOffer } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const NEUTRAL: [number, number, number, number, number, number, number] = [10, 10, 10, 10, 10, 10, 8];

describe("contratos", () => {
  it("termos padrão deixam o empresário satisfeito (um toque)", () => {
    const w = make(42);
    const user = w.clubs[w.userClubId];
    for (const p of squadOf(w, user).slice(0, 10)) {
      p.morale = 70;
      p.hid = NEUTRAL;
      expect(agentScore(w, p, "renew", defaultTerms(w, p, "renew")).score).toBeGreaterThanOrEqual(AGENT_OK);
    }
    const target = squadOf(w, w.clubs.palmeiras)[0];
    target.morale = 70;
    target.hid = NEUTRAL;
    expect(agentScore(w, target, "sign", defaultTerms(w, target, "sign")).score).toBeGreaterThanOrEqual(AGENT_OK);
  });

  it("salário de 70% com papel menor não fecha", () => {
    const w = make(42);
    const user = w.clubs[w.userClubId];
    const p = squadOf(w, user).sort((a, b) => b.ovr - a.ovr)[0];
    p.morale = 70;
    p.hid = NEUTRAL;
    const t = defaultTerms(w, p, "renew");
    expect(defaultRole(w, user, p)).toBe("C");
    const r = agentScore(w, p, "renew", { ...t, wage: Math.round(t.wage * 0.7), role: "S" as SquadRole });
    expect(r.score).toBeLessThan(AGENT_OK);
    expect(r.hint.length).toBeGreaterThan(0);
  });

  it("proposta ≥ multa é aceita mesmo com o elenco do vendedor curto", () => {
    const w = make(42);
    w.day = 20;
    const seller = w.clubs.bahia;
    const sq = squadOf(w, seller).sort((a, b) => b.ovr - a.ovr);
    for (const x of sq.slice(18)) releasePlayer(w, x, false);
    expect(squadOf(w, seller).length).toBeLessThanOrEqual(18);
    const p = sq[0];
    p.clause = 30_000_000;
    expect(evaluateUserBid(w, p, 29_000_000).status).not.toBe("accepted");
    const r = evaluateUserBid(w, p, 30_000_000);
    expect(r.status).toBe("accepted");
    expect(r.message).toContain("multa");
  });

  it("a IA paga a multa e o usuário recebe exatamente o valor", () => {
    const w = make(42);
    w.day = 20;
    const user = w.clubs[w.userClubId];
    const p = squadOf(w, user).sort((a, b) => a.ovr - b.ovr)[5];
    p.clause = 2_000_000;
    const before = user.finance.income.sales ?? 0;
    let n = 0;
    withWorldRng(w, () => { while (p.clubId === user.id && n++ < 20000) clauseDay(w); });
    expect(p.clubId).not.toBe(user.id);
    expect((user.finance.income.sales ?? 0) - before).toBe(2_000_000);
    expect(w.news.some((x) => x.title.includes("pagou a multa"))).toBe(true);
    expect(validateWorld(w)).toEqual([]);
  });

  it("bônus por gol é cobrado por gol", () => {
    const w = make(42);
    const user = w.clubs[w.userClubId];
    const p = squadOf(w, user)[0];
    p.goalBonus = 20_000;
    const f = { id: 1, comp: "serieA", stage: "league", round: 1, day: 10, home: user.id, away: "palmeiras" } as Fixture;
    const r = { hg: 2, ag: 0, events: [
      { min: 10, type: "goal", side: 0, pid: p.id, text: "" },
      { min: 50, type: "pen-goal", side: 0, pid: p.id, text: "" },
    ], ratings: {}, lineups: [[], []] } as unknown as MatchResult;
    const before = user.finance.expense.bonus ?? 0;
    goalBonuses(w, f, r);
    expect((user.finance.expense.bonus ?? 0) - before).toBe(40_000);
  });

  it("revenda paga o clube de origem na venda seguinte", () => {
    const w = make(42);
    const user = w.clubs[w.userClubId];
    const p = squadOf(w, user)[3];
    const offer: TransferOffer = { id: 999, pid: p.id, from: "palmeiras", to: user.id, fee: 10_000_000, status: "pending", day: w.day, season: w.season, byUser: false };
    w.offers.push(offer);
    const b0 = user.balance;
    acceptOffer(w, offer, 0.2);
    expect(user.balance - b0).toBe(9_000_000); // 20% de revenda custa 10% da oferta
    expect(p.sellOn).toEqual({ club: user.id, pct: 0.2 });
    const b1 = user.balance;
    completeTransfer(w, p, w.clubs.corinthians, 20_000_000, p.wage, 3);
    expect(user.balance - b1).toBe(4_000_000);
    expect(p.sellOn).toBeUndefined();
    expect(validateWorld(w)).toEqual([]);
  });

  it("multa rescisória é determinística e não mexe no gerador", () => {
    const a = make(42), b = make(42);
    const ids = squadOf(a, a.clubs.palmeiras).map((p) => p.id);
    const rng0 = getRngState();
    const ca = ids.map((id) => ensureClause(a, a.players[id]));
    expect(getRngState()).toBe(rng0);
    const cb = ids.map((id) => ensureClause(b, b.players[id]));
    expect(ca).toEqual(cb);
    expect(ca.some((x) => x > 0)).toBe(true);
    expect(ensureClause(a, squadOf(a, a.clubs.flamengo)[0])).toBe(0); // seus jogadores só têm multa se você negociar
  });
});
