import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import world from "../src/data/world.json";
import type { WorldData } from "../src/data/worldTypes";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { validateWorld } from "../src/engine/integrity";
import { simulateFixture } from "../src/engine/match";
import { createWorld, type Database } from "../src/engine/world";
import { encodeWorld } from "../src/savePack";
import type { Fixture, World } from "../src/engine/types";

const dup = (fx: Fixture[]) => {
  const seen = new Set<string>(), out: string[] = [];
  for (const f of fx) for (const c of [f.home, f.away]) { const k = `${c}@${f.day}`; if (seen.has(k)) out.push(k); seen.add(k); }
  return out;
};

function play(w: World, stop: (w: World) => boolean) {
  for (let i = 0; i < 1500 && !stop(w); i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) { loadRng(w); const res = simulateFixture(w, r.fixture); saveRng(w); finishUserMatch(w, r.fixture, res); }
    else if (r.reason === "seasonEnd") { if (stop(w)) return; runEndOfSeason(w); }
  }
}

// Teste de fumaça com os dados reais: novo jogo, ano inteiro (Brasil, Europa, Champions, Copa 2026) até jul/2027.
describe("mundo real (world.json)", () => {
  const t0 = performance.now();
  const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 7, world: world as unknown as WorldData });
  const tCreate = performance.now() - t0;
  const t1 = performance.now();
  play(w, (x) => x.season === 2026 && x.day >= 340);
  const tYear = performance.now() - t1;

  it("cria o mundo real com as ligas e a Copa 2026", () => {
    expect(Object.values(w.clubs).filter((c) => c.league).length).toBeGreaterThan(250);
    expect(Object.keys(w.intl!.nts).length).toBe(60);
    const wc = w.intl!.comps["wc-2026"];
    expect(wc.teams).toHaveLength(48);
    expect(wc.done).toBe(true);
    expect(w.comps.ucl.teams).toHaveLength(36);
    expect(w.comps.eng1.teams).toHaveLength(20);
    expect(w.comps.arg1a.done).toBe(true);
    expect(w.comps.arg1a.groups.map((g) => g.teams.length)).toEqual([15, 15]);
    expect(w.comps.usa1).toBeTruthy();
    expect(dup(w.fixtures)).toEqual([]);
    expect(dup(w.intl!.fixtures)).toEqual([]);
    expect(validateWorld(w)).toEqual([]);
  });

  it("vira o ano, termina a temporada europeia e mede desempenho e save", async () => {
    const t2 = performance.now();
    play(w, (x) => x.season === 2027 && x.day >= 200);
    const tNext = performance.now() - t2;
    expect(w.season).toBe(2027);
    expect(Object.values(w.clubs).some((c) => c.trophies.some((t) => t.comp === "ucl"))).toBe(true);
    expect(w.comps.eng1.label).toBe("2027/28");
    const t3 = performance.now();
    const enc = await encodeWorld(w);
    const tSave = performance.now() - t3;
    const size = enc.fmt === "gz1" ? enc.data.byteLength : enc.data.length;
    console.log(`real: criação ${Math.round(tCreate)}ms · jan–dez/2026 ${Math.round(tYear)}ms · jan–jul/2027 ${Math.round(tNext)}ms · ` +
      `jogadores ${Object.keys(w.players).length} · save JSON ${(JSON.stringify(w).length / 1e6).toFixed(1)}MB → ${(size / 1e6).toFixed(2)}MB (${Math.round(tSave)}ms)`);
    expect(size).toBeLessThan(5e6);
    expect(tYear).toBeLessThan(150_000);
  }, 300_000);
});
