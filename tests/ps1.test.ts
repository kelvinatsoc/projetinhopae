import { describe, expect, it } from "vitest";
import { CX, CY, PX0, PX1, PY0, PY1, pitchToWorld } from "../src/ui/pitchGeom";
import { BAYER4, ReplayBuffer, behindGoalCam, broadcastCam, facingAngle, hudAbbr, hudName, internalRes, lerpSnapshot, quant15, type Ps1Snapshot } from "../src/ui/ps1/model";
import { glyph, textWidth } from "../src/ui/ps1/font";

const snap = (now: number, x: number): Ps1Snapshot => ({
  now, players: [{ id: 0, side: 0, grp: 2, x, z: 0, vx: 0, vz: 0, walk: x, dive: -1, diveDir: 1, down: false, arms: false, sad: false, pose: null, poseS: 0, shirt: "#f00", sleeve: "#f00", pattern: "solid", stripe: "#000", shorts: "#fff", socks: "#f00", skin: "#c98d5b", hair: "#111", num: 9, name: "X" }],
  ball: { x, z: 0, h: 0 }, holder: 0, celebrating: false, goalSide: null, netShake: null, cheer: false,
});

describe("Retrô PS1", () => {
  it("converte o campinho para metros", () => {
    expect(pitchToWorld(CX, CY)).toEqual([0, 0]);
    expect(pitchToWorld(PX0, PY0)).toEqual([-52.5, -34]);
    expect(pitchToWorld(PX1, PY1)).toEqual([52.5, 34]);
  });

  it("resolução interna de 240 linhas, entre 4:3 e 2:1", () => {
    expect(internalRes(412, 309)).toMatchObject({ w: 320, h: 240 });
    expect(internalRes(1000, 200).w).toBe(480);
    expect(internalRes(300, 600).w).toBe(320);
  });

  it("quantiza para 15 bits com pontilhado", () => {
    for (const c of [0, 37, 128, 200, 255]) for (let x = 0; x < 4; x++) {
      const q = quant15(c, x, 1);
      expect(Math.abs(q - c)).toBeLessThanOrEqual(13);
      expect(Number.isInteger(Math.round((q * 31) / 255))).toBe(true);
    }
    expect(new Set(BAYER4).size).toBe(16);
  });

  it("câmera de transmissão segue a bola de lado e trava perto do fundo", () => {
    const a = broadcastCam(0, 0, 16 / 9), b = broadcastCam(60, 0, 16 / 9);
    expect(a.pos[2]).toBeGreaterThan(30);
    expect(a.pos[1]).toBeGreaterThan(15);
    expect(b.pos[0]).toBeLessThan(52.5);
    expect(b.pos[2]).toBeLessThan(a.pos[2]); // chega mais perto perto do gol
    expect(behindGoalCam(0, 40, 0).pos[0]).toBeGreaterThan(52.5);
    expect(behindGoalCam(1, -40, 0).pos[0]).toBeLessThan(-52.5);
  });

  it("buffer do replay guarda os últimos segundos e interpola", () => {
    const r = new ReplayBuffer(2, 30);
    for (let t = 0; t <= 5000; t += 10) r.push(snap(t, t / 100));
    const clip = r.clip();
    expect(clip[0].now).toBeGreaterThanOrEqual(2900);
    expect(clip.length).toBeLessThan(70);
    const mid = ReplayBuffer.at(clip, 500)!;
    expect(mid.ball.x).toBeCloseTo((clip[0].now + 500) / 100, 1);
    expect(lerpSnapshot(snap(0, 0), snap(10, 10), 0.5).players[0].x).toBe(5);
  });

  it("textos do HUD", () => {
    expect(hudName("Giorgian De Arrascaeta")).toBe("ARRASCAETA");
    expect(hudName("Gonçalo")).toBe("GONCALO");
    expect(hudAbbr("FLA", "Flamengo")).toBe("FLA");
    expect(hudAbbr("", "São Paulo")).toBe("SAO");
    expect(textWidth("AB")).toBe(11);
    expect(glyph("a")).toEqual(glyph("A"));
    expect(facingAngle(0, 0, 1.2)).toBe(1.2);
    expect(facingAngle(1, 0, 0)).toBeCloseTo(Math.PI / 2);
  });
});
