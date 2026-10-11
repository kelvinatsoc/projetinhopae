// Entrosamento, clima do grupo e torcida: precisam mudar de forma visível a cada jogo do usuário.
// Antes: o entrosamento do time subia sempre +0,5 por jogo (fixo, sem olhar escalação nem resultado),
// a moral cravava em ~100 e a torcida de um save novo ficava parada em 60.
import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { linkOf, teamLinkAvg } from "../src/engine/chemistry";
import { afterUserMatch, chemMatchDelta, chemOf, dynDelta, monthlyMood, moraleDelta, squadMood } from "../src/engine/dressing";
import { advance, finishUserMatch, loadRng, saveRng } from "../src/engine/game";
import { squadOf, validLineup } from "../src/engine/lineup";
import { simulateFixture } from "../src/engine/match";
import { fanMood } from "../src/engine/narrative";
import { completeTransfer } from "../src/engine/transfers";
import type { Fixture, MatchResult, Player, World } from "../src/engine/types";
import { createWorld, migrateDynamics, type Database } from "../src/engine/world";

const base = createWorld(db as Database, { managerName: "T", clubId: "bahia", seed: 7 });
const clone = () => structuredClone(base) as World;
const fx = (w: World, id = 1): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: 30, home: w.userClubId, away: "palmeiras" });

/** Resultado sintético do usuário (mandante) com a mesma nota para todos os titulares. */
function result(w: World, xi: number[], hg: number, ag: number, rating: number, subs: number[] = []): MatchResult {
  const ratings: Record<number, number> = {};
  for (const id of [...xi, ...subs]) ratings[id] = rating;
  const opp = squadOf(w, w.clubs.palmeiras).slice(0, 11).map((p) => p.id);
  return { hg, ag, events: [], ratings, lineups: [[...xi, ...subs], opp] } as unknown as MatchResult;
}

const xiOf = (w: World) => validLineup(w, w.clubs[w.userClubId]).starters.filter((x): x is number => x != null);
/** Titulares e um XI alternativo (só reservas), para simular rodízio total. */
function lineups(w: World) {
  const xi = xiOf(w);
  const others = squadOf(w, w.clubs[w.userClubId]).filter((p) => !xi.includes(p.id) && p.injury === 0).map((p) => p.id).slice(0, 11);
  return { xi, others };
}
const neutral = (w: World) => {
  const c = w.clubs[w.userClubId];
  c.chem = 70;
  delete c.lastXI;
  for (const p of squadOf(w, c)) { p.morale = 70; p.injury = 0; p.bans = {}; p.promise = undefined; p.role = "R"; }
  return c;
};

