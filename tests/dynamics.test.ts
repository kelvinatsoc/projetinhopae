import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { affinity, ensureLinks, growLinks, linkMult, linkOf, onLeaveLinks, pairKey, teamLinkAvg } from "../src/engine/chemistry";
import { expectedRating, streakOf, trendOf } from "../src/engine/form";
import { validLineup } from "../src/engine/lineup";
import { MatchSim } from "../src/engine/match";
import { FORMATIONS } from "../src/engine/positions";
import { getRngState, setRngState } from "../src/engine/rng";
import {
  applyPreset, DEFAULT_TI, famMult, familiarityOf, growFamiliarity, instructionFx, NEUTRAL_FX, onFormationChange, plannedMentality,
  PRESETS, ROLES, roleStars, rolesFor,
} from "../src/engine/tactics";
import { formDevelopment, potentialGrowth } from "../src/engine/training";
import type { Fixture, Player, World } from "../src/engine/types";
import { createWorld, migrateWorld, type Database } from "../src/engine/world";

const base = createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 42 });
const fx = (home: string, away: string, id: number): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: 20, home, away });
const clone = () => structuredClone(base) as World;
const squad = (w: World, club = "flamengo") => w.clubs[club].players.map((id) => w.players[id]).filter((p) => p && !p.youth);

/** Joga o mesmo confronto n vezes (estado restaurado a cada jogo) e soma as estatísticas do usuário (lado 0). */
function series(w: World, n: number, seed: number) {
  const snap = Object.values(w.players).map((p) => [p, p.cond, p.injury, p.morale] as const);
  const outer = getRngState();
  setRngState(seed);
  let shots = 0, shotsA = 0, gf = 0, ga = 0, pts = 0;
  for (let i = 0; i < n; i++) {
    const sim = new MatchSim(w, fx("flamengo", "palmeiras", 900000 + i));
    sim.runToEnd();
    shots += sim.stats.shots[0]; shotsA += sim.stats.shots[1];
    gf += sim.sides[0].goals; ga += sim.sides[1].goals;
    pts += sim.sides[0].goals > sim.sides[1].goals ? 3 : sim.sides[0].goals === sim.sides[1].goals ? 1 : 0;
    for (const [p, c, inj, m] of snap) { p.cond = c; p.injury = inj; p.morale = m; }
  }
  setRngState(outer);
  return { shots: shots / n, shotsA: shotsA / n, gf: gf / n, ga: ga / n, ppg: pts / n };
}

