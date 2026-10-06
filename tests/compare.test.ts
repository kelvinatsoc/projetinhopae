import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { bestIndexes, starterFor, SUMMARY_KEYS, summaryStats } from "../src/engine/compare";
import { createWorld, type Database } from "../src/engine/world";

const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 7 });

describe("comparação de jogadores", () => {
  it("resumo em 6 eixos fica entre 1 e 99 e segue os atributos", () => {
    for (const p of Object.values(w.players).slice(0, 200)) {
      const s = summaryStats(p);
      for (const k of SUMMARY_KEYS) { expect(s[k]).toBeGreaterThanOrEqual(1); expect(s[k]).toBeLessThanOrEqual(99); }
      expect(s.rit).toBe(Math.max(1, Math.min(99, Math.round(p.attrs.vel))));
    }
  });
  it("destaca o melhor valor, ignorando desconhecidos e empates totais", () => {
    expect(bestIndexes([70, 80, 80])).toEqual([1, 2]);
    expect(bestIndexes([70, 70])).toEqual([]);
    expect(bestIndexes([null, 60, 50])).toEqual([1]);
    expect(bestIndexes([null, 60])).toEqual([]);
  });
  it("acha o titular do seu time na posição", () => {
    const gk = starterFor(w, "GOL");
    expect(gk?.clubId).toBe(w.userClubId);
    expect(gk?.pos).toBe("GOL");
    expect(starterFor(w, "GOL", gk!.id)?.id).not.toBe(gk!.id);
  });
});