describe("entrosamento do time: muda rodada a rodada", () => {
  it("a mesma base jogando e vencendo sobe alguns pontos por jogo", () => {
    const w = clone();
    const c = neutral(w);
    const { xi } = lineups(w);
    const seen = [chemOf(w, c)];
    for (let i = 0; i < 5; i++) { afterUserMatch(w, fx(w), result(w, xi, 2, 0, 7.2), 0); seen.push(chemOf(w, c)); }
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(1.5);
    expect(seen[5] - seen[0]).toBeGreaterThanOrEqual(10);
  });

  it("rodízio grande derruba; base fixa sobe (mesmos resultados)", () => {
    const stable = clone(), rot = clone();
    neutral(stable); neutral(rot);
    const a = lineups(stable), b = lineups(rot);
    for (let i = 0; i < 6; i++) {
      afterUserMatch(stable, fx(stable), result(stable, a.xi, 1, 0, 6.8), 0);
      afterUserMatch(rot, fx(rot), result(rot, i % 2 ? b.others : b.xi, 1, 0, 6.8), 0);
    }
    expect(chemOf(stable, stable.clubs.bahia)).toBeGreaterThan(80);
    expect(chemOf(rot, rot.clubs.bahia)).toBeLessThan(70);
  });

  it("derrotas e atuações ruins tiram pontos visíveis", () => {
    const w = clone();
    const c = neutral(w);
    const { xi } = lineups(w);
    afterUserMatch(w, fx(w), result(w, xi, 0, 0, 6.5), 0); // registra o XI
    let prev = chemOf(w, c);
    for (let i = 0; i < 3; i++) {
      afterUserMatch(w, fx(w), result(w, xi, 0, 3, 5.6), 0);
      expect(prev - chemOf(w, c)).toBeGreaterThanOrEqual(2);
      prev = chemOf(w, c);
    }
  });

  it("nada fica cravado no teto: perto de 100 ainda cai com derrota", () => {
    expect(chemMatchDelta({ chem: 100, kept: 11, n: 11, res: 1, margin: 3, rating: 7.5, links: 60 })).toBeLessThanOrEqual(0);
    expect(chemMatchDelta({ chem: 95, kept: 11, n: 11, res: -1, margin: -2, rating: 5.8, links: 50 })).toBeLessThanOrEqual(-2.5);
    // reforços estreantes (pares novos em campo) rendem menos que a base entrosada
    const x = { chem: 70, kept: 11, n: 11, res: 0, margin: 0, rating: 6.5 };
    expect(chemMatchDelta({ ...x, links: 30 })).toBeLessThan(chemMatchDelta({ ...x, links: 55 }) - 2);
  });

  it("pares que jogam juntos ganham química (1,5+ por jogo para a dupla titular)", () => {
    const w = clone();
    const c = neutral(w);
    const { xi } = lineups(w);
    const [a, b] = [w.players[xi[0]], w.players[xi[1]]];
    afterUserMatch(w, fx(w), result(w, xi, 1, 1, 6.5), 0);
    const pair0 = linkOf(w, c, a, b), team0 = teamLinkAvg(w, c, xi);
    for (let i = 0; i < 3; i++) afterUserMatch(w, fx(w), result(w, xi, 1, 1, 6.5), 0);
    expect(linkOf(w, c, a, b) - pair0).toBeGreaterThanOrEqual(4.5);
    expect(teamLinkAvg(w, c, xi) - team0).toBeGreaterThanOrEqual(3);
  });

  it("contratação nova derruba o entrosamento e entra com pares fracos", () => {
    const w = clone();
    const c = neutral(w);
    const { xi } = lineups(w);
    for (let i = 0; i < 3; i++) afterUserMatch(w, fx(w), result(w, xi, 1, 0, 6.8), 0);
    const before = chemOf(w, c);
    const signing = Object.values(w.players).find((p) => !p.clubId && p.pos === w.players[xi[10]].pos) as Player;
    completeTransfer(w, signing, c, 0, signing.wage || 10_000, 2);
    expect(chemOf(w, c)).toBe(before - 4);
    const xi2 = [...xi.slice(0, 10), signing.id];
    expect(teamLinkAvg(w, c, xi2)).toBeLessThan(teamLinkAvg(w, c, xi));
  });

  it("treino com foco Tático soma mais entrosamento no mês", () => {
    const a = clone(), b = clone();
    neutral(a); neutral(b);
    b.clubs.bahia.train = { focus: "tat", int: 1 };
    monthlyMood(a); monthlyMood(b);
    expect(chemOf(b, b.clubs.bahia)).toBeGreaterThan(chemOf(a, a.clubs.bahia));
  });
});

