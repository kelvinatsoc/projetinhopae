import { describe, expect, it } from "vitest";
import { celebrationFor, heightBucket, lookOf, playStyle, shotStyle } from "../src/ui/matchSprites";
import { CineScene, phasesOf, totalOf, wantsCinematic, type CineSpec } from "../src/ui/cinematics";
import type { Player } from "../src/engine/types";

function mk(over: Omit<Partial<Player>, "attrs"> & { attrs?: Partial<Player["attrs"]> } = {}): Player {
  const attrs = { vel: 60, fin: 60, pas: 60, dri: 60, def: 60, fis: 60, gol: 20, ...(over.attrs ?? {}) };
  return { id: 7, pos: "MC", height: 180, face: { s: 1234, r: "brown" }, shirt: 10, traits: [], ...over, attrs } as unknown as Player;
}

describe("aparência e estilo dos jogadores", () => {
  it("porte pela altura", () => {
    expect(heightBucket(168)).toBe(-1);
    expect(heightBucket(181)).toBe(0);
    expect(heightBucket(192)).toBe(1);
    expect(heightBucket(undefined)).toBe(0);
  });

  it("estilo de jogo derivado de posição, atributos e jogadas", () => {
    expect(playStyle(mk({ pos: "GOL" }))).toBe("keeper");
    expect(playStyle(mk({ pos: "PE", attrs: { dri: 85, vel: 80 } }))).toBe("dribbler");
    expect(playStyle(mk({ pos: "ATA", height: 192, attrs: { fis: 80 } }))).toBe("target");
    expect(playStyle(mk({ pos: "PD", attrs: { vel: 90, dri: 60 } }))).toBe("speedster");
    expect(playStyle(mk({ pos: "VOL", attrs: { fis: 85 } }))).toBe("engine");
    expect(playStyle(mk({ pos: "ZAG", traits: ["CAB"] }))).toBe("target");
    expect(playStyle(mk())).toBe("normal");
  });

  it("visual determinístico, com número da camisa", () => {
    const p = mk({ height: 193, attrs: { fis: 82 } });
    const a = lookOf(p), b = lookOf(p);
    expect(a).toEqual(b);
    expect(a.tall).toBe(1);
    expect(a.broad).toBe(true);
    expect(a.num).toBe(10);
    expect(lookOf(mk({ shirt: undefined })).num).toBeGreaterThan(0);
  });

  it("estilo do chute é estável e respeita cabeçada/falta", () => {
    const p = mk({ pos: "ATA", attrs: { dri: 80, fin: 82 } });
    expect(shotStyle(p, "header", 30)).toBe("header");
    expect(shotStyle(p, "freekick", 30)).toBe("freekick");
    expect(shotStyle(p, undefined, 44, "goal")).toBe(shotStyle(p, undefined, 44, "goal"));
    const seen = new Set<string>();
    for (let m = 1; m <= 90; m++) seen.add(shotStyle(p, undefined, m, "goal"));
    expect(seen.size).toBeGreaterThanOrEqual(4);
    for (let m = 1; m <= 90; m++) expect(["power", "curl"]).toContain(shotStyle(p, "long", m));
  });

  it("comemorações variadas", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(celebrationFor(mk({ id: i, attrs: { dri: 70 } }), i));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("lance decisivo", () => {
  const ask = { penalty: false, xg: 0.1, min: 30, lastMin: null, seed: 5 };
  it("todo gol e pênalti vira cena; gol contra não", () => {
    expect(wantsCinematic({ ...ask, outcome: "goal" })).toBe(true);
    expect(wantsCinematic({ ...ask, outcome: "miss", penalty: true, lastMin: 29 })).toBe(true);
    expect(wantsCinematic({ ...ask, outcome: "goal", ownGoal: true })).toBe(false);
  });
  it("chance perdida comum não vira cena e há intervalo entre cenas", () => {
    expect(wantsCinematic({ ...ask, outcome: "miss", xg: 0.05 })).toBe(false);
    expect(wantsCinematic({ ...ask, outcome: "post", xg: 0.5, lastMin: 27 })).toBe(false);
    expect(wantsCinematic({ ...ask, outcome: "post", xg: 0.5, lastMin: 10 })).toBe(true);
  });

  const actor = {
    look: lookOf(mk()),
    kit: { shirt: "#cc0000", sleeve: "#cc0000", shorts: "#ffffff", socks: "#cc0000", pattern: "solid" as const, stripe: "#fff" },
    name: "Fulano",
  };
  const spec: CineSpec = {
    outcome: "goal", style: "curl", shooter: actor, keeper: actor, defender: actor, color: "#c00", defColor: "#00c",
    dribble: true, celebration: "knee", title: "Lance decisivo", seed: 9,
  };

  it("fases em ordem, com drible e câmera lenta", () => {
    const ph = phasesOf(spec);
    expect(ph.map((p) => p.name)).toEqual(["banner", "dribble", "approach", "strike", "flight", "outcome"]);
    expect(phasesOf({ ...spec, dribble: false }).map((p) => p.name)).not.toContain("dribble");
    expect(totalOf(ph)).toBeGreaterThan(3000);
    expect(totalOf(ph)).toBeLessThan(9000);
  });

  it("a cena avança, pode ser pulada e reprisada", () => {
    const sc = new CineScene(spec);
    expect(sc.done).toBe(false);
    for (let i = 0; i < 1000 && !sc.done; i++) sc.update(16);
    expect(sc.done).toBe(true);
    sc.restart(true);
    expect(sc.done).toBe(false);
    expect(sc.replay).toBe(true);
    expect(sc.phase().p.name).toBe("dribble");
    sc.skip();
    expect(sc.done).toBe(true);
  });

  it("bola termina no alvo certo para cada desfecho", () => {
    for (const outcome of ["goal", "save", "post", "miss"] as const) {
      const sc = new CineScene({ ...spec, outcome });
      const end = sc.ballPos("flight", 1);
      expect(Number.isFinite(end.x) && Number.isFinite(end.y)).toBe(true);
      if (outcome === "goal") expect(end.y).toBeGreaterThan(20);
    }
  });
});
