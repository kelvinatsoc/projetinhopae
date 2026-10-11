import { describe, expect, it } from "vitest";
import db from "../src/data/database.json";
import { MatchSim } from "../src/engine/match";
import { activePowers, aiPowers, buyPower, POWER_SLOTS, POWERS } from "../src/engine/powers";
import { setRngState } from "../src/engine/rng";
import type { Fixture, World } from "../src/engine/types";
import { createWorld, type Database } from "../src/engine/world";

const fresh = (): World => createWorld(db as Database, { managerName: "Teste", clubId: "flamengo", seed: 99 });
const fx = (w: World, id: number): Fixture => ({ id, comp: "serieA", stage: "league", round: 1, day: w.day, home: "flamengo", away: "bahia" });

describe("Loja de Poderes", () => {
  it("compra com dinheiro do clube, respeita vagas, posição e saldo", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    c.balance = 100_000_000;
    const gk = c.players.map((id) => w.players[id]).find((p) => p.pos === "GOL")!;
    const out = c.players.map((id) => w.players[id]).filter((p) => p.pos !== "GOL");
    expect(buyPower(w, c, "muralha", out[0].id).ok).toBe(false); // muralha só goleiro
    expect(buyPower(w, c, "trovao", gk.id).ok).toBe(false); // trovão não vai no goleiro
    const before = c.balance;
    expect(buyPower(w, c, "trovao", out[0].id).ok).toBe(true);
    expect(c.balance).toBe(before - POWERS.find((p) => p.id === "trovao")!.price);
    expect(buyPower(w, c, "fantasma", out[0].id).ok).toBe(false); // um poder por jogador
    buyPower(w, c, "muralha", gk.id);
    buyPower(w, c, "fantasma", out[1].id);
    expect(activePowers(w, c).length).toBe(POWER_SLOTS);
    expect(buyPower(w, c, "fulminante", out[2].id).ok).toBe(false); // sem vagas
    // vale só nesta temporada
    expect(activePowers({ ...w, season: w.season + 1 }, c).length).toBe(0);
    // sem saldo
    const w2 = fresh();
    w2.clubs.flamengo.balance = 0;
    expect(buyPower(w2, w2.clubs.flamengo, "teleguiado", out[3].id).ok).toBe(false);
  });

  it("a IA só usa poderes quando o usuário também tem (e no máximo um)", () => {
    const w = fresh();
    expect(aiPowers(w, w.clubs.palmeiras, false)).toEqual([]);
    expect(aiPowers(w, w.clubs.palmeiras, true).length).toBeLessThanOrEqual(1);
  });

  it("medidor enche, o usuário ativa e a jogada vira finalização com bônus", () => {
    const w = fresh();
    const c = w.clubs.flamengo;
    c.balance = 100_000_000;
    setRngState(w.rng);
    const sim = new MatchSim(w, fx(w, 990011), { live: true, userSide: 0 });
    const starter = sim.sides[0].onPitch.find((id, k) => id != null && sim.sides[0].slots[k] !== "GOL")!;
    buyPower(w, c, "trovao", starter);
    expect(sim.powerState(0)[0].ready).toBe(false);
    let guard = 0;
    while (!sim.powerState(0)[0]?.ready && guard++ < 60) sim.step();
    expect(sim.powerState(0)[0].ready).toBe(true);
    expect(sim.activatePower(0, starter)).toBe(true);
    expect(sim.activatePower(0, starter)).toBe(false); // carga zerou
    const shots0 = sim.stats.shots[0];
    sim.step();
    expect(sim.stats.shots[0]).toBe(shots0 + 1);
    expect(sim.phase.shot?.power).toBe("trovao");
    expect(sim.phase.shot!.xg).toBeGreaterThanOrEqual(0.08);
  });

  it("efeito moderado: muitos jogos com poderes ganham um pouco mais de gols, sem exagero", () => {
    const goals = (withPower: boolean) => {
      let g = 0;
      for (let i = 0; i < 40; i++) {
        const w = fresh();
        const c = w.clubs.flamengo;
        c.balance = 100_000_000;
        setRngState(1000 + i);
        const sim = new MatchSim(w, fx(w, 991000 + i), { live: false, userSide: 0 });
        if (withPower) buyPower(w, c, "trovao", sim.sides[0].onPitch.find((id, k) => id != null && sim.sides[0].slots[k] !== "GOL")!);
        sim.runToEnd();
        g += sim.sides[0].goals;
      }
      return g / 40;
    };
    const base = goals(false), boosted = goals(true);
    expect(boosted).toBeGreaterThanOrEqual(base - 0.3);
    expect(boosted - base).toBeLessThan(1.2);
  }, 120_000);
});
