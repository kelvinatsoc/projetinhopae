import { describe, expect, it } from "vitest";
import { canStartWork, finishAllWorks, startWork, stadiumLookDaily, workCost } from "../src/engine/stadiumLook";
import { stadiumStyleFor, withLook } from "../src/data/stadiumStyles";
import type { Club, World } from "../src/engine/types";

function fakeWorld(): { w: World; c: Club } {
  const c = {
    id: "sao-paulo", name: "São Paulo", stadium: "MorumBIS", capacity: 66000, colors: ["#ffffff", "#e4002b", "#111111"], div: "A",
    balance: 400_000_000, finance: { income: {}, expense: {} },
  } as unknown as Club;
  const w = { season: 2026, day: 10, clubs: { [c.id]: c } } as unknown as World;
  return { w, c };
}

describe("personalização do estádio", () => {
  it("cobra a reforma na hora e aplica o visual quando termina", () => {
    const { w, c } = fakeWorld();
    const cost = workCost(c, "seats");
    expect(cost).toBeGreaterThan(0);
    expect(startWork(w, c, "seats", { seats: ["#000000", "#ffffff"], pattern: "sectors" })).toBeNull();
    expect(c.balance).toBe(400_000_000 - cost);
    expect(c.look?.seats).toBeUndefined();
    expect(canStartWork(c, "seats")).toMatch(/andamento/);
    w.day += 4 * 7;
    expect(stadiumLookDaily(w).length).toBe(1);
    expect(c.look?.seats).toEqual(["#000000", "#ffffff"]);
    expect(c.lookWorks).toBeUndefined();
  });
  it("anel extra aumenta a capacidade uma vez só", () => {
    const { w, c } = fakeWorld();
    startWork(w, c, "tier", {});
    finishAllWorks(c);
    expect(c.capacity).toBe(Math.round(66000 * 1.2));
    expect(canStartWork(c, "tier")).toMatch(/anel extra/);
  });
  it("sem dinheiro não começa", () => {
    const { w, c } = fakeWorld();
    c.balance = 0;
    expect(startWork(w, c, "roof", { roof: { type: "ring" } })).toMatch(/Saldo/);
  });
  it("a partida usa as cadeiras, a cobertura e o nome do naming rights", () => {
    const { c } = fakeWorld();
    c.look = { seats: ["#123456"], roof: { type: "none" } };
    const st = stadiumStyleFor(c, false, "Arena Patrocinada");
    expect(st.seats).toEqual(["#123456"]);
    expect(st.roof).toBe("none");
    expect(st.name).toBe("Arena Patrocinada");
    const plain = stadiumStyleFor({ ...c, look: undefined });
    expect(withLook(plain)).toBe(plain);
  });
});
