import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { aiInfrastructure, canRequest, makeRequest, migrateBoardProjects, REQUESTS, requestCost } from "../src/engine/board";
import { absDay } from "../src/engine/common";
import { facilitiesDaily, facLevel } from "../src/engine/facilities";
import { createWorld, type Database } from "../src/engine/world";
import type { World } from "../src/engine/types";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const goTo = (w: World, abs: number) => { w.season = Math.floor(abs / 400); w.day = abs - w.season * 400; };
type Legacy = { proj?: unknown };

describe("diretoria: pedidos (obras só em Estrutura)", () => {
  it("a diretoria não oferece mais obras", () => {
    expect(REQUESTS.map((r) => r.kind)).toEqual(["grant"]);
  });

  it("pedido negado coloca o pedido em espera", () => {
    const w = make(23);
    w.board.confidence = 10;
    const r = makeRequest(w, "grant");
    expect(r.ok).toBe(false);
    expect(r.msg).toContain("confiança");
    expect(w.board.cool?.grant).toBe(absDay(w) + 60);
    expect(canRequest(w, "grant").reason).toContain("Peça de novo");
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

  it("migra obras antigas da diretoria para Estrutura (ou reembolsa)", () => {
    const w = make(28);
    const c = w.clubs[w.userClubId];
    c.facilities = 3;
    c.youthFac = 2;
    const now = absDay(w);
    const bal = c.balance;
    (c as Legacy).proj = [
      { kind: "ct", start: now - 10, done: now + 20, cost: 1_000_000 },
      { kind: "yrec", start: now - 10, done: now + 20, cost: 500_000 },
    ];
    migrateBoardProjects(w);
    expect((c as Legacy).proj).toBeUndefined();
    expect(c.fac!.builds).toEqual([{ kind: "training", to: 4, start: now - 10, done: now + 20, cost: 1_000_000 }]);
    expect(c.balance - bal).toBe(500_000); // captação não tem equivalente: reembolso
    goTo(w, now + 20);
    facilitiesDaily(w);
    expect(facLevel(c, "training")).toBe(4);
    expect(c.facilities).toBe(4);
    expect(c.fac!.builds).toHaveLength(0);
  });

  it("obra antiga que não cabe é reembolsada; estádio vira obra de estádio", () => {
    const w = make(29);
    const c = w.clubs[w.userClubId];
    c.facilities = 5;
    c.capacity = 20_000;
    const now = absDay(w);
    const bal = c.balance;
    (c as Legacy).proj = [
      { kind: "ct", start: now, done: now + 5, cost: 2_000_000 },
      { kind: "stadium", start: now, done: now + 5, cost: 3_000_000, add: 5000 },
    ];
    const cap = c.capacity;
    const lv = facLevel(c, "stadium");
    migrateBoardProjects(w);
    expect(c.balance - bal).toBe(2_000_000);
    expect(c.fac!.builds.map((b) => b.kind)).toEqual(["stadium"]);
    goTo(w, now + 5);
    facilitiesDaily(w);
    expect(facLevel(c, "stadium")).toBe(lv + 1);
    expect(c.capacity).toBeGreaterThan(cap);
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
