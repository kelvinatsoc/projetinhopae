import { describe, expect, it } from "vitest";
import { ballTime, BALL_MPS, M_PER_PX, REAL_MS_PER_MIN, RUN_PX_S, sprintPx, timeScale } from "../src/ui/animTime";
import { pickSpecial, SPECIALS, specialsOf } from "../src/ui/specials";
import type { Player } from "../src/engine/types";

const mk = (o: Omit<Partial<Player>, "attrs"> & { attrs?: Partial<Player["attrs"]> } = {}): Player =>
  ({
    id: 7, name: "Fulano", pos: "ATA", height: 180, traits: [], face: { s: 3, r: "brown" },
    ...o,
    attrs: { vel: 70, fin: 70, pas: 65, dri: 65, def: 40, fis: 65, gol: 10, ...(o.attrs ?? {}) },
  }) as unknown as Player;

describe("ritmo realista da partida", () => {
  it("na 1x os jogadores correm em velocidade de gente", () => {
    const trot = RUN_PX_S * M_PER_PX;
    expect(trot).toBeGreaterThan(4);
    expect(trot).toBeLessThan(7);
    expect(sprintPx(40) * M_PER_PX).toBeCloseTo(6.3, 1);
    expect(sprintPx(95) * M_PER_PX).toBeLessThan(9);
  });
  it("passe de 20 m leva mais de um segundo, chute é bem mais rápido", () => {
    const px = 20 / M_PER_PX;
    expect(ballTime(px, BALL_MPS.pass)).toBeGreaterThan(1200);
    expect(ballTime(px, BALL_MPS.shot)).toBeLessThan(ballTime(px, BALL_MPS.pass) * 0.6);
  });
  it("velocidades maiores aceleram na proporção", () => {
    expect(timeScale(REAL_MS_PER_MIN)).toBe(1);
    expect(timeScale(REAL_MS_PER_MIN / 2)).toBe(2);
    expect(timeScale(REAL_MS_PER_MIN / 8)).toBe(8);
  });
});

describe("golpes especiais", () => {
  it("todos com nome em português e cores", () => {
    for (const s of SPECIALS) {
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.colors).toHaveLength(2);
    }
    expect(SPECIALS.map((s) => s.name)).toEqual(expect.arrayContaining(["Chute Trovão", "Folha Seca", "Bicicleta", "Cavadinha", "Chute de Trivela", "Canhão"]));
  });
  it("cada jogador tem golpes conforme atributos e jogadas", () => {
    expect(specialsOf(mk())).toHaveLength(0);
    expect(specialsOf(mk({ attrs: { fin: 88 } })).map((s) => s.id)).toContain("trovao");
    expect(specialsOf(mk({ traits: ["FAL"] })).map((s) => s.id)).toContain("folha-seca");
    expect(specialsOf(mk({ traits: ["CAB"] })).map((s) => s.id)).toContain("cabecada");
    expect(specialsOf(mk({ pos: "GOL", attrs: { gol: 82 } })).map((s) => s.id)).toContain("voo-gato");
  });
  it("escolha determinística, respeita tipo do chute, intervalo e teto", () => {
    const shooter = mk({ attrs: { fin: 90, dri: 85, pas: 80, fis: 80 } });
    const base = { shooter, keeper: undefined, kind: undefined, result: "goal" as const, xg: 0.4, lastMin: null, count: 0 };
    const picks = Array.from({ length: 90 }, (_, min) => pickSpecial({ ...base, min }));
    expect(picks.filter(Boolean).length).toBeGreaterThan(10);
    expect(pickSpecial({ ...base, min: 30 })).toEqual(pickSpecial({ ...base, min: 30 }));
    for (const p of picks) if (p) expect(p.def.role).toBe("shot");
    expect(pickSpecial({ ...base, min: 30, lastMin: 25 })).toBeNull();
    expect(pickSpecial({ ...base, min: 30, count: 4 })).toBeNull();
    expect(pickSpecial({ ...base, min: 30, result: "owngoal" })).toBeNull();
    for (let min = 0; min < 90; min++) {
      const h = pickSpecial({ ...base, min, kind: "header" });
      if (h) expect(h.def.id).not.toBe("bicicleta");
    }
  });
});
