import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { GLOBAL_BRANDS, makeOffers } from "../src/engine/sponsors";
import { aiWorldBuy, askingPrice } from "../src/engine/transfers";
import { createWorld, type Database } from "../src/engine/world";
import { makeWorldFixture } from "./fixtures/worldFixture";

const newWorld = (seed = 4) => createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed, world: makeWorldFixture() });

describe("mundo: patrocínios", () => {
  it("nenhum clube europeu recebe patrocinador brasileiro", () => {
    const w = newWorld();
    for (const c of Object.values(w.clubs).filter((x) => x.league)) {
      expect(c.sponsors).toBeUndefined();
      for (const slot of ["shirt", "stadium", "kit"] as const) for (const o of makeOffers(w, c, slot)) expect(GLOBAL_BRANDS[slot]).toContain(o.brand);
    }
  });
});

describe("mundo: mercado", () => {
  it("clubes europeus compram joias brasileiras e o dinheiro circula", () => {
    const w = newWorld();
    w.day = 190;
    const before = new Map(Object.values(w.players).map((p) => [p.id, p.clubId]));
    const balances = new Map(Object.values(w.clubs).map((c) => [c.id, c.balance]));
    for (let i = 0; i < 300; i++) aiWorldBuy(w);
    const moved = Object.values(w.players).filter((p) => {
      const was = before.get(p.id);
      return was && p.clubId !== was && w.clubs[was]?.country === "BRA" && w.clubs[p.clubId!]?.league;
    });
    expect(moved.length).toBeGreaterThan(0);
    const p = moved[0];
    const seller = w.clubs[before.get(p.id)!];
    expect(seller.finance.income.sales ?? 0).toBeGreaterThan(0);
    const buyer = w.clubs[p.clubId!];
    expect(buyer.finance.expense.transfers ?? 0).toBeGreaterThan(0);
    expect(balances.get(buyer.id)).toBeDefined();
  });

  it("comprar da Europa custa mais caro (preço por liga)", () => {
    const w = newWorld();
    const eng = Object.values(w.players).find((p) => p.clubId && w.clubs[p.clubId].league === "eng1" && p.ovr > 70)!;
    const price = askingPrice(w, eng);
    const club = w.clubs[eng.clubId!];
    club.league = undefined;
    expect(price).toBeGreaterThan(askingPrice(w, eng) * 1.5);
  });
});
