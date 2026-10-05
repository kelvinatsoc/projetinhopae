import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { LEGEND_BY_ID, LEGENDS } from "../src/data/legends";
import { isBigMatch, isClassico, seeded, withWorldRng } from "../src/engine/common";
import { advance, finishUserMatch, loadRng, saveRng } from "../src/engine/game";
import { repairWorld, validateWorld } from "../src/engine/integrity";
import { simulateFixture } from "../src/engine/match";
import { H, hidOf, personalityLabel, reportLines, rollHidden } from "../src/engine/personality";
import { getRngState, hashString, rand, setRngState } from "../src/engine/rng";
import { legendTraitsFor, rollTraits, TRAIT_IDS } from "../src/engine/traits";
import type { Player, TraitId, World } from "../src/engine/types";
import { createWorld, migrateWorld, SAVE_VERSION, type Database } from "../src/engine/world";
import { spawnLegend } from "../src/engine/youth";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const firstTeam = (w: World, div?: string) =>
  Object.values(w.players).filter((p) => p.clubId && !p.youth && (!div || w.clubs[p.clubId].div === div));

describe("fundação: jogadas preferidas", () => {
  const w = make(42);

  it("distribui as jogadas em proporções razoáveis", () => {
    const ft = firstTeam(w);
    const share = (list: Player[]) => list.filter((p) => (p.traits ?? []).length > 0).length / list.length;
    const all = share(ft);
    const a = share(firstTeam(w, "A"));
    const c = share(firstTeam(w, "C"));
    const per: Record<string, number> = {};
    for (const p of ft) for (const t of p.traits ?? []) per[t] = (per[t] ?? 0) + 1;
    console.log(`com jogada: ${(all * 100).toFixed(1)}% (A ${(a * 100).toFixed(1)}%, C ${(c * 100).toFixed(1)}%)`,
      Object.entries(per).map(([t, n]) => `${t} ${((n / ft.length) * 100).toFixed(1)}%`).join(" "));
    console.log("tamanho do save (JSON):", (JSON.stringify(w).length / 1e6).toFixed(2), "MB");
    expect(all).toBeGreaterThanOrEqual(0.3);
    expect(all).toBeLessThanOrEqual(0.7);
    expect(a).toBeGreaterThan(c);
    for (const t of TRAIT_IDS) expect((per[t] ?? 0) / ft.length).toBeLessThanOrEqual(0.15);
  });

  it("nunca dá Pavio curto a jogadores reais ou lendas", () => {
    const bad = Object.values(w.players).filter((p) => (p.real || p.legend) && p.traits?.includes("PAV"));
    expect(bad).toEqual([]);
    expect(Object.values(w.players).some((p) => p.traits?.includes("PAV"))).toBe(true);
  });

  it("é determinística por semente", () => {
    const traits = (x: World) => JSON.stringify(Object.values(x.players).map((p) => [p.id, p.traits, p.hid]));
    expect(traits(make(7))).toBe(traits(make(7)));
  });

  it("não mexe no gerador global", () => {
    setRngState(12345);
    const before = getRngState();
    const ps = Object.values(w.players).slice(0, 1000);
    for (const p of ps) rollTraits(p, seeded(w, `${p.id}:t`), { real: !!p.real, legend: false, hid: hidOf(p), age: w.season - p.born });
    for (const p of ps) rollHidden(w, p);
    for (const def of LEGENDS) legendTraitsFor(def);
    expect(getRngState()).toBe(before);
  });

  it("lendas nascem com a 1ª jogada e despertam as outras com o overall", () => {
    const x = make(5, "santos");
    loadRng(x);
    const pele = spawnLegend(x, LEGEND_BY_ID.pele, x.clubs.santos);
    saveRng(x);
    expect(pele.traits).toEqual(["MAT"]);
    expect(pele.lockedTraits).toEqual(["DEC", "DRI"]);
    // lendas sem lista ganham DNA fixo com até 4 jogadas
    for (const def of LEGENDS) {
      const sig = legendTraitsFor(def);
      expect(sig.length).toBeLessThanOrEqual(4);
      expect(sig).not.toContain("PAV");
      expect(legendTraitsFor(def)).toEqual(sig);
    }
    expect(validateWorld(x)).toEqual([]);
  });
});

