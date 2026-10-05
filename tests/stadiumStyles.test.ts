import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { attendance, handStyle, handmadeKeys, isBigGame, normStadium, proceduralStyle, stadiumStyleFor } from "../src/data/stadiumStyles";

type C = { id: string; stadium: string; capacity: number; colors: [string, string, string]; rep: number };
const clubs = (db as unknown as { clubs: C[] }).clubs;
const byId = (id: string) => clubs.find((c) => c.id === id)!;

describe("estilos de estádio", () => {
  it("normaliza nomes", () => {
    expect(normStadium("  Estádio  Maracanã ")).toBe("estadio maracana");
  });
  it("estádios famosos têm identidade própria", () => {
    expect(stadiumStyleFor(byId("flamengo")).landmarks).toContain("maracana-roof");
    expect(stadiumStyleFor(byId("fluminense")).key).toBe("maracana");
    expect(stadiumStyleFor(byId("sao-paulo")).landmarks).toContain("morumbi-ring");
    expect(stadiumStyleFor(byId("boca-juniors")).shape).toBe("bombonera");
    expect(stadiumStyleFor(byId("botafogo")).shape).toBe("track");
    expect(stadiumStyleFor(byId("palmeiras")).shape).toBe("english");
    expect(stadiumStyleFor(byId("bahia")).shape).toBe("open-end");
    expect(stadiumStyleFor(byId("santos")).shape).toBe("small");
    expect(handStyle("Morumbi")?.key).toBe("morumbis");
  });
  it("pelo menos 40 dos maiores estádios do banco são feitos à mão", () => {
    const top = [...new Map(clubs.map((c) => [normStadium(c.stadium), c])).values()].sort((a, b) => b.capacity - a.capacity).slice(0, 45);
    expect(top.filter((c) => stadiumStyleFor(c).handmade).length).toBeGreaterThanOrEqual(42);
    expect(handmadeKeys().length).toBeGreaterThanOrEqual(40);
  });
  it("todo clube recebe um estilo válido e determinístico", () => {
    for (const c of clubs) {
      const s = stadiumStyleFor(c);
      expect(s.seats.length).toBeGreaterThan(0);
      expect(s.name.length).toBeGreaterThan(0);
      expect(stadiumStyleFor(c)).toEqual(s);
    }
  });
  it("procedural segue a capacidade", () => {
    const base = { id: "x", stadium: "Estádio Teste", colors: ["#ff0000", "#0000ff", "#fff"] as [string, string, string] };
    expect(proceduralStyle({ ...base, capacity: 8000 }).shape).toBe("small");
    expect(["bowl", "track"]).toContain(proceduralStyle({ ...base, capacity: 60000 }).shape);
    expect(stadiumStyleFor({ ...base, capacity: 8000 }, true).key).toBe("neutral");
  });
  it("jogo grande enche mais o estádio", () => {
    const fla = byId("flamengo"), flu = byId("fluminense"), x = byId("tombense");
    expect(isBigGame(fla, flu)).toBe(true);
    expect(isBigGame(x, fla, "final")).toBe(true);
    const s = stadiumStyleFor(fla);
    expect(attendance(s, fla, true)).toBeGreaterThan(attendance(s, fla, false));
  });
});
