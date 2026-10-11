import { describe, expect, it } from "vitest";
import { CX, CY, PX0, PX1, PY0, PY1, pitchToWorld } from "../src/ui/pitchGeom";
import {
  ReplayBuffer, behindGoalCam, broadcastCam, clampFree, facingAngle, freeCamPose, freeFromPose, FREE_MAX, FREE_MIN,
  hudAbbr, hudName, lerpSnapshot, renderRes, type MatchSnapshot,
} from "../src/ui/match3d/model";
import { crowdExodus, crowdMood, isComeback, matchImportance } from "../src/ui/torcida";

const snap = (now: number, x: number): MatchSnapshot => ({
  now, players: [{ id: 0, side: 0, grp: 2, x, z: 0, vx: 0, vz: 0, walk: x, dive: -1, diveDir: 1, down: false, arms: false, sad: false, pose: null, poseS: 0, shirt: "#f00", sleeve: "#f00", pattern: "solid", stripe: "#000", shorts: "#fff", socks: "#f00", skin: "#c98d5b", hair: "#111", num: 9, name: "X" }],
  ball: { x, z: 0, h: 0 }, holder: 0, celebrating: false, goalSide: null, netShake: null, cheer: false,
});

describe("partida 3D: lógica pura", () => {
  it("converte o campinho para metros", () => {
    expect(pitchToWorld(CX, CY)).toEqual([0, 0]);
    expect(pitchToWorld(PX0, PY0)).toEqual([-52.5, -34]);
    expect(pitchToWorld(PX1, PY1)).toEqual([52.5, 34]);
  });

  it("resolução por qualidade (alta até 2x, baixa 1x, teto de largura)", () => {
    expect(renderRes(412, 412, 3.5, "alta").ratio).toBe(2);
    expect(renderRes(412, 412, 3.5, "media").ratio).toBe(1.5);
    expect(renderRes(412, 412, 3.5, "baixa").ratio).toBe(1);
    expect(renderRes(1600, 800, 2, "alta").w).toBeLessThanOrEqual(2000);
    expect(renderRes(412, 412, 3, "alta", 0.7).ratio).toBeCloseTo(1.4);
  });

  it("replay interpola os quadros gravados", () => {
    const b = new ReplayBuffer(5, 30);
    for (let t = 0; t <= 1000; t += 34) b.push(snap(t, t / 100));
    const clip = b.clip();
    expect(ReplayBuffer.duration(clip)).toBeGreaterThan(900);
    const mid = ReplayBuffer.at(clip, 500)!;
    expect(mid.ball.x).toBeCloseTo((clip[0].now + 500) / 100, 1);
    expect(lerpSnapshot(snap(0, 0), snap(100, 10), 0.5).players[0].x).toBe(5);
  });

  it("câmeras de TV e do replay olham para o lance", () => {
    const tv = broadcastCam(10, 0, 0.6);
    expect(tv.pos[1]).toBeGreaterThan(5);
    expect(tv.pos[2]).toBeGreaterThan(tv.look[2]);
    expect(behindGoalCam(0, 40, 0).pos[0]).toBeGreaterThan(52.5);
    expect(behindGoalCam(1, -40, 0).pos[0]).toBeLessThan(-52.5);
    expect(facingAngle(0, 1, 3)).toBeCloseTo(0);
    expect(facingAngle(0, 0, 3)).toBe(3);
  });

  it("câmera livre: do close ao estádio inteiro, sem passar do limite", () => {
    const f = clampFree({ yaw: 0, pitch: -1, dist: 1, panX: 500, panZ: -500 });
    expect(f.dist).toBe(FREE_MIN);
    expect(f.pitch).toBeGreaterThan(0);
    expect(f.panX).toBe(70);
    const far = clampFree({ yaw: 0, pitch: 0.1, dist: 9999, panX: 0, panZ: 0 });
    expect(far.dist).toBe(FREE_MAX);
    // de longe a câmera sobe acima das arquibancadas
    expect(freeCamPose(far, 0, 0).pos[1]).toBeGreaterThan(55);
    // volta da pose de TV sem pulo
    const tv = { pos: [3, 10, 20] as [number, number, number], look: [0, 0.4, 0] as [number, number, number], fov: 40 };
    const back = freeCamPose(freeFromPose(tv), 0, 0);
    expect(Math.hypot(back.pos[0] - tv.pos[0], back.pos[2] - tv.pos[2])).toBeLessThan(3);
  });

  it("nomes e siglas do placar", () => {
    expect(hudName("Giorgian de Arrascaeta")).toBe("ARRASCAETA");
    expect(hudAbbr(undefined, "São Paulo")).toBe("SAO");
  });
});