describe("fundação: personalidade", () => {
  const w = make(42);
  const all = Object.values(w.players);

  it("tem média de profissionalismo perto de 10,5", () => {
    const mean = all.reduce((s, p) => s + hidOf(p)[H.pro], 0) / all.length;
    const labels: Record<string, number> = {};
    for (const p of all) labels[personalityLabel(p)] = (labels[personalityLabel(p)] ?? 0) + 1;
    console.log("pro médio", mean.toFixed(2), Object.entries(labels).map(([k, n]) => `${k} ${((n / all.length) * 100).toFixed(1)}%`).join(", "));
    expect(mean).toBeGreaterThanOrEqual(9.5);
    expect(mean).toBeLessThanOrEqual(11.5);
    expect(all.every((p) => p.hid?.length === 7 && p.hid.every((v) => v >= 1 && v <= 20))).toBe(true);
  });

  it("não dá rótulos negativos a jogadores reais ou lendas", () => {
    const x = make(5, "santos");
    loadRng(x);
    for (const id of ["pele", "romario", "rogerio-ceni", "maradona"]) spawnLegend(x, LEGEND_BY_ID[id], x.clubs.santos);
    saveRng(x);
    const neg = new Set(["Desleixado", "Inconstante", "Temperamental"]);
    const bad = Object.values(x.players).filter((p) => (p.real || p.legend) && neg.has(personalityLabel(p)));
    expect(bad.map((p) => p.name)).toEqual([]);
    const pele = Object.values(x.players).find((p) => p.legend === "pele")!;
    expect(hidOf(pele)[H.pro]).toBeGreaterThanOrEqual(18);
    expect(hidOf(pele)[H.big]).toBe(20);
  });

  it("rollHidden é determinístico e não mexe no gerador global", () => {
    const p = all[123];
    const before = getRngState();
    const a = rollHidden(w, p);
    const b = rollHidden(w, p);
    expect(a).toEqual(b);
    expect(a).toEqual(p.hid);
    expect(getRngState()).toBe(before);
  });

  it("monta o relatório do auxiliar", () => {
    const p = { ...all[0], hid: [16, 15, 10, 15, 4, 18, 14] } as Player;
    expect(reportLines(p, 3).length).toBe(4);
    expect(reportLines(p, 2).length).toBe(2);
    expect(reportLines(p, 3)[0]).toBe("Cresce nos jogos grandes");
  });
});

