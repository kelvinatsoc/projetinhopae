import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import {
  analyzeMatch, analyzeSquad, applyAdvice, applyTip, cloneForMatch, dismissTip, estimateOdds, liveTips, predictAiTactic,
  type LiveTip, type TacticPlan,
} from "../src/engine/assistant";
import { nextFixture } from "../src/engine/competitions";
import { autoLineup, clubStrength } from "../src/engine/lineup";
import { MatchSim } from "../src/engine/match";
import { FORMATIONS } from "../src/engine/positions";
import { getRngState, rand, setRngState } from "../src/engine/rng";
import type { Fixture, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 2024 });

/** Mundo leve que reaproveita o mesmo banco de jogadores, só trocando o clube do usuário. */
function as(clubId: string): World {
  return { ...base, userClubId: clubId };
}

function fixtureOf(w: World, home: string, away: string, id = 990001): Fixture {
  return { id, comp: "serieA", stage: "league", round: 1, day: w.day, home, away };
}

/** Tudo que o assistente não pode mexer: estado de jogadores, táticas, escalações e RNG. */
function snapshot(w: World) {
  const players = Object.values(w.players).map((p) => [p.id, p.cond, p.morale, p.injury, p.injuryName ?? "", p.clubId].join(":")).join("|");
  const clubs = Object.values(w.clubs).map((c) => JSON.stringify([c.id, c.tactic, c.lineup ?? null, c.players.length])).join("|");
  return { rng: w.rng, global: getRngState(), players, clubs, fixtures: w.fixtures.length, results: w.fixtures.filter((f) => f.result).length };
}

// clubes da Série A do mundo de teste, do mais forte para o mais fraco
const serieA = Object.values(base.clubs).filter((c) => c.div === "A").sort((a, b) => clubStrength(base, b) - clubStrength(base, a));
const strong = serieA.slice(0, 3).map((c) => c.id);
const weak = serieA.slice(-3).map((c) => c.id);

describe("auxiliar técnico: não altera o jogo", () => {
  it("analyzeMatch e estimateOdds não mexem no mundo nem no RNG", async () => {
    const w = base;
    const f = nextFixture(w, w.userClubId)!;
    expect(f).toBeTruthy();
    setRngState(w.rng);
    const before = snapshot(w);
    const a = analyzeMatch(w, f);
    expect(FORMATIONS[a.plan.formation]).toBeTruthy();
    expect(a.plan.mentality).toBeGreaterThanOrEqual(-2);
    expect(a.plan.mentality).toBeLessThanOrEqual(2);
    expect(a.opp.stars.length).toBe(3);
    expect(snapshot(w)).toEqual(before);

    // o RNG global volta ao estado de fora já no primeiro bloco (antes do primeiro await)
    const pending = estimateOdds(w, f, a.plan, 120);
    expect(getRngState()).toBe(before.global);
    // alguém usa o RNG enquanto a estimativa espera: a estimativa não pode interferir nem sofrer interferência
    rand();
    const midState = getRngState();
    const odds = await pending;
    expect(getRngState()).toBe(midState);
    setRngState(before.global);
    expect(snapshot(w)).toEqual(before);
    expect(odds.n).toBe(120);
    expect(odds.win + odds.draw + odds.loss).toBeCloseTo(1, 6);

    // mesma partida, mesma tática = mesmo resultado (semente fixa por chamada)
    const again = await estimateOdds(w, f, a.plan, 120);
    expect(again).toEqual(odds);
    expect(snapshot(w)).toEqual(before);
  });

  it("analyzeSquad e o modelo ao vivo também são puros", () => {
    const w = as(weak[0]);
    const before = snapshot(w);
    const s = analyzeSquad(w);
    expect(s.formations.length).toBe(Object.keys(FORMATIONS).length);
    expect(snapshot(w)).toEqual(before);
  });

  it("applyAdvice grava formação, mentalidade, pressão e uma escalação válida", () => {
    const w = structuredClone(as(strong[1])) as World;
    const club = w.clubs[w.userClubId];
    const opp = weak[1];
    const a = analyzeMatch(w, fixtureOf(w, club.id, opp));
    applyAdvice(w, club, a.plan, "serieA");
    expect(club.tactic.formation).toBe(a.plan.formation);
    expect(club.tactic.mentality).toBe(a.plan.mentality);
    expect(club.tactic.pressing).toBe(a.plan.pressing);
    const starters = club.lineup!.starters.filter((x): x is number => x != null);
    expect(starters.length).toBe(11);
    expect(new Set(starters).size).toBe(11);
    for (const id of starters) expect(w.players[id].clubId).toBe(club.id);
    for (const id of club.lineup!.bench) expect(starters.includes(id)).toBe(false);
  });
});

