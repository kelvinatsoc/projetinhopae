import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { LEGEND_BY_ID } from "../src/data/legends";
import { advance, finishUserMatch, loadRng, runEndOfSeason, saveRng } from "../src/engine/game";
import { squadOf } from "../src/engine/lineup";
import { simulateFixture } from "../src/engine/match";
import { developPlayerHalf, generatePlayer } from "../src/engine/player";
import { ovrAt } from "../src/engine/positions";
import { getRngState, setRngState } from "../src/engine/rng";
import { focusMods, midSeasonTick, monthlyDevelop, monthlyTraining, seasonEndDevelop, setTrainFocus, tacticalChemBonus } from "../src/engine/training";
import type { Player, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";
import { spawnLegend } from "../src/engine/youth";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function playSeason(w: World) {
  for (let i = 0; i < 400; i++) {
    const r = advance(w);
    if (r.reason === "match" && r.fixture) {
      loadRng(w);
      const res = simulateFixture(w, r.fixture);
      saveRng(w);
      finishUserMatch(w, r.fixture, res);
    } else if (r.reason === "seasonEnd") return;
  }
  throw new Error("temporada não terminou");
}

function driftStats(w: World) {
  const clubs = Object.values(w.clubs).filter((c) => c.div === "A");
  const tops = clubs.map((c) => {
    const s = squadOf(w, c).map((p) => p.ovr).sort((a, b) => b - a).slice(0, 16);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
  const u19 = Object.values(w.players).filter((p) => w.season - p.born < 19);
  return {
    top16: tops.reduce((a, b) => a + b, 0) / tops.length,
    u19: u19.reduce((s, p) => s + p.ovr, 0) / u19.length,
    n: Object.keys(w.players).length,
  };
}

describe("treino: evolução mensal", () => {
  it("equivale à evolução antiga (11 treinos ≈ 2 metades)", () => {
    const w = make(3);
    setRngState(12345);
    const base: Player[] = [];
    for (let i = 0; i < 400; i++) {
      const ageY = 17 + (i % 18);
      const p = generatePlayer(w, null, 50 + (i % 25), ageY);
      p.pot = Math.max(p.pot, p.ovr + (ageY <= 23 ? 12 : 3));
      base.push(clone(p));
    }
    const groups: Record<string, { m: number[]; l: number[] }> = { young: { m: [], l: [] }, old: { m: [], l: [] } };
    for (const b of base) {
      const ageY = w.season - b.born;
      const g = ageY <= 23 ? "young" : ageY >= 30 ? "old" : null;
      if (!g) continue;
      // mensal: 11 treinos com 2 jogos por mês
      let sumM = 0, sumL = 0;
      for (let rep = 0; rep < 6; rep++) {
        const m = clone(b);
        for (let t = 0; t < 11; t++) { m.ma = 2; monthlyDevelop(w, m); }
        sumM += m.ovr - b.ovr;
        // antiga: 2 metades com 11 jogos por metade (fator 1.05, como 2 jogos/mês)
        const l = clone(b);
        l.stats.apps = 11;
        developPlayerHalf(l, w.season, 2);
        developPlayerHalf(l, w.season, 2);
        sumL += l.ovr - b.ovr;
      }
      groups[g].m.push(sumM / 6);
      groups[g].l.push(sumL / 6);
    }
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const ym = mean(groups.young.m), yl = mean(groups.young.l), om = mean(groups.old.m), ol = mean(groups.old.l);
    console.log(`jovens: mensal ${ym.toFixed(2)} vs antiga ${yl.toFixed(2)} · veteranos: mensal ${om.toFixed(2)} vs antiga ${ol.toFixed(2)}`);
    expect(Math.abs(ym - yl) / Math.abs(yl)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(om - ol)).toBeLessThanOrEqual(0.6);
  });

  it("profissionalismo acelera a evolução", () => {
    const w = make(4);
    const p = generatePlayer(w, null, 55, 18);
    p.pot = 85;
    // mesmos sorteios para os dois clones (média de 20 sementes para tirar a sorte da conta)
    let sumHi = 0, sumLo = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const hi = clone(p), lo = clone(p);
      hi.hid = [20, 10, 10, 10, 10, 10, 8];
      lo.hid = [1, 10, 10, 10, 10, 10, 8];
      setRngState(seed * 7919);
      for (let t = 0; t < 11; t++) monthlyDevelop(w, hi);
      setRngState(seed * 7919);
      for (let t = 0; t < 11; t++) monthlyDevelop(w, lo);
      sumHi += hi.ovr;
      sumLo += lo.ovr;
    }
    expect(sumHi).toBeGreaterThan(sumLo);
  });

  it("antigos ganchos de evolução não fazem mais nada", () => {
    const w = make(5);
    const before = JSON.stringify(w.players);
    const s = getRngState();
    midSeasonTick(w);
    for (const p of Object.values(w.players).slice(0, 50)) seasonEndDevelop(w, p, w.season);
    expect(JSON.stringify(w.players)).toBe(before);
    expect(getRngState()).toBe(s);
  });

  it("deriva controlada em 3 temporadas (semente 99)", () => {
    const w = make(99, "remo");
    const stats = [driftStats(w)];
    for (let s = 0; s < 3; s++) {
      playSeason(w);
      runEndOfSeason(w);
      stats.push(driftStats(w));
    }
    console.log("deriva:", stats.map((x) => `top16 ${x.top16.toFixed(2)} sub19 ${x.u19.toFixed(1)} n ${x.n}`).join(" → "));
    const last = stats[stats.length - 1];
    expect(last.top16).toBeGreaterThanOrEqual(74.5);
    expect(last.top16).toBeLessThanOrEqual(78.0);
    expect(last.u19).toBeGreaterThanOrEqual(58.0);
    expect(last.u19).toBeLessThanOrEqual(62.5);
    expect(last.n).toBeLessThan(9000);
    // a IA nunca ganha plano de treino nem treino individual
    for (const c of Object.values(w.clubs)) if (c.id !== w.userClubId) expect(c.train).toBeUndefined();
    for (const p of Object.values(w.players)) if (p.clubId !== w.userClubId && p.loan?.from !== w.userClubId) expect(p.tf).toBeUndefined();
  }, 300000);
});

describe("treino individual", () => {
  it("lateral de 22 anos aprende a jogar de zagueiro em até 6 meses", () => {
    const w = make(6);
    const club = w.clubs[w.userClubId];
    const p = generatePlayer(w, club, 66, 22, "LD");
    p.sec = [];
    p.pot = p.ovr;
    expect(setTrainFocus(w, p, { k: "pos", pos: "ZAG", prog: 0 })).toBeNull();
    const at0 = ovrAt(p, "ZAG");
    let learned = -1;
    const seen: number[] = [];
    for (let t = 1; t <= 6; t++) {
      monthlyTraining(w);
      seen.push(ovrAt(p, "ZAG"));
      if (p.sec.includes("ZAG") && learned < 0) learned = t;
    }
    expect(learned).toBeGreaterThan(0);
    expect(learned).toBeLessThanOrEqual(6);
    expect(seen[0]).toBeGreaterThan(at0);
    expect(w.news.some((n) => n.title.includes("aprendeu a jogar de Zagueiro"))).toBe(true);
  });

  it("recusa jogada que o jogador não pode aprender", () => {
    const w = make(7);
    const club = w.clubs[w.userClubId];
    const p = generatePlayer(w, club, 60, 24, "ZAG");
    p.attrs.fin = 30;
    p.traits = [];
    expect(setTrainFocus(w, p, { k: "trait", t: "MAT", prog: 0 })).not.toBeNull();
    expect(p.tf).toBeUndefined();
    expect(setTrainFocus(w, p, { k: "trait", t: "DEC", prog: 0 })).not.toBeNull();
    const gk = generatePlayer(w, club, 60, 24, "GOL");
    gk.traits = [];
    expect(setTrainFocus(w, gk, { k: "trait", t: "MUR", prog: 0 })).toBeNull();
    // jogador de outro clube não recebe treino
    const other = generatePlayer(w, w.clubs.palmeiras, 60, 24, "ZAG");
    expect(setTrainFocus(w, other, { k: "attr", a: "def" })).not.toBeNull();
  });

  it("lenda desperta uma jogada por vez conforme o overall", () => {
    const w = make(8, "santos");
    const p = spawnLegend(w, LEGEND_BY_ID.pele, w.clubs.santos);
    expect(p.traits).toEqual(["MAT"]);
    p.ovr = 79;
    p.pot = 97;
    p.attrs = { ...p.attrs, fin: 95, dri: 90, vel: 85, pas: 80, fis: 75 };
    monthlyTraining(w);
    expect(p.traits).toContain("DEC");
    expect(p.traits).not.toContain("DRI");
    expect(w.news.some((n) => n.kind === "legend" && n.title.includes("despertou"))).toBe(true);
  });

  it("foco do time só vale para o clube do usuário", () => {
    const w = make(9);
    const user = w.clubs[w.userClubId];
    expect(focusMods(user)).toEqual({ att: 1, def: 1, fatigue: 1, setPiece: 1, pen: 0 });
    user.train = { focus: "atk", int: 1 };
    expect(focusMods(user).att).toBeCloseTo(1.02);
    user.train = { focus: "tat", int: 1 };
    expect(tacticalChemBonus(user)).toBe(1);
    expect(focusMods(w.clubs.palmeiras)).toEqual({ att: 1, def: 1, fatigue: 1, setPiece: 1, pen: 0 });
  });
});