describe("clima do grupo (moral)", () => {
  it("vitória anima quem jogou; banco de quem esperava jogar pesa; promessa pesa mais", () => {
    const w = clone();
    neutral(w);
    const { xi, others } = lineups(w);
    const [benchT, benchP, benchS] = others.map((id) => w.players[id]);
    benchT.role = "T";
    benchP.role = "T";
    benchP.promise = { until: 9999, base: [0, 0] };
    benchS.role = "S";
    afterUserMatch(w, fx(w), result(w, xi, 2, 0, 7), 0);
    expect(w.players[xi[0]].morale).toBeGreaterThanOrEqual(75);
    expect(benchT.morale).toBeLessThan(70);
    expect(benchP.morale).toBeLessThan(benchT.morale);
    expect(benchS.morale).toBeGreaterThanOrEqual(70);
  });

  it("derrota derruba alguns pontos, mesmo com a moral alta", () => {
    const w = clone();
    const c = neutral(w);
    const { xi } = lineups(w);
    for (const p of squadOf(w, c)) p.morale = 98;
    const mood0 = squadMood(w, c);
    afterUserMatch(w, fx(w), result(w, xi, 0, 2, 5.8), 0);
    expect(w.players[xi[0]].morale).toBeLessThanOrEqual(90);
    expect(mood0 - squadMood(w, c)).toBeGreaterThanOrEqual(4);
    // e vitórias seguidas não cravam todo mundo em 100
    for (let i = 0; i < 15; i++) afterUserMatch(w, fx(w), result(w, xi, 2, 0, 7), 0);
    expect(w.players[xi[0]].morale).toBeLessThan(100);
  });
});

describe("partidas de verdade: os medidores do painel variam a cada jogo", () => {
  it("10 jogos do usuário: entrosamento, clima e torcida mudam e a setinha bate com a variação", () => {
    const w = clone();
    const c = w.clubs[w.userClubId];
    let n = 0, chemMoves = 0, moodMoves = 0, fanMoves = 0;
    for (let guard = 0; guard < 400 && n < 10; guard++) {
      const r = advance(w);
      if (r.reason !== "match" || !r.fixture) continue;
      const before = { chem: Math.round(chemOf(w, c)), mood: Math.round(squadMood(w, c)), fan: fanMood(w) };
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
      n++;
      const now = { chem: chemOf(w, c), mood: squadMood(w, c), fan: fanMood(w) };
      if (Math.round(now.chem) !== before.chem) chemMoves++;
      if (Math.round(now.mood) !== before.mood) moodMoves++;
      if (now.fan !== before.fan) fanMoves++;
      // a setinha do painel mostra exatamente a variação desde o último jogo
      expect(c.dprev).toBeDefined();
      expect(dynDelta(w, "chem", now.chem)).toBe(Math.round(now.chem) - before.chem);
      expect(dynDelta(w, "fan", now.fan)).toBe(now.fan - before.fan);
      const p = squadOf(w, c)[0];
      expect(moraleDelta(w, p)).toBe(p.morale - c.dprev!.m[p.id]);
    }
    expect(n).toBe(10);
    expect(chemMoves).toBeGreaterThanOrEqual(8);
    expect(moodMoves).toBeGreaterThanOrEqual(8);
    expect(fanMoves).toBeGreaterThanOrEqual(7);
  }, 60_000);
});

describe("saves antigos", () => {
  it("migração é idempotente e limpa referências inválidas", () => {
    const w = clone();
    const c = w.clubs[w.userClubId];
    delete c.dprev;
    migrateDynamics(w);
    expect(c.dprev).toBeUndefined(); // save antigo: sem setinha até o próximo jogo
    expect(dynDelta(w, "chem", 70)).toBeNull();
    c.dprev = { day: 1, chem: 70, mood: 70, fan: 60, board: 50, links: 40, m: {} };
    w.clubs.palmeiras.dprev = { ...c.dprev };
    migrateDynamics(w);
    const once = JSON.stringify(w);
    migrateDynamics(w);
    expect(JSON.stringify(w)).toBe(once);
    expect(c.dprev).toBeDefined();
    expect(w.clubs.palmeiras.dprev).toBeUndefined();
    (c as unknown as { dprev: unknown }).dprev = { chem: "x" };
    migrateDynamics(w);
    expect(c.dprev).toBeUndefined();
  });
});