describe("auxiliar técnico: as sugestões ajudam a ganhar", () => {
  /** Tática que a IA usaria no lugar do usuário (formação do clube + regra de aiTactics + autoLineup). */
  function aiLike(w: World, f: Fixture): TacticPlan {
    const user = w.clubs[w.userClubId];
    const oppId = f.home === user.id ? f.away : f.home;
    const t = predictAiTactic(w, user, w.clubs[oppId], w.clubs[oppId].tactic.formation, f.home === user.id);
    return { formation: user.tactic.formation, mentality: t.mentality, pressing: t.pressing, lineup: autoLineup(w, user, f.comp) };
  }

  async function compare(pairs: [string, string, boolean][]) {
    let rec = 0, def = 0;
    for (const [u, o, home] of pairs) {
      const w = as(u);
      const f = fixtureOf(w, home ? u : o, home ? o : u);
      const a = analyzeMatch(w, f);
      rec += (await estimateOdds(w, f, a.plan, 300)).pts;
      def += (await estimateOdds(w, f, aiLike(w, f), 300)).pts;
    }
    return { rec: rec / pairs.length, def: def / pairs.length };
  }

  it("time fraco contra time forte (fora de casa)", async () => {
    const r = await compare(weak.map((u, i) => [u, strong[i], false] as [string, string, boolean]));
    console.log(`fraco x forte: sugestão ${r.rec.toFixed(3)} pts/jogo, tática da IA ${r.def.toFixed(3)}`);
    expect(r.rec).toBeGreaterThanOrEqual(r.def - 0.02);
  }, 30000);

  it("time forte contra time fraco (em casa)", async () => {
    const r = await compare(strong.map((u, i) => [u, weak[i], true] as [string, string, boolean]));
    console.log(`forte x fraco: sugestão ${r.rec.toFixed(3)} pts/jogo, tática da IA ${r.def.toFixed(3)}`);
    expect(r.rec).toBeGreaterThanOrEqual(r.def - 0.02);
  }, 30000);
});