describe("tática a fundo", () => {
  it("instruções padrão são neutras e cada instrução é uma troca", () => {
    const w = clone();
    const club = w.clubs.flamengo;
    const slots = FORMATIONS[club.tactic.formation].map((s) => s.pos);
    const ids = validLineup(w, club).starters;
    expect(instructionFx(w, { ...club.tactic, ti: { ...DEFAULT_TI } }, slots, ids)).toEqual(NEUTRAL_FX);
    const hi = instructionFx(w, { ...club.tactic, ti: { line: 2 } }, slots, ids);
    expect(hi.mid).toBeGreaterThan(1);
    expect(hi.def).toBeLessThan(1);
    expect(hi.xgAgainst).toBeGreaterThan(1);
    const fast = instructionFx(w, { ...club.tactic, ti: { tempo: 2 } }, slots, ids);
    expect(fast.open).toBeGreaterThan(1);
    expect(fast.fatigue).toBeGreaterThan(1);
    // cera só vale vencendo na reta final
    expect(instructionFx(w, { ...club.tactic, ti: { waste: true } }, slots, ids, 1, 50)).toEqual(NEUTRAL_FX);
    expect(instructionFx(w, { ...club.tactic, ti: { waste: true } }, slots, ids, 1, 80).open).toBeLessThan(1);
    // nenhum multiplicador passa de ±10%
    for (const pr of PRESETS) {
      const f = instructionFx(w, { ...club.tactic, ti: pr.ti }, slots, ids);
      for (const v of [f.att, f.mid, f.def, f.open, f.xg, f.xgAgainst]) { expect(v).toBeGreaterThan(0.9); expect(v).toBeLessThan(1.1); }
    }
  });

  it("aptidão por função: estrelas seguem o perfil do jogador", () => {
    const w = clone();
    const zag = squad(w).find((p) => p.pos === "ZAG")!;
    const builder = structuredClone(zag) as Player;
    builder.attrs.pas = Math.min(99, zag.attrs.def + 10);
    const stopper = structuredClone(zag) as Player;
    stopper.attrs.pas = Math.max(20, zag.attrs.def - 30);
    expect(roleStars(builder, ROLES.cons)).toBeGreaterThan(roleStars(stopper, ROLES.cons));
    for (const pos of ["GOL", "ZAG", "LD", "VOL", "MC", "MEI", "PD", "ATA"] as const) expect(rolesFor(pos).length).toBeGreaterThanOrEqual(2);
    expect(roleStars(zag, ROLES.zag)).toBeGreaterThanOrEqual(1);
    expect(roleStars(zag, ROLES.zag)).toBeLessThanOrEqual(5);
  });

  it("modelos prontos usam funções válidas para cada slot e mudam o jogo sem desequilibrar", () => {
    for (const pr of PRESETS) {
      // referência: mesma formação, mentalidade e marcação, sem instruções nem funções (efeito só do que é novo)
      const ref = clone();
      Object.assign(ref.clubs.flamengo.tactic, { formation: pr.formation, mentality: pr.mentality, pressing: pr.pressing });
      delete ref.clubs.flamengo.lineup;
      const neutral = series(ref, 80, 31);
      const w = clone();
      const club = w.clubs.flamengo;
      club.tactic.formation = pr.formation;
      delete club.lineup;
      applyPreset(club, pr, FORMATIONS[pr.formation]);
      FORMATIONS[pr.formation].forEach((s, k) => {
        const r = club.tactic.roles![k];
        if (r) expect(ROLES[r as keyof typeof ROLES].pos).toContain(s.pos);
      });
      const s = series(w, 80, 31);
      console.log(`${pr.label}: chutes ${s.shots.toFixed(1)}/${s.shotsA.toFixed(1)} gols ${s.gf.toFixed(2)}x${s.ga.toFixed(2)} pts/j ${s.ppg.toFixed(2)} (neutro ${neutral.shots.toFixed(1)}/${neutral.shotsA.toFixed(1)} ${neutral.gf.toFixed(2)}x${neutral.ga.toFixed(2)} ${neutral.ppg.toFixed(2)})`);
      expect(Math.abs(s.gf + s.ga - (neutral.gf + neutral.ga))).toBeLessThan(1.2);
      expect(Math.abs(s.ppg - neutral.ppg)).toBeLessThan(0.5);
    }
  }, 120000);

  it("ritmo acelerado gera mais finalizações (para os dois lados) do que o cadenciado", () => {
    const fast = clone();
    fast.clubs.flamengo.tactic.ti = { tempo: 2 };
    const slow = clone();
    slow.clubs.flamengo.tactic.ti = { tempo: 0 };
    const a = series(fast, 80, 5), b = series(slow, 80, 5);
    expect(a.shots + a.shotsA).toBeGreaterThan(b.shots + b.shotsA);
  }, 60000);

  it("mudança de mentalidade programada vale só no placar e minuto certos", () => {
    const t = { formation: "4-3-3", mentality: 0, pressing: 1, shift: { lead: -1, leadMin: 75, trail: 2, trailMin: 70 } };
    expect(plannedMentality(t, 0, 1, 60)).toBe(0);
    expect(plannedMentality(t, 0, 1, 80)).toBe(-1);
    expect(plannedMentality(t, 0, -1, 71)).toBe(2);
    expect(plannedMentality(t, 0, 0, 89)).toBe(0);
  });

  it("familiaridade cresce jogando/treinando e sistema novo começa baixo", () => {
    const w = clone();
    const club = w.clubs.flamengo;
    expect(familiarityOf(w, club)).toBe(70);
    onFormationChange(club, "3-5-2");
    club.tactic.formation = "3-5-2";
    expect(familiarityOf(w, club)).toBe(40);
    expect(famMult(40)).toBeLessThan(1);
    for (let i = 0; i < 10; i++) growFamiliarity(club, 2.5);
    expect(familiarityOf(w, club)).toBeGreaterThan(50);
    expect(familiarityOf(w, w.clubs.palmeiras)).toBe(70); // IA é sempre neutra
  });
});

describe("entrosamento entre jogadores", () => {
  it("cresce com jogos juntos; rodízio demais cresce mais devagar", () => {
    const w = clone();
    const club = w.clubs.flamengo;
    const ps = squad(w);
    const xi = ps.slice(0, 11).map((p) => p.id);
    const k = pairKey(xi[0], xi[1]);
    const before = club.links![k] ?? 0;
    growLinks(w, club, xi, xi);
    const stable = club.links![k] - before;
    expect(stable).toBeGreaterThan(0);
    // time todo trocado: o par que volta a jogar junto cresce menos
    const w2 = clone();
    const c2 = w2.clubs.flamengo;
    c2.lastXI = ps.slice(11, 22).map((p) => p.id);
    const b2 = c2.links![k] ?? 0;
    growLinks(w2, c2, xi, xi);
    expect(c2.links![k] - b2).toBeLessThan(stable);
  });

  it("afinidades: mesma nacionalidade/idioma somam; contratação nova começa baixo", () => {
    const w = clone();
    const club = w.clubs.flamengo;
    const [a, b] = squad(w);
    const c = structuredClone(b) as Player;
    c.nat = a.nat;
    const d = structuredClone(b) as Player;
    d.nat = a.nat === "JPN" ? "KOR" : "JPN";
    expect(affinity(w, a, c)).toBeGreaterThan(affinity(w, a, d));
    // contratado agora: sem histórico de pares
    const signing = structuredClone(b) as Player;
    signing.id = 99999999;
    signing.joined = w.season;
    expect(linkOf(w, club, a, signing)).toBeLessThan(linkOf(w, club, a, b));
  });

  it("sem pares registrados (IA) é neutro; o efeito no jogo é modesto", () => {
    const w = clone();
    expect(teamLinkAvg(w, w.clubs.palmeiras, validLineup(w, w.clubs.palmeiras).starters)).toBe(50);
    expect(linkMult(100)).toBeLessThanOrEqual(1.025);
    expect(linkMult(0)).toBeGreaterThanOrEqual(0.975);
  });

  it("vender peça-chave do entrosamento derruba o entrosamento do time", () => {
    const w = clone();
    const club = w.clubs.flamengo;
    const ps = squad(w);
    const key = ps[0];
    for (const q of ps.slice(1, 10)) club.links![pairKey(key.id, q.id)] = 50;
    club.chem = 70;
    const hit = onLeaveLinks(w, club, key);
    expect(hit).toBeGreaterThan(0);
    expect(club.chem).toBeLessThan(70);
    expect(Object.keys(club.links!).some((k) => k.split("-").map(Number).includes(key.id))).toBe(false);
  });
});