describe("torcida reativa", () => {
  it("vai embora na goleada, mais quanto pior e mais tarde", () => {
    expect(crowdExodus([0, 2], 0, 80)).toBe(0);
    expect(crowdExodus([1, 3], 0, 80)).toBe(0);
    const a = crowdExodus([0, 3], 0, 40);
    const b = crowdExodus([0, 3], 0, 85);
    const c = crowdExodus([0, 5], 0, 85);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(crowdExodus([0, 9], 0, 90)).toBeLessThanOrEqual(0.85);
    // 0x4 já esvazia; o lado que está ganhando não sai
    expect(crowdExodus([0, 4], 0, 30)).toBeGreaterThan(0);
    expect(crowdExodus([0, 4], 1, 90)).toBe(0);
  });

  it("vaia na goleada e reconhece a virada", () => {
    expect(crowdMood({ minute: 60, goals: [0, 3], poss: [10, 10], shots: [2, 8], atk: 1, streak: 0 }, 0, 0.8).boo).toBe(true);
    expect(isComeback(0, 1, -1)).toBe(true);
    expect(isComeback(0, 1, 0)).toBe(false);
    expect(isComeback(1, 2, -2)).toBe(false);
  });

  it("importância: final de Libertadores > clássico > rodada comum", () => {
    const comum = matchImportance({ stage: "league", comp: "brA", derby: 0, size: 0.5 });
    const classico = matchImportance({ stage: "league", comp: "brA", derby: 3, size: 0.5 });
    const final = matchImportance({ stage: "final", comp: "liberta", derby: 0, size: 0.9 });
    expect(classico).toBeGreaterThan(comum);
    expect(final).toBeGreaterThan(classico);
    expect(final).toBeLessThanOrEqual(1);
  });
});

import { stepMotion, type Motion } from "../src/ui/match3d/player";

describe("movimento natural dos jogadores", () => {
  const run = (hz: number) => {
    const m: Motion = { x: 0, z: 0, vx: 0, vz: 0, phase: 0, turn: 0 };
    let maxJump = 0;
    for (let t = 0; t < 3000; t += 1000 / hz) {
      const tx = Math.min(20, t / 150), tz = t > 1500 ? 6 : 0; // corre e muda de direção de repente
      const x0 = m.x, z0 = m.z;
      stepMotion(m, tx, tz, 1000 / hz);
      maxJump = Math.max(maxJump, Math.hypot(m.x - x0, m.z - z0) * hz); // m/s
    }
    return { m, maxJump };
  };
  it("sem teletransporte: velocidade nunca passa de um sprint humano", () => {
    expect(run(60).maxJump).toBeLessThanOrEqual(9.01);
  });
  it("independe da taxa de quadros (60 x 120 Hz)", () => {
    const a = run(60).m, b = run(120).m;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.3);
  });
  it("a passada acompanha a distância (sem patinar) e parado não anda", () => {
    const m: Motion = { x: 0, z: 0, vx: 0, vz: 0, phase: 0, turn: 0 };
    for (let i = 0; i < 120; i++) stepMotion(m, 0, 0, 16);
    expect(m.phase).toBeCloseTo(0);
    for (let i = 0; i < 120; i++) stepMotion(m, i * 0.08, 0, 16);
    expect(m.phase).toBeGreaterThan(Math.PI);
  });
});
