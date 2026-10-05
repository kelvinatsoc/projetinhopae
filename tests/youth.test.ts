import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { advance, finishUserMatch, loadRng, saveRng } from "../src/engine/game";
import { simulateFixture } from "../src/engine/match";
import { validateWorld } from "../src/engine/integrity";
import { clamp, chance, gauss, randInt, setRngState } from "../src/engine/rng";
import type { Player, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";
import { intakeForClub, peneiraTick, previewIntake, resolvePeneira, youthCap, youthCount, youthIntake } from "../src/engine/youth";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

describe("base: safra", () => {
  it("nas notas padrão a safra tem as mesmas médias da fórmula antiga", () => {
    const w = make(11);
    const club = Object.values(w.clubs).find((c) => c.id !== w.userClubId && c.youthLevel === 3 && c.div === "B")!;
    setRngState(2024);
    const kids: Player[] = [];
    while (kids.length < 2000) kids.push(...intakeForClub(w, club));
    // fórmula antiga
    const old = { ovr: [] as number[], pot: [] as number[] };
    for (let i = 0; i < 2000; i++) {
      const ageY = randInt(15, 17);
      const ovr = clamp(Math.round(38 + 3 * 2.5 + (ageY - 15) * 3 + gauss(0, 4)), 30, 70);
      let pot = Math.round(ovr + 14 + 3 * 3 + gauss(0, 7));
      if (chance(0.03)) pot += 8;
      old.ovr.push(ovr);
      old.pot.push(clamp(pot, ovr + 5, 92));
    }
    const nOvr = mean(kids.map((k) => k.ovr)), nPot = mean(kids.map((k) => k.pot));
    console.log(`safra: ovr ${nOvr.toFixed(2)} vs ${mean(old.ovr).toFixed(2)} · pot ${nPot.toFixed(2)} vs ${mean(old.pot).toFixed(2)}`);
    expect(Math.abs(nOvr - mean(old.ovr))).toBeLessThanOrEqual(1);
    expect(Math.abs(nPot - mean(old.pot))).toBeLessThanOrEqual(1);
  });

  it("safra dourada é bem melhor que a fraca", () => {
    const w = make(12);
    const club = w.clubs[w.userClubId];
    club.youthLevel = 3; club.youthFac = 3; club.youthCoach = 3;
    const pots = (q: "dourada" | "fraca") => {
      const out: number[] = [];
      for (let i = 0; i < 120; i++) {
        w.intakeForce = q;
        out.push(...intakeForClub(w, club, { pending: true }).map((k) => k.pot));
        w.peneira = undefined;
      }
      return mean(out);
    };
    const d = pots("dourada"), f = pots("fraca");
    console.log(`dourada ${d.toFixed(1)} · fraca ${f.toFixed(1)}`);
    expect(d - f).toBeGreaterThanOrEqual(8);
    expect(w.intakeForce).toBeUndefined();
  });

  it("a safra da IA não muda com o relatório do usuário", () => {
    const a = make(13), b = make(13);
    b.season = a.season;
    b.intakePreview = { season: b.season, q: "dourada", shown: "dourada", pos: "ATA" };
    b.clubs[b.userClubId].youthCoach = 5;
    for (const w of [a, b]) { w.day = 25; setRngState(99); youthIntake(w); }
    const ai = (w: World) => JSON.stringify(Object.values(w.players).filter((p) => p.clubId !== w.userClubId).map((p) => [p.id, p.name, p.ovr, p.pot]));
    expect(ai(a)).toBe(ai(b));
    expect(b.peneira!.kids.length).toBeGreaterThan(0);
  });

  it("relatório do coordenador é determinístico e não mexe no sorteio", () => {
    const w = make(14);
    previewIntake(w);
    const first = JSON.stringify(w.intakePreview);
    previewIntake(w);
    expect(JSON.stringify(w.intakePreview)).toBe(first);
    expect(w.intakePreview!.season).toBe(w.season + 1);
    expect(w.news[0].title).toContain("Relatório da base");
  });
});

describe("base: dia da peneira", () => {
  it("garotos da peneira ficam fora do mundo até serem assinados", () => {
    const w = make(15);
    w.day = 25;
    setRngState(5);
    youthIntake(w);
    const pn = w.peneira!;
    expect(pn.kids.length).toBeGreaterThan(0);
    for (const k of pn.kids) {
      expect(w.players[k.id]).toBeUndefined();
      for (const c of Object.values(w.clubs)) expect(c.players.includes(k.id)).toBe(false);
      expect(w.nextPid).toBeGreaterThan(k.id);
    }
    expect(validateWorld(w)).toEqual([]);
  });

  it("assinar respeita as vagas e a peneira esquecida se resolve em 30 dias", () => {
    const w = make(16);
    const club = w.clubs[w.userClubId];
    w.day = 25;
    youthIntake(w);
    const cap = youthCap(club);
    // lota a base: só cabe um garoto
    const free = cap - youthCount(w, club);
    const extra = Object.values(w.players).filter((p) => !p.clubId && !p.legend).slice(0, Math.max(0, free - 1));
    for (const p of extra) { p.clubId = club.id; p.youth = true; club.players.push(p.id); }
    expect(youthCount(w, club)).toBe(cap - 1);
    const ids = w.peneira!.kids.map((k) => k.id);
    resolvePeneira(w, ids, []);
    expect(youthCount(w, club)).toBe(cap);
    expect(w.peneira!.kids.length).toBe(ids.length - 1);
    expect(validateWorld(w)).toEqual([]);
    // 29 dias depois ainda espera; no 30º resolve sozinha
    w.day = 25 + 29; peneiraTick(w);
    expect(w.peneira).toBeDefined();
    w.day = 25 + 30; peneiraTick(w);
    expect(w.peneira).toBeUndefined();
    expect(youthCount(w, club)).toBeLessThanOrEqual(cap);
    expect(validateWorld(w)).toEqual([]);
    expect(w.news.some((n) => n.title.startsWith("🌱 Peneira encerrada"))).toBe(true);
  });

  it("no jogo normal a peneira aparece no fim de janeiro", () => {
    const w = make(17);
    // joga as partidas do usuário no caminho até passar do dia 25
    for (let i = 0; i < 20 && w.day <= 25; i++) {
      const r = advance(w, 26 - w.day);
      if (r.reason === "match" && r.fixture) {
        loadRng(w);
        const res = simulateFixture(w, r.fixture);
        saveRng(w);
        finishUserMatch(w, r.fixture, res);
      }
    }
    expect(w.peneira?.kids.length ?? 0).toBeGreaterThan(0);
    expect(validateWorld(w)).toEqual([]);
  });
});