describe("evolução pela forma", () => {
  const mk = (w: World, ageY: number, ratings: number[]): Player => {
    const p = structuredClone(squad(w).find((x) => x.pos === "MC")!) as Player;
    p.born = w.season - ageY;
    p.youth = false;
    p.injury = 0;
    p.ma = ratings.length;
    p.mr = ratings.reduce((s, r) => s + r, 0);
    p.form = ratings.slice(-5);
    return p;
  };

  it("boas notas aceleram (mais nos jovens), notas ruins e banco travam", () => {
    const w = clone();
    const good = (a: number) => { const p = mk(w, a, []); const r = expectedRating(p) + 0.8; return formDevelopment(mk(w, a, [r, r, r, r]), a).delta; };
    const bad = (a: number) => { const p = mk(w, a, []); const r = expectedRating(p) - 0.8; return formDevelopment(mk(w, a, [r, r, r, r]), a).delta; };
    expect(good(19)).toBeGreaterThan(good(30));
    expect(good(19)).toBeGreaterThan(0);
    expect(bad(19)).toBeLessThan(0);
    const benched = mk(w, 24, []);
    benched.ma = 0;
    expect(formDevelopment(benched, 24).delta).toBeLessThan(0);
  });

  it("fase espetacular perto do teto sobe o potencial; fase comum não", () => {
    const w = clone();
    const star = mk(w, 22, []);
    star.pot = star.ovr + 1;
    star.ma = 4;
    let ups = 0;
    for (let m = 0; m < 8; m++) if (potentialGrowth(star, 22, 1.0)) ups++;
    expect(ups).toBeGreaterThanOrEqual(2);
    const normal = mk(w, 22, []);
    normal.pot = normal.ovr + 1;
    normal.ma = 4;
    const pot0 = normal.pot;
    for (let m = 0; m < 8; m++) potentialGrowth(normal, 22, 0.3);
    expect(normal.pot).toBe(pot0);
  });

  it("curva de idade preservada: veterano em boa fase cai mais devagar, mas não vira jovem", () => {
    const w = clone();
    const vet = mk(w, 33, []);
    const r = expectedRating(vet) + 0.8;
    const d = formDevelopment(mk(w, 33, [r, r, r, r]), 33).delta;
    // média mensal da idade (devParams −1,3 por meia temporada ÷ 5,5) continua maior que o ganho pela forma
    expect(d).toBeLessThan(1.3 / 5.5);
  });

  it("sequência em alta/baixa e seta de evolução", () => {
    const w = clone();
    const p = mk(w, 23, []);
    const e = expectedRating(p);
    p.form = [e + 1, e + 1, e + 1];
    expect(streakOf(p)).toBe("hot");
    expect(trendOf(p)).toBe("up");
    p.form = [e - 1, e - 1, e - 1];
    expect(streakOf(p)).toBe("cold");
  });
});

describe("saves antigos", () => {
  it("migrateWorld cria os pares e limpa funções inválidas", () => {
    const w = clone();
    delete w.clubs.flamengo.links;
    w.clubs.flamengo.tactic.roles = ["xyz", "cons", null];
    w.clubs.flamengo.tactic.ti = { line: 7 };
    w.clubs.palmeiras.links = { "1-2": 3 };
    migrateWorld(w, db as Database);
    expect(w.clubs.flamengo.links).toBeDefined();
    expect(Object.keys(w.clubs.flamengo.links!).length).toBeGreaterThan(50);
    expect(w.clubs.flamengo.tactic.roles).toEqual([null, "cons", null]);
    expect(w.clubs.flamengo.tactic.ti!.line).toBe(1);
    expect(w.clubs.palmeiras.links).toBeUndefined();
    ensureLinks(w, w.clubs.flamengo); // idempotente
  });
});
