import { describe, expect, it } from "vitest";
import { chaseStep, RUN_PX_S } from "../src/ui/animTime";
import { easeCam } from "../src/ui/ps1/model";

/** Persegue um alvo que se move, com quadros de dt ms, por "total" ms. */
function run(hz: number, total = 3000) {
  const dt = 1000 / hz;
  let x = 0, y = 0, t = 0;
  while (t < total - 1e-6) {
    t += dt;
    const tx = 40 + 30 * Math.sin(t / 700), ty = 20 + 25 * Math.cos(t / 900);
    const dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
      const s = chaseStep(dist, dt, RUN_PX_S, 150);
      x += (dx / dist) * s;
      y += (dy / dist) * s;
    }
  }
  return [x, y];
}

describe("animação independe da taxa de quadros", () => {
  it("jogador chega ao mesmo lugar em 60, 90, 120 e 144 Hz", () => {
    const [x60, y60] = run(60);
    for (const hz of [90, 120, 144]) {
      const [x, y] = run(hz);
      expect(Math.hypot(x - x60, y - y60)).toBeLessThan(0.6);
    }
  });
  it("velocidade máxima é por segundo, não por quadro", () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a += chaseStep(1000, 1000 / 60, RUN_PX_S, 150);
    for (let i = 0; i < 120; i++) b += chaseStep(1000, 1000 / 120, RUN_PX_S, 150);
    expect(a).toBeCloseTo(RUN_PX_S, 5);
    expect(b).toBeCloseTo(RUN_PX_S, 5);
  });
  it("câmera PS1 suaviza igual em 60 e 120 Hz", () => {
    const to = { pos: [10, 5, 3] as [number, number, number], look: [0, 0, 0] as [number, number, number], fov: 40 };
    let a = { pos: [0, 0, 0] as [number, number, number], look: [0, 0, 0] as [number, number, number], fov: 30 };
    let b = a;
    for (let i = 0; i < 30; i++) a = easeCam(a, to, 1000 / 60, 380);
    for (let i = 0; i < 60; i++) b = easeCam(b, to, 1000 / 120, 380);
    expect(a.pos[0]).toBeCloseTo(b.pos[0], 6);
  });
});