describe("auxiliar técnico: dicas ao vivo", () => {
  function checkTip(sim: MatchSim, side: 0 | 1, tip: LiveTip) {
    const S = sim.sides[side];
    expect(tip.id).toBeTruthy();
    expect(tip.title).toBeTruthy();
    expect(tip.actions.length + (tip.id === "ht" ? 1 : 0)).toBeGreaterThan(0);
    const ins = new Set<number>(), outs = new Set<number>();
    let subs = 0;
    for (const a of tip.actions) {
      if (a.kind === "mentality") {
        expect(a.value).toBeGreaterThanOrEqual(-2);
        expect(a.value).toBeLessThanOrEqual(2);
        expect(a.value).not.toBe(S.mentality);
      } else if (a.kind === "pressing") {
        expect(a.value).toBeGreaterThanOrEqual(0);
        expect(a.value).toBeLessThanOrEqual(2);
      } else {
        subs++;
        expect(S.onPitch).toContain(a.outId);
        expect(S.bench).toContain(a.inId);
        expect(ins.has(a.inId!) || outs.has(a.outId!)).toBe(false);
        ins.add(a.inId!);
        outs.add(a.outId!);
        if (a.toSlot != null) expect(S.onPitch[a.toSlot]).toBeNull();
      }
    }
    expect(subs).toBeLessThanOrEqual(S.subsLeft);
  }

  function checkSim(sim: MatchSim, side: 0 | 1) {
    const S = sim.sides[side];
    const on = S.onPitch.filter((x): x is number => x != null);
    expect(new Set(on).size).toBe(on.length);
    for (const b of S.bench) expect(on.includes(b)).toBe(false);
    expect(S.subsLeft).toBeGreaterThanOrEqual(0);
    expect(S.windowsLeft).toBeGreaterThanOrEqual(0);
    expect(S.mentality).toBeGreaterThanOrEqual(-2);
    expect(S.mentality).toBeLessThanOrEqual(2);
  }

  it("dicas têm ações válidas e não se repetem depois de dispensadas", () => {
    const pairs: [string, string][] = [[weak[0], strong[0]], [strong[1], weak[1]], [serieA[8].id, serieA[10].id]];
    const kinds = new Set<string>();
    const ids = new Set<string>();
    let total = 0;
    const outer = getRngState();
    pairs.forEach(([u, o], pi) => {
      for (let g = 0; g < 6; g++) {
        const w = as(u);
        const home = g % 2 === 0;
        const b = cloneForMatch(w, fixtureOf(w, home ? u : o, home ? o : u));
        const side = b.userSide;
        setRngState(1000 + pi * 31 + g);
        const sim = new MatchSim(b.mini, b.fx, { live: true, userSide: side });
        const dismissed = new Set<string>();
        let guard = 0;
        while (!sim.finished && guard++ < 200) {
          sim.step();
          const tips = liveTips(sim, side);
          expect(tips.length).toBeLessThanOrEqual(2);
          for (const tip of tips) {
            expect(dismissed.has(tip.id)).toBe(false);
            checkTip(sim, side, tip);
            total++;
            ids.add(tip.id.split(":")[0]);
            for (const a of tip.actions) kinds.add(a.kind);
          }
          // metade das vezes segue a dica, na outra metade dispensa
          const tip = tips[0];
          if (tip) {
            if ((guard + g) % 2 === 0) applyTip(sim, side, tip);
            else dismissTip(sim, tip.id);
            dismissed.add(tip.id);
          }
          checkSim(sim, side);
        }
      }
    });
    setRngState(outer);
    console.log(`dicas geradas: ${total}; tipos: ${[...ids].join(", ")}; ações: ${[...kinds].join(", ")}`);
    expect(total).toBeGreaterThan(10);
    expect(kinds.has("mentality")).toBe(true);
    expect(kinds.has("sub")).toBe(true);
  });

  it("com um a menos, sugere fechar o buraco na defesa", () => {
    const w = as(serieA[5].id);
    const b = cloneForMatch(w, fixtureOf(w, serieA[5].id, serieA[6].id));
    setRngState(77);
    const sim = new MatchSim(b.mini, b.fx, { live: true, userSide: 0 });
    while (sim.minute < 30) sim.step();
    const S = sim.sides[0];
    const k = S.slots.indexOf("ZAG");
    const sent = S.onPitch[k]!;
    S.onPitch[k] = null;
    sim.events.push({ min: sim.minute, type: "red", side: 0, pid: sent, text: "expulso (teste)" });
    sim.recompute();
    const tips = liveTips(sim, 0);
    const red = tips.find((t) => t.id.startsWith("red:"));
    expect(red).toBeTruthy();
    checkTip(sim, 0, red!);
    // a troca só é sugerida quando a simulação mostra ganho; se vier, entra na posição vazia
    const fix = red!.actions.find((a) => a.kind === "sub");
    applyTip(sim, 0, red!);
    if (fix) {
      expect(fix.toSlot).toBe(k);
      expect(S.onPitch[k]).toBe(fix.inId);
      expect(S.onPitch.includes(fix.outId!)).toBe(false);
    } else {
      expect(red!.actions.some((a) => a.kind === "mentality")).toBe(true);
    }
    expect(S.onPitch.filter((x) => x == null).length).toBe(1);
    expect(liveTips(sim, 0).some((t) => t.id === red!.id)).toBe(false);
  });

  it("perdendo no 2º tempo, manda o time para frente", () => {
    const w = as(serieA[9].id);
    const b = cloneForMatch(w, fixtureOf(w, serieA[9].id, serieA[7].id));
    setRngState(91);
    const sim = new MatchSim(b.mini, b.fx, { live: true, userSide: 0 });
    while (!(sim.half === 2 && sim.minute >= 66)) sim.step();
    sim.sides[1].goals = sim.sides[0].goals + 1;
    sim.setMentality(0, 0);
    const chase = liveTips(sim, 0).find((t) => t.id.startsWith("chase:"));
    expect(chase).toBeTruthy();
    const m = chase!.actions.find((a) => a.kind === "mentality");
    expect(m && m.value! > 0).toBe(true);
  });
});
