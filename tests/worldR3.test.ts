import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { progressCompetitions } from "../src/engine/competitions";
import { createClubWorldCup, cwcDays } from "../src/engine/continental";
import { advance, applyResult, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { createWorld, type Database } from "../src/engine/world";
import { fastFixture } from "../src/engine/worldLeagues";
import { intlDaily, simulateIntlDay } from "../src/engine/international";
import { acceptNtJob, eligible, ntJobTick, playNtMatch, toggleSquad } from "../src/engine/ntManager";
import { ensureCareer } from "../src/engine/career";
import type { Fixture, World } from "../src/engine/types";
import { makeWorldFixture } from "./fixtures/worldFixture";

export function playUntil(w: World, stop: (w: World) => boolean, maxSteps = 3000, step = 400) {
  for (let i = 0; i < maxSteps && !stop(w); i++) {
    const r = advance(w, step);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") {
      if (stop(w)) return;
      runEndOfSeason(w);
    }
  }
}

const dup = (fx: Fixture[]) => {
  const seen = new Set<string>(), out: string[] = [];
  for (const f of fx) for (const c of [f.home, f.away]) { const k = `${c}@${f.day}`; if (seen.has(k)) out.push(k); seen.add(k); }
  return out;
};

describe("mundo R3: ACL Elite e Intercontinental", () => {
  const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 21, world: makeWorldFixture() });
  playUntil(w, (x) => x.season === 2027 && x.day >= 352);

  it("a ACL Elite 2026/27 teve zonas Oeste e Leste e um campeão asiático", () => {
    const t = Object.values(w.clubs).flatMap((c) => c.trophies.map((x) => ({ ...x, c }))).filter((x) => x.comp === "acle");
    expect(t.length).toBeGreaterThan(0);
    expect(["ksa1", "jpn1"]).toContain(t[0].c.league);
  });

  it("a Intercontinental 2027 reúne os campeões da Libertadores e da Champions", () => {
    const ic = w.comps.intercontinental;
    expect(ic).toBeTruthy();
    expect(ic.teams).toContain(w.wl!.lastUcl);
    expect(ic.done).toBe(true);
    expect(dup(w.fixtures)).toEqual([]);
  });
});

describe("mundo R3: Mundial de Clubes", () => {
  it("32 clubes, 8 grupos, mata-mata e campeão (2029)", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 5, world: makeWorldFixture() });
    w.season = 2029;
    w.fixtures = [];
    w.comps = {};
    createClubWorldCup(w);
    const cwc = w.comps.cwc;
    expect(cwc.teams).toHaveLength(32);
    expect(cwc.groups).toHaveLength(8);
    const confs = cwc.teams.map((id) => w.clubs[id]);
    expect(confs.filter((c) => c.league && ["eng1", "esp1", "ita1", "ger1", "fra1", "por1", "ned1", "tur1", "sco1"].includes(c.league)).length).toBeGreaterThanOrEqual(12);
    expect(confs.some((c) => c.country === "BRA")).toBe(true);
    const d = cwcDays(2029);
    loadRng(w);
    for (let day = d.md[0]; day <= d.final; day++) {
      for (const f of w.fixtures) if (f.day === day && !f.result) applyResult(w, f, fastFixture(w, f));
      progressCompetitions(w);
    }
    saveRng(w);
    expect(cwc.done).toBe(true);
    expect(cwc.ties.filter((t) => t.stage === "r16")).toHaveLength(8);
    expect(dup(w.fixtures)).toEqual([]);
    expect(w.clubs[cwc.champion!].trophies.some((t) => t.comp === "cwc")).toBe(true);
  });
});

