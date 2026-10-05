import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { ESTADUAIS } from "../src/data/estaduais";
import { estadualTitles, isEstadual } from "../src/engine/estaduais";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import type { World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

function play(w: World, untilDay = 999) {
  for (let i = 0; i < 400; i++) {
    if (w.day > untilDay) break;
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") break;
  }
}

const estComps = (w: World) => Object.values(w.comps).filter(isEstadual);

function noClashes(w: World) {
  const seen = new Set<string>();
  for (const f of w.fixtures) {
    for (const c of [f.home, f.away]) {
      const k = `${c}@${f.day}`;
      expect(seen.has(k), `${c} joga duas vezes no dia ${f.day}`).toBe(false);
      seen.add(k);
    }
  }
}

describe("campeonatos estaduais", () => {
  it("cria os estaduais com clubes do estado e fictícios fora da pirâmide", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "palmeiras", seed: 11 });
    const comps = estComps(w);
    expect(comps.length).toBe(ESTADUAIS.length);
    for (const c of comps) {
      const def = ESTADUAIS.find((e) => e.id === c.id)!;
      expect(c.teams.length).toBe(def.size);
      expect(new Set(c.teams).size).toBe(def.size);
      for (const id of c.teams) expect(w.clubs[id].region).toBe(def.uf);
    }
    expect(w.comps["est-SP"].groups.length).toBe(4);
    expect(w.comps["est-SP"].teams).toContain("palmeiras");
    const minors = Object.values(w.clubs).filter((c) => c.minor);
    expect(minors.length).toBeGreaterThan(20);
    for (const m of minors) {
      expect(m.div).toBe("D");
      expect(m.logo).toBeFalsy();
      expect(m.players.length).toBeGreaterThanOrEqual(20);
      for (const id of ["serieA", "serieB", "serieC", "copaBR"]) expect(w.comps[id].teams).not.toContain(m.id);
    }
    // datas de janeiro a março e sem dois jogos do mesmo clube no mesmo dia
    for (const f of w.fixtures.filter((x) => x.comp.startsWith("est-"))) expect(f.day).toBeLessThan(90);
    noClashes(w);
    expect(w.board.estadual?.code).toBe("title");
  });

  it("temporada completa com estaduais: campeões, troféus, prêmios e virada de ano (determinístico)", () => {
    const run = () => {
      const w = createWorld(db as Database, { managerName: "T", clubId: "bahia", seed: 2026 });
      play(w, 85);
      return w;
    };
    const a = run();
    const b = run();
    const champs = (w: World) => estComps(w).map((c) => `${c.id}:${c.champion}`).join(",");
    for (const c of estComps(a)) {
      expect(c.done, `${c.id} terminou`).toBe(true);
      expect(c.teams).toContain(c.champion);
    }
    expect(champs(a)).toBe(champs(b));
    noClashes(a);
    expect(a.clubs.bahia.finance.income.prize ?? 0).toBeGreaterThan(0);

    play(a);
    expect(a.seasonEnded).toBe(true);
    const champions = estComps(a).map((c) => c.champion!);
    runEndOfSeason(a);
    expect(a.season).toBe(2027);
    for (const id of champions) {
      expect(estadualTitles(a.clubs[id])).toBeGreaterThanOrEqual(1);
      expect(a.clubs[id].history.at(-1)!.titles.some((t) => t.startsWith("est-"))).toBe(true);
    }
    expect(Object.keys(a.history.at(-1)!.champions).filter((k) => k.startsWith("est-")).length).toBe(ESTADUAIS.length);
    // pirâmide intacta: fictícios continuam fora das séries
    expect(Object.values(a.clubs).filter((c) => c.div === "A").length).toBe(20);
    for (const id of ["serieA", "serieB", "serieC", "copaBR"]) {
      expect(a.comps[id].teams.some((t) => a.clubs[t].minor)).toBe(false);
    }
    expect(estComps(a).length).toBe(ESTADUAIS.length);
    noClashes(a);
  }, 120000);

  it("save antigo (sem estaduais) carrega e ganha os estaduais na temporada seguinte", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "sport", seed: 5 });
    // simula um save de antes dos estaduais
    for (const c of estComps(w)) delete w.comps[c.id];
    w.fixtures = w.fixtures.filter((f) => !f.comp.startsWith("est-"));
    for (const c of Object.values(w.clubs).filter((x) => x.minor)) {
      for (const id of c.players) delete w.players[id];
      delete w.clubs[c.id];
    }
    delete w.board.estadual;
    const save = JSON.parse(JSON.stringify(w)) as World;
    save.version = 2;
    migrateWorld(save, db as Database);
    expect(estComps(save).length).toBe(0);
    play(save);
    expect(save.seasonEnded).toBe(true);
    runEndOfSeason(save);
    expect(estComps(save).length).toBe(ESTADUAIS.length);
    expect(save.comps["est-PE"].teams).toContain("sport");
    expect(save.board.estadual?.comp).toBe("est-PE");
  }, 120000);
});
