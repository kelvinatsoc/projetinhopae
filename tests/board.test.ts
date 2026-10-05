import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { aiInfrastructure, boardShare, canRequest, makeRequest, projectTick, requestCost } from "../src/engine/board";
import { absDay } from "../src/engine/common";
import { validateWorld } from "../src/engine/integrity";
import { createWorld, type Database } from "../src/engine/world";
import type { World } from "../src/engine/types";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
/** Leva o mundo para um dia absoluto (só o relógio). */
const goTo = (w: World, abs: number) => { w.season = Math.floor(abs / 400); w.day = abs - w.season * 400; };

describe("diretoria: pedidos e obras", () => {
  it("a obra termina exatamente no dia previsto e aplica o nível", () => {
    const w = make(21);
    const c = w.clubs[w.userClubId];
    c.facilities = 3;
    c.balance = 1e9;
    w.board.confidence = 60;
    const r = makeRequest(w, "ct");
    expect(r.ok).toBe(true);
    const p = c.proj![0];
    expect(p.done - p.start).toBeGreaterThanOrEqual(149);
    goTo(w, p.done - 1);
    projectTick(w);
    expect(c.facilities).toBe(3);
    goTo(w, p.done);
    projectTick(w);
    expect(c.facilities).toBe(4);
    expect(c.proj).toBeUndefined();
    expect(validateWorld(w)).toEqual([]);
  });

  it("o saldo cai custo × (1 − parte da diretoria)", () => {
    const w = make(22);
    const c = w.clubs[w.userClubId];
    c.balance = 1e9;
    w.board.confidence = 85;
    const cost = requestCost(w, "stadium");
    expect(boardShare(w, "stadium")).toBe(0.3);
    const bal = c.balance;
    const cap = c.capacity;
    expect(makeRequest(w, "stadium").ok).toBe(true);
    expect(bal - c.balance).toBe(Math.round(cost * 0.7));
    expect(c.finance.expense.infra).toBe(Math.round(cost * 0.7));
    goTo(w, c.proj![0].done);
    projectTick(w);
    expect(c.capacity).toBeGreaterThan(cap);
    expect(c.expansions).toBe(1);
  });

  it("pedido negado coloca o pedido em espera", () => {
    const w = make(23);
    w.clubs[w.userClubId].facilities = 2;
    w.board.confidence = 10;
    const r = makeRequest(w, "ct");
    expect(r.ok).toBe(false);
    expect(r.msg).toContain("confiança");
    expect(w.board.cool?.ct).toBe(absDay(w) + 60);
    expect(canRequest(w, "ct").ok).toBe(false);
    expect(canRequest(w, "ct").reason).toContain("Peça de novo");
    // sem caixa
    const w2 = make(24);
    w2.board.confidence = 90;
    w2.clubs[w2.userClubId].balance = 0;
    w2.clubs[w2.userClubId].youthFac = 2;
    const r2 = makeRequest(w2, "yfac");
    expect(r2.ok).toBe(false);
    expect(r2.msg).toContain("caixa");
  });

  it("a verba extra sai só uma vez por temporada", () => {
    const w = make(25);
    const c = w.clubs[w.userClubId];
    w.board.confidence = 90;
    const bal = c.balance;
    expect(makeRequest(w, "grant").ok).toBe(true);
    expect(c.balance - bal).toBe(requestCost(w, "grant"));
    expect(w.board.confidence).toBe(87);
    expect(makeRequest(w, "grant").ok).toBe(false);
    w.season++;
    expect(canRequest(w, "grant").ok).toBe(true);
  });

  it("no máximo 2 obras ao mesmo tempo, uma por tipo", () => {
    const w = make(26);
    const uc = w.clubs[w.userClubId];
    uc.balance = 1e10;
    uc.youthFac = 3;
    uc.youthCoach = 3;
    uc.facilities = 3;
    w.board.confidence = 100;
    expect(makeRequest(w, "yfac").ok).toBe(true);
    expect(makeRequest(w, "yfac").ok).toBe(false);
    expect(makeRequest(w, "ycoach").ok).toBe(true);
    expect(canRequest(w, "ct").ok).toBe(false);
  });

  it("aiInfrastructure nunca passa de 5 e não mexe no clube do usuário", () => {
    const w = make(27);
    const user = w.clubs[w.userClubId];
    for (const c of Object.values(w.clubs)) c.balance = 1e11;
    user.balance = 1e11;
    const ub = JSON.stringify({ f: user.facilities, y: user.youthLevel });
    for (let i = 0; i < 40; i++) aiInfrastructure(w);
    expect(JSON.stringify({ f: user.facilities, y: user.youthLevel })).toBe(ub);
    expect(user.balance).toBe(1e11);
    for (const c of Object.values(w.clubs)) {
      expect(c.facilities).toBeLessThanOrEqual(5);
      expect(c.youthLevel).toBeLessThanOrEqual(5);
    }
    expect(Object.values(w.clubs).some((c) => c.id !== user.id && c.facilities === 5)).toBe(true);
  });
});