describe("mundo R3: começar num clube do exterior", () => {
  it("o usuário joga a temporada europeia inteira e a diretoria avalia pela liga", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "eng1-c1", seed: 33, world: makeWorldFixture() });
    expect(w.board.objectiveCode).toBe("W-title");
    playUntil(w, (x) => x.season === 2027 && x.day >= 200);
    const mine = w.fixtures.filter((f) => f.result && (f.home === "eng1-c1" || f.away === "eng1-c1"));
    expect(w.wl!.userLast?.comp).toBe("eng1");
    expect(w.managerHistory.some((h) => h.season === 2027 || h.season === 2026)).toBe(true);
    expect(mine.some((f) => f.comp === "eng1" && f.result!.stats.shots[0] > 0)).toBe(true);
    expect(w.clubs["eng1-c1"].finance.lastIncome?.tv ?? 0).toBeGreaterThan(0);
    expect(dup(w.fixtures)).toEqual([]);
  }, 120_000);
});

describe("mundo R3: técnico de seleção", () => {
  it("convite pela reputação, convocação escolhida e jogos que param o Continuar", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 12, world: makeWorldFixture() });
    ensureCareer(w).rep = 88;
    w.day = 31; // 1º de fevereiro
    loadRng(w);
    ntJobTick(w);
    saveRng(w);
    expect(w.intl!.offer?.nt).toBe("nt-BRA");
    expect(acceptNtJob(w)).toBe(true);
    expect(w.ntJob).toBe("nt-BRA");
    // troca um convocado: tira o primeiro e põe o 30º melhor
    const el = eligible(w, "nt-BRA");
    const out = w.intl!.userSquad![0];
    toggleSquad(w, out);
    const extra = el.find((p) => !w.intl!.userSquad!.includes(p.id) && p.id !== out)!;
    toggleSquad(w, extra.id);
    let stops = 0;
    for (let i = 0; i < 200 && stops < 2; i++) {
      const r = advance(w);
      if (r.reason === "ntMatch" && r.fixture) {
        stops++;
        expect(w.intl!.callups["nt-BRA"]).toContain(extra.id);
        expect(w.intl!.callups["nt-BRA"]).not.toContain(out);
        const res = playNtMatch(w, r.fixture, 1);
        expect(r.fixture.result).toBeTruthy();
        expect(res.hg + res.ag).toBeGreaterThanOrEqual(0);
      } else if (r.reason === "match" && r.fixture) {
        loadRng(w);
        const res = simulateFixture(w, r.fixture);
        saveRng(w);
        finishUserMatch(w, r.fixture, res);
      } else break;
    }
    expect(stops).toBe(2);
  }, 60_000);
});

describe("mundo R3: Euro e Copa América 2028 (+ eliminatórias da Euro em 2027)", () => {
  it("eliminatórias em 2027 e os dois torneios em junho/julho de 2028, com campeões", () => {
    const w = createWorld(db as Database, { managerName: "T", clubId: "flamengo", seed: 8, world: makeWorldFixture() });
    loadRng(w);
    for (const y of [2027, 2028]) {
      w.season = y;
      w.intl!.year = undefined;
      w.intl!.fixtures = w.intl!.fixtures.filter((f) => !f.result && w.intl!.comps[f.comp]?.carry);
      for (const id of Object.keys(w.intl!.comps)) if (!w.intl!.comps[id].carry) delete w.intl!.comps[id];
      for (let d = 1; d < 330; d++) { w.day = d; intlDaily(w); simulateIntlDay(w, d); }
      if (y === 2027) expect(w.intl!.comps["euroq-2028"]?.done).toBe(true);
    }
    saveRng(w);
    const euro = w.intl!.comps["euro-2028"], ca = w.intl!.comps["ca-2028"];
    expect(euro.done && ca.done).toBe(true);
    expect(euro.teams.every((id) => w.intl!.nts[id].confed === "UEFA")).toBe(true);
    expect(ca.teams).toHaveLength(16);
    expect(ca.teams.filter((id) => w.intl!.nts[id].confed === "CONMEBOL")).toHaveLength(10);
    expect(w.intl!.honors.map((h) => h.comp)).toEqual(expect.arrayContaining(["euro", "ca"]));
    expect(dup(w.intl!.fixtures)).toEqual([]);
    expect(Object.values(w.players).some((p) => p.away)).toBe(false);
  });
});
