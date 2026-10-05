import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { generatePlayer } from "../src/engine/player";
import { setRngState } from "../src/engine/rng";
import { knowledgeOf, potRange, pruneScouting, queueScout, scoutTick, startMission } from "../src/engine/scouting";
import { createWorld, type Database } from "../src/engine/world";

const make = (seed: number, clubId = "flamengo") => createWorld(db as Database, { managerName: "T", clubId, seed });

describe("olheiros: névoa do potencial", () => {
  const w = make(21);

  it("seus jogadores têm faixa estreita; estrangeiros desconhecidos, larga", () => {
    const own = w.clubs[w.userClubId].players.map((id) => w.players[id]);
    for (const p of own) {
      const [lo, hi] = potRange(w, p);
      expect(hi - lo).toBeLessThanOrEqual(2);
    }
    const foreign = Object.values(w.players).filter((p) => p.clubId && w.clubs[p.clubId].div === "F" && !p.youth && !p.legend && p.pot - p.ovr >= 10 && p.pot <= 85);
    expect(foreign.length).toBeGreaterThan(0);
    for (const p of foreign.slice(0, 50)) {
      expect(knowledgeOf(w, p)).toBe(15);
      const [lo, hi] = potRange(w, p);
      expect(hi - lo).toBeGreaterThanOrEqual(12);
    }
  });

  it("a faixa sempre contém o potencial real", () => {
    const list = Object.values(w.players).slice(0, 2000);
    for (const p of list) {
      const [lo, hi] = potRange(w, p);
      expect(lo).toBeLessThanOrEqual(p.pot);
      expect(hi).toBeGreaterThanOrEqual(p.pot);
    }
  });
});

describe("olheiros: fila e missões", () => {
  it("observação completa em 30 dias com relatório", () => {
    const w = make(22);
    const p = Object.values(w.players).find((x) => x.clubId && w.clubs[x.clubId].div === "F" && !x.youth)!;
    expect(queueScout(w, p)).toBeNull();
    for (let d = 0; d < 30; d++) { w.day++; scoutTick(w); }
    expect(knowledgeOf(w, p)).toBe(100);
    expect(w.scout!.queue).not.toContain(p.id);
    expect(w.news.some((n) => n.kind === "scout" && n.title.includes(p.name) && n.title.includes("Recomendação"))).toBe(true);
    const [lo, hi] = potRange(w, p);
    expect(hi - lo).toBeLessThanOrEqual(2);
  });

  it("fila cheia avisa", () => {
    const w = make(23);
    const list = Object.values(w.players).filter((x) => x.clubId && w.clubs[x.clubId].div === "F").slice(0, 4);
    expect(queueScout(w, list[0])).toBeNull();
    expect(queueScout(w, list[1])).toBeNull();
    expect(queueScout(w, list[2])).toBeNull();
    expect(queueScout(w, list[3])).toContain("ocupados (3/3)");
  });

  it("missão encontra jogadores a cada 7 dias e cobra a despesa", () => {
    const w = make(24);
    const user = w.clubs[w.userClubId];
    const bal = user.balance;
    expect(startMission(w, "arg", "young", 30)).toBeNull();
    expect(user.finance.expense.scout).toBeGreaterThan(0);
    expect(user.balance).toBeLessThan(bal);
    setRngState(1);
    const sizes: number[] = [];
    for (let d = 0; d < 31; d++) { w.day++; scoutTick(w); sizes.push(w.scout!.recs.length); }
    expect(sizes[5]).toBe(0);
    expect(sizes[6]).toBeGreaterThan(0);
    expect(sizes[13]).toBeGreaterThan(sizes[6]);
    for (const id of w.scout!.recs) {
      const p = w.players[id];
      expect(w.clubs[p.clubId!].country).toBe("ARG");
      expect(w.season - p.born).toBeLessThanOrEqual(21);
      expect(knowledgeOf(w, p)).toBeGreaterThanOrEqual(60);
    }
    expect(w.scout!.missions.length).toBe(0); // encerrou depois de 30 dias
    expect(w.news.some((n) => n.title.startsWith("Missão em Argentina encerrada"))).toBe(true);
  });

  it("limpeza remove jogadores que saíram do mundo", () => {
    const w = make(25);
    const p = generatePlayer(w, w.clubs.palmeiras, 60, 20);
    queueScout(w, p);
    w.scout!.recs.push(p.id);
    w.clubs.palmeiras.players = w.clubs.palmeiras.players.filter((id) => id !== p.id);
    delete w.players[p.id];
    pruneScouting(w);
    expect(w.scout!.k[p.id]).toBeUndefined();
    expect(w.scout!.queue).not.toContain(p.id);
    expect(w.scout!.recs).not.toContain(p.id);
  });
});