describe("fundação: integridade do save", () => {
  it("mundo novo está íntegro", () => {
    const w = make(11);
    expect(validateWorld(w)).toEqual([]);
    expect(repairWorld(w)).toBe(0);
  });

  it("(a) migra um save v2 e reconstrói os extras iguais aos originais", () => {
    const w = make(3);
    // uma lenda já crescida: ganha as jogadas despertas conforme o overall atual
    loadRng(w);
    const z = spawnLegend(w, LEGEND_BY_ID.zico, w.clubs.flamengo);
    saveRng(w);
    const orig = JSON.stringify(Object.values(w.players).map((p) => [p.id, p.traits, p.lockedTraits, p.hid]));
    for (const p of Object.values(w.players)) { delete p.traits; delete p.hid; delete p.lockedTraits; }
    for (const c of Object.values(w.clubs)) { delete c.youthFac; delete c.youthCoach; }
    w.version = 2;
    const res = migrateWorld(w, db as Database);
    expect(res).toEqual({ repaired: 0, newer: false });
    expect(w.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
    expect(validateWorld(w)).toEqual([]);
    expect(JSON.stringify(Object.values(w.players).map((p) => [p.id, p.traits, p.lockedTraits, p.hid]))).toBe(orig);
    expect(Object.values(w.clubs).every((c) => c.youthFac === c.youthLevel && c.youthCoach === c.youthLevel)).toBe(true);

    // lenda migrada já com overall alto desperta as jogadas certas
    delete z.traits; delete z.lockedTraits;
    z.ovr = 75;
    migrateWorld(w, db as Database);
    expect(z.traits).toEqual(["FAL", "GAR"]);
    expect(z.lockedTraits).toEqual(["MAT"]);

    // save de uma versão mais nova
    w.version = 9;
    expect(migrateWorld(w, db as Database).newer).toBe(true);
    expect(w.version).toBe(9);
  });

  it("(b) conserta corrupção injetada", () => {
    const w = make(3);
    const fla = w.clubs.flamengo;
    const pal = w.clubs.palmeiras;
    const [a, b] = fla.players.map((id) => w.players[id]);
    fla.players.push(999_999); // id que não existe
    b.clubId = pal.id; // clubId trocado
    w.legends.pele = { appearances: [], active: a.id }; // lenda ativa apontando para quem não é lenda
    a.attrs.fin = 140;
    a.traits = ["XYZ" as TraitId, "MAT", "MAT"];
    a.hid = [0, 25, 10, 10, 10, 10] as unknown as Player["hid"];
    fla.lineup = { starters: [a.id, b.id, 123_456, null, null, null, null, null, null, null, null], bench: [b.id], captain: b.id };
    w.shortlist.push(888_888);
    w.nextPid = 5;
    expect(validateWorld(w).length).toBeGreaterThan(0);
    expect(repairWorld(w)).toBeGreaterThan(0);
    expect(validateWorld(w)).toEqual([]);
    expect(pal.players).toContain(b.id);
    expect(fla.players).not.toContain(b.id);
    expect(a.attrs.fin).toBe(99);
    expect(a.traits).toEqual(["MAT"]);
    expect(w.legends.pele.active).toBeUndefined();
    expect(fla.lineup.captain).toBeUndefined();
  });

  it("(c) save salvo e recarregado continua idêntico depois de 60 dias", () => {
    const w1 = make(21);
    const w2 = JSON.parse(JSON.stringify(w1)) as World;
    const run = (w: World) => {
      for (let i = 0; i < 100 && w.day < 60; i++) {
        const r = advance(w);
        if (r.reason === "match" && r.fixture) {
          loadRng(w);
          const res = simulateFixture(w, r.fixture);
          saveRng(w);
          finishUserMatch(w, r.fixture, res);
        }
      }
      return hashString(JSON.stringify(w));
    };
    expect(run(w1)).toBe(run(w2));
    expect(w1.day).toBeGreaterThanOrEqual(60);
    expect(validateWorld(w1)).toEqual([]);
  });
});

describe("fundação: utilitários", () => {
  it("withWorldRng usa e salva o gerador do mundo", () => {
    const w = make(4);
    const before = w.rng;
    setRngState(1);
    const v = withWorldRng(w, () => rand());
    expect(w.rng).not.toBe(before);
    setRngState(before);
    expect(rand()).toBe(v);
  });

  it("reconhece clássicos e jogos grandes", () => {
    const w = make(4);
    expect(isClassico(w, "gremio", "internacional")).toBe(true);
    expect(isClassico(w, "flamengo", "fluminense")).toBe(w.clubs.fluminense.rep >= 70 && w.clubs.flamengo.rep >= 70);
    expect(isClassico(w, "flamengo", "gremio")).toBe(false);
    const f = { id: 1, comp: "copaBR", stage: "sf", round: 1, day: 1, home: "flamengo", away: "gremio" };
    expect(isBigMatch(w, f)).toBe(true);
    expect(isBigMatch(w, { ...f, comp: "serieA", stage: "league" })).toBe(false);
  });
});
